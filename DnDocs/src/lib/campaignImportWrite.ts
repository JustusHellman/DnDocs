/**
 * Writes an import plan (see campaignImport.ts) to Firestore, and can take it out again.
 *
 * Why single writes rather than one big batch: the security rules look up the campaign document
 * for every write, and Firestore caps those look-ups per batch (20). A few hundred entries would
 * fail halfway. Because every id is derived from the pack, an interrupted import can simply be
 * run again; it carries on where it stopped and never duplicates anything.
 */
import { collection, deleteDoc, doc, getDocFromServer, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Entity, Relationship } from '../types';
import { isPackEntityId, isPackRelationshipId, type ImportPlan } from './campaignImport';

export type ImportMode = 'skip' | 'update';

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  relationshipsCreated: number;
  relationshipsSkipped: number;
  failed: { id: string; name: string; error: string }[];
}

const CONCURRENCY = 6;

async function pool<T>(items: T[], worker: (item: T) => Promise<void>, onTick?: () => void): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
      onTick?.();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      // Permission problems won't fix themselves; everything else (network blips) might.
      if (/permission|PERMISSION/.test(errText(e))) break;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

/** The fields an "update" overwrites. Who can see the entry, images and map pins are never touched. */
function updatableFields(e: Entity) {
  return {
    name: e.name,
    content: e.content,
    tags: e.tags,
    locationId: e.locationId ?? null,
    gender: e.gender ?? null,
    attributes: e.attributes ?? {},
    statBlock: e.statBlock ?? null,
    dndStats: e.dndStats ?? null,
    dmNotes: e.dmNotes ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export async function runImport(
  plan: ImportPlan,
  opts: { mode: ImportMode; campaignId: string; onProgress?: (done: number, total: number) => void },
): Promise<ImportSummary> {
  if (!plan.ok) throw new Error('This pack has errors and can\'t be imported.');
  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, relationshipsCreated: 0, relationshipsSkipped: 0, failed: [] };
  const total = plan.entities.length + plan.relationships.length;
  let done = 0;
  const tick = () => opts.onProgress?.(++done, total);

  // Entries first, so every link has something to point at.
  await pool(
    plan.entities,
    async (entity) => {
      try {
        const ref = doc(db, 'entities', entity.id);
        // Ask the server, not the local cache, so an old offline copy can't hide an existing entry.
        const existing = await withRetry(() => getDocFromServer(ref));
        if (existing.exists()) {
          const data = existing.data() as Entity;
          if (data.campaignId !== opts.campaignId) throw new Error('An entry with this id belongs to another campaign.');
          if (opts.mode === 'update') {
            await withRetry(() => updateDoc(ref, updatableFields(entity)));
            summary.updated++;
          } else summary.skipped++;
        } else {
          await withRetry(() => setDoc(ref, entity));
          summary.created++;
        }
      } catch (e) {
        summary.failed.push({ id: entity.id, name: entity.name, error: errText(e) });
      }
    },
    tick,
  );

  // Links: only between entries that exist now; never overwrite one the DM has edited.
  const failedIds = new Set(summary.failed.map((f) => f.id));
  await pool(
    plan.relationships,
    async (rel) => {
      if (failedIds.has(rel.sourceId) || failedIds.has(rel.targetId)) {
        summary.failed.push({ id: rel.id, name: `${rel.label} → ${rel.targetName}`, error: 'Skipped because one of its entries failed.' });
        return;
      }
      try {
        const ref = doc(db, 'relationships', rel.id);
        const existing = await withRetry(() => getDocFromServer(ref));
        if (existing.exists()) summary.relationshipsSkipped++;
        else {
          await withRetry(() => setDoc(ref, rel));
          summary.relationshipsCreated++;
        }
      } catch (e) {
        summary.failed.push({ id: rel.id, name: `${rel.label} → ${rel.targetName}`, error: errText(e) });
      }
    },
    tick,
  );
  return summary;
}

export interface RemovalSummary {
  entities: number;
  relationships: number;
  detached: number;
  failed: number;
}

/**
 * Takes a pack back out: deletes every entry and link that came from it. Entries the DM added
 * themselves are never deleted; if one was placed inside a pack entry it is moved to the top level.
 */
export async function removePack(packId: string, campaignId: string, current: { entities: Entity[] }): Promise<RemovalSummary> {
  const mine = current.entities.filter((e) => isPackEntityId(packId, e.id));
  const mineIds = new Set(mine.map((e) => e.id));
  const orphans = current.entities.filter((e) => !mineIds.has(e.id) && e.locationId && mineIds.has(e.locationId));
  // Query the links directly (the local list can be stale): the pack's own, plus any the DM
  // added by hand that touch a pack entry, which would dangle once the entry is gone.
  const relSnap = await getDocs(query(collection(db, 'relationships'), where('campaignId', '==', campaignId)));
  const rels = relSnap.docs
    .filter((d) => {
      const r = d.data() as Relationship;
      return isPackRelationshipId(packId, d.id) || mineIds.has(r.sourceId) || mineIds.has(r.targetId);
    })
    .map((d) => d.id);

  const out: RemovalSummary = { entities: 0, relationships: 0, detached: 0, failed: 0 };
  await pool(orphans, async (e) => {
    try {
      await withRetry(() => updateDoc(doc(db, 'entities', e.id), { locationId: null, updatedAt: new Date().toISOString() }));
      out.detached++;
    } catch {
      out.failed++;
    }
  });
  await pool(rels, async (id) => {
    try {
      await withRetry(() => deleteDoc(doc(db, 'relationships', id)));
      out.relationships++;
    } catch {
      out.failed++;
    }
  });
  await pool(mine, async (e) => {
    try {
      await withRetry(() => deleteDoc(doc(db, 'entities', e.id)));
      out.entities++;
    } catch {
      out.failed++;
    }
  });
  return out;
}
