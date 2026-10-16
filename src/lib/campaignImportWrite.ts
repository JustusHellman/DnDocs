/**
 * Writes an import plan (see campaignImport.ts) to Firestore, and can take it out again.
 *
 * Writes cost: the free plan allows 20,000 a day. So the import first loads what's already there
 * (two queries) and only writes what is new or actually different. Re-importing an edited pack
 * writes just the entries you changed, not all of them again.
 *
 * Why single writes rather than one big batch: the security rules look up the campaign document
 * for every write, and Firestore caps those look-ups per batch (20). A few hundred entries would
 * fail halfway. Because every id is derived from the pack, an interrupted import can simply be
 * run again; it carries on where it stopped and never duplicates anything.
 */
import { collection, deleteDoc, doc, getDocFromServer, getDocs, getDocsFromServer, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { syncStamp, writeResyncHint } from './sync';
import { campaignUsesBundles, fetchLinks, writeLinks } from './links';
import type { Entity, MapPin, Relationship } from '../types';
import { isPackEntityId, isPackMediaId, isPackRelationshipId, type ImportPlan } from './campaignImport';

export type ImportMode = 'skip' | 'update';

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  /** Already identical to the pack: nothing written. */
  unchanged: number;
  relationshipsUpdated: number;
  /** Pack links no longer in the pack (refresh mode). */
  relationshipsRemoved: number;
  /** Pack entries no longer in the pack (refresh mode, when asked). */
  removed: number;
  relationshipsCreated: number;
  relationshipsSkipped: number;
  mapsSet: number;
  mapsSkipped: number;
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

/** Order-independent comparison of plain data (undefined, null and missing count as the same). */
function canon(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined && o[k] !== null)
        .sort()
        .map((k) => [k, canon(o[k])]),
    );
  }
  return v;
}
export const sameData = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** Would an update change anything the DM can see? (`updatedAt` doesn't count.) */
export function needsUpdate(entity: Entity, existing: Entity): boolean {
  const { updatedAt: _a, ...next } = updatableFields(entity, existing);
  const cur = Object.fromEntries(Object.keys(next).map((k) => [k, (existing as unknown as Record<string, unknown>)[k]]));
  return !sameData(next, cur);
}

/**
 * The fields an "update" overwrites. Who can see the entry and its images are never touched, and neither are
 * fields the DM has already chosen to show or hide (only the pack's defaults for fields not decided yet are added).
 */
function updatableFields(e: Entity, existing: Entity) {
  return {
    fieldPermissions: { ...(e.fieldPermissions ?? {}), ...(existing.fieldPermissions ?? {}) },
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
  opts: {
    mode: ImportMode;
    campaignId: string;
    /** Refresh mode: also delete this pack's entries that are no longer in the pack file. */
    removeMissing?: boolean;
    /** Links in bundle documents (default: whatever the campaign uses). */
    bundles?: boolean;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<ImportSummary> {
  if (!plan.ok) throw new Error('This pack has errors and can\'t be imported.');
  const summary: ImportSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    unchanged: 0,
    relationshipsCreated: 0,
    relationshipsSkipped: 0,
    relationshipsUpdated: 0,
    relationshipsRemoved: 0,
    removed: 0,
    mapsSet: 0,
    mapsSkipped: 0,
    failed: [],
  };
  const total = plan.entities.length + plan.relationships.length + plan.maps.length;
  let done = 0;
  const tick = () => opts.onProgress?.(++done, total);

  // What's already there, in two queries (from the server, not the local cache, so an old offline
  // copy can't hide an existing entry). One query instead of a look-up per entry.
  // Ask the server which storage the campaign uses (a move may have happened since this page loaded).
  const bundles = opts.bundles ?? (await campaignUsesBundles(opts.campaignId));
  const [entSnap, relSnap] = await Promise.all([
    withRetry(() => getDocsFromServer(query(collection(db, 'entities'), where('campaignId', '==', opts.campaignId)))),
    bundles
      ? null
      : plan.relationships.length || opts.mode === 'update'
      ? withRetry(() => getDocsFromServer(query(collection(db, 'relationships'), where('campaignId', '==', opts.campaignId))))
      : Promise.resolve(null),
  ]);
  const have = new Map<string, Entity>(entSnap.docs.map((d) => [d.id, d.data() as Entity]));
  const haveRels = new Map<string, Relationship>(
    bundles
      ? (await withRetry(() => fetchLinks(opts.campaignId))).map((l) => [l.id, l])
      : relSnap?.docs.map((d) => [d.id, d.data() as Relationship]) ?? [],
  );
  // Bundled links are collected and written together at the end: one write per bundle.
  const linkPut: Relationship[] = [];
  const linkRemove: string[] = [];

  // Entries first, so every link has something to point at.
  await pool(
    plan.entities,
    async (entity) => {
      try {
        const ref = doc(db, 'entities', entity.id);
        let data = have.get(entity.id);
        // Not in this campaign's list: make sure the id isn't taken by another campaign.
        if (!data) {
          const other = await withRetry(() => getDocFromServer(ref)).catch(() => null);
          if (other?.exists()) data = other.data() as Entity;
        }
        if (data) {
          if (data.campaignId !== opts.campaignId) throw new Error('An entry with this id belongs to another campaign.');
          if (opts.mode === 'update') {
            if (needsUpdate(entity, data)) {
              const fields = updatableFields(entity, data);
              await withRetry(() => updateDoc(ref, { ...fields, ...syncStamp() }));
              have.set(entity.id, { ...data, ...fields });
              summary.updated++;
            } else summary.unchanged++;
          } else summary.skipped++;
        } else {
          await withRetry(() => setDoc(ref, { ...entity, ...syncStamp() }));
          have.set(entity.id, entity);
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
        const cur = haveRels.get(rel.id);
        if (cur) {
          // Refresh: a link from the pack follows the pack (its words, or a renamed entry).
          const keys = ['sourceId', 'targetId', 'targetName', 'label', 'reverseLabel'] as const;
          const diff = keys.filter((k) => (cur[k] ?? '') !== (rel[k] ?? ''));
          if (opts.mode === 'update' && diff.length) {
            if (bundles) linkPut.push({ ...cur, ...Object.fromEntries(diff.map((k) => [k, rel[k] ?? ''])), id: rel.id });
            else await withRetry(() => updateDoc(ref, { ...Object.fromEntries(diff.map((k) => [k, rel[k] ?? ''])), ...syncStamp() }));
            summary.relationshipsUpdated++;
          } else summary.relationshipsSkipped++;
        } else {
          if (bundles) linkPut.push(rel);
          else await withRetry(() => setDoc(ref, { ...rel, ...syncStamp() }));
          summary.relationshipsCreated++;
        }
      } catch (e) {
        summary.failed.push({ id: rel.id, name: `${rel.label} → ${rel.targetName}`, error: errText(e) });
      }
    },
    tick,
  );

  // Maps: the image goes in its own document, then the entry points at it. Pins are only added for targets that
  // aren't pinned yet, so pins the DM moved or added by hand are never disturbed. An entry that already has a
  // map of its own keeps it unless the DM chose "update".
  await pool(
    plan.maps,
    async (m) => {
      if (failedIds.has(m.entityId)) {
        summary.failed.push({ id: m.media.id, name: `Map for ${m.entityName}`, error: 'Skipped because the entry failed.' });
        return;
      }
      try {
        const ref = doc(db, 'entities', m.entityId);
        const data = have.get(m.entityId);
        if (!data) throw new Error('The entry for this map doesn\'t exist.');
        if (data.campaignId !== opts.campaignId) throw new Error('This entry belongs to another campaign.');
        const ownMap = data.mapConfig?.mediaId;
        if (ownMap && !isPackMediaId(plan.pack!.scope, ownMap)) {
          summary.mapsSkipped++; // the DM's own map
          return;
        }
        const mediaRef = doc(db, 'media', m.media.id);
        const stored = await withRetry(() => getDocFromServer(mediaRef));
        // Only (re)write the image when it's missing or, on "update", actually different.
        const imageChanged = !stored.exists() || (opts.mode === 'update' && (stored.data() as { data?: string }).data !== m.media.data);
        if (imageChanged) await withRetry(() => setDoc(mediaRef, m.media));
        const pinned = new Set((data.mapConfig?.pins ?? []).map((p) => p.targetEntityId));
        const pins: MapPin[] = [...(data.mapConfig?.pins ?? []), ...m.pins.filter((p) => !pinned.has(p.targetEntityId))];
        if (ownMap === m.media.id && pins.length === (data.mapConfig?.pins ?? []).length) {
          if (imageChanged) summary.mapsSet++;
          else summary.mapsSkipped++;
        } else {
          await withRetry(() => updateDoc(ref, { mapConfig: { mediaId: m.media.id, pins }, updatedAt: new Date().toISOString(), ...syncStamp() }));
          summary.mapsSet++;
        }
      } catch (e) {
        summary.failed.push({ id: m.media.id, name: `Map for ${m.entityName}`, error: errText(e) });
      }
    },
    tick,
  );
  const flushLinks = async () => {
    if (!bundles || (!linkPut.length && !linkRemove.length)) return;
    const put = linkPut.splice(0);
    const remove = linkRemove.splice(0);
    try {
      await withRetry(() => writeLinks(opts.campaignId, { put, remove }));
    } catch (e) {
      summary.relationshipsCreated = summary.relationshipsUpdated = summary.relationshipsRemoved = 0;
      summary.failed.push({ id: 'links', name: `${put.length + remove.length} links`, error: errText(e) });
    }
  };

  // Refresh: the pack is the source of truth for what came from it.
  if (opts.mode === 'update' && plan.pack) {
    const packId = plan.pack.scope;
    const inPack = new Set(plan.entities.map((e) => e.id));
    const gone = opts.removeMissing ? [...have.values()].filter((e) => isPackEntityId(packId, e.id) && !inPack.has(e.id)) : [];
    const goneIds = new Set(gone.map((e) => e.id));
    const planRels = new Set(plan.relationships.map((r) => r.id));
    // Links the pack no longer has, plus any link to an entry that is being removed.
    const staleRels = [...haveRels.entries()]
      .filter(([id, r]) => (isPackRelationshipId(packId, id) && !planRels.has(id)) || goneIds.has(r.sourceId) || goneIds.has(r.targetId))
      .map(([id]) => id);
    if (bundles) {
      linkRemove.push(...staleRels);
      summary.relationshipsRemoved += staleRels.length;
    } else
      await pool(staleRels, async (id) => {
        try {
          await withRetry(() => deleteDoc(doc(db, 'relationships', id)));
          summary.relationshipsRemoved++;
        } catch (e) {
          summary.failed.push({ id, name: 'Removing an old link', error: errText(e) });
        }
      });
    await flushLinks();
    if (gone.length) {
      // Your own entries placed inside a removed one move to the top level.
      const orphans = [...have.values()].filter((e) => !goneIds.has(e.id) && !inPack.has(e.id) && e.locationId && goneIds.has(e.locationId));
      await pool(orphans, async (e) => {
        try {
          await withRetry(() => updateDoc(doc(db, 'entities', e.id), { locationId: null, updatedAt: new Date().toISOString(), ...syncStamp() }));
        } catch (err) {
          summary.failed.push({ id: e.id, name: e.name, error: errText(err) });
        }
      });
      const maps = [...new Set(gone.map((e) => e.mapConfig?.mediaId).filter((id): id is string => !!id && isPackMediaId(packId, id)))];
      await pool(maps, async (id) => {
        await withRetry(() => deleteDoc(doc(db, 'media', id))).catch(() => undefined);
      });
      await pool(gone, async (e) => {
        try {
          await withRetry(() => deleteDoc(doc(db, 'entities', e.id)));
          summary.removed++;
        } catch (err) {
          summary.failed.push({ id: e.id, name: e.name, error: errText(err) });
        }
      });
    }
  }

  await flushLinks();

  // Deletions, or very large imports: tell every device to reload in full. Other changes reach
  // devices through the normal "changed since" sync, which reads only what changed instead of
  // the whole campaign on every device.
  // (Bundled links reach every device through their own listener: they never need this.)
  const linkWrites = bundles ? 0 : summary.relationshipsCreated;
  if (summary.removed || (!bundles && summary.relationshipsRemoved) || summary.created + summary.updated + linkWrites > 500) {
    await withRetry(() => writeResyncHint(opts.campaignId)).catch((e) =>
      summary.failed.push({ id: 'sync', name: 'Telling other devices to reload', error: `${errText(e)} – players can use “Reload campaign data” to catch up.` }),
    );
  }
  return summary;
}

export interface RemovalSummary {
  entities: number;
  relationships: number;
  maps: number;
  detached: number;
  failed: number;
}

/**
 * Takes a pack back out: deletes every entry and link that came from it. Entries the DM added
 * themselves are never deleted; if one was placed inside a pack entry it is moved to the top level.
 */
export async function removePack(packId: string, campaignId: string, current: { entities: Entity[] }, opts: { bundles?: boolean } = {}): Promise<RemovalSummary> {
  const bundles = opts.bundles ?? (await campaignUsesBundles(campaignId));
  const mine = current.entities.filter((e) => isPackEntityId(packId, e.id));
  const mineIds = new Set(mine.map((e) => e.id));
  const orphans = current.entities.filter((e) => !mineIds.has(e.id) && e.locationId && mineIds.has(e.locationId));
  // Query the links directly (the local list can be stale): the pack's own, plus any the DM
  // added by hand that touch a pack entry, which would dangle once the entry is gone.
  const all: Relationship[] = bundles
    ? await fetchLinks(campaignId)
    : (await getDocs(query(collection(db, 'relationships'), where('campaignId', '==', campaignId)))).docs.map((d) => ({ ...(d.data() as Relationship), id: d.id }));
  const rels = all.filter((r) => isPackRelationshipId(packId, r.id) || mineIds.has(r.sourceId) || mineIds.has(r.targetId)).map((r) => r.id);

  const out: RemovalSummary = { entities: 0, relationships: 0, maps: 0, detached: 0, failed: 0 };
  const mapIds = [...new Set(mine.map((e) => e.mapConfig?.mediaId).filter((id): id is string => !!id && isPackMediaId(packId, id)))];
  await pool(orphans, async (e) => {
    try {
      await withRetry(() => updateDoc(doc(db, 'entities', e.id), { locationId: null, updatedAt: new Date().toISOString(), ...syncStamp() }));
      out.detached++;
    } catch {
      out.failed++;
    }
  });
  if (bundles) {
    try {
      if (rels.length) await withRetry(() => writeLinks(campaignId, { remove: rels }));
      out.relationships = rels.length;
    } catch {
      out.failed += rels.length;
    }
  } else
    await pool(rels, async (id) => {
      try {
        await withRetry(() => deleteDoc(doc(db, 'relationships', id)));
        out.relationships++;
      } catch {
        out.failed++;
      }
    });
  await pool(mapIds, async (id) => {
    try {
      await withRetry(() => deleteDoc(doc(db, 'media', id)));
      out.maps++;
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
  await withRetry(() => writeResyncHint(campaignId)).catch(() => out.failed++);
  return out;
}
