/**
 * Deletes a whole campaign, correctly: every entry, link, map image and join code that belongs to it,
 * and only then the campaign itself.
 *
 * The order matters. The security rules check the campaign document before every other delete, so the
 * campaign has to go last. If anything fails the campaign is left in place (with whatever is still
 * there), and running the deletion again carries on where it stopped.
 */
import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Campaign } from '../types';

export interface DeleteSummary {
  entities: number;
  relationships: number;
  media: number;
  failed: number;
  /** True when the campaign document itself is gone. */
  campaignDeleted: boolean;
}

const CONCURRENCY = 8;

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

export async function deleteCampaignCompletely(campaign: Campaign, onProgress?: (done: number, total: number) => void): Promise<DeleteSummary> {
  const where_ = where('campaignId', '==', campaign.id);
  const [rels, media, ents] = await Promise.all([
    getDocs(query(collection(db, 'relationships'), where_)),
    getDocs(query(collection(db, 'media'), where_)),
    getDocs(query(collection(db, 'entities'), where_)),
  ]);
  const total = rels.size + media.size + ents.size + 2;
  let done = 0;
  const tick = () => onProgress?.(++done, total);
  onProgress?.(0, total);

  const out: DeleteSummary = { entities: 0, relationships: 0, media: 0, failed: 0, campaignDeleted: false };
  const remove = (count: 'relationships' | 'media' | 'entities') => async (d: { ref: Parameters<typeof deleteDoc>[0] }) => {
    try {
      await deleteDoc(d.ref);
      out[count]++;
    } catch {
      try {
        await deleteDoc(d.ref); // one quiet retry for a network blip
        out[count]++;
      } catch {
        out.failed++;
      }
    }
  };
  // Links and images first, entries next.
  await pool(rels.docs, remove('relationships'), tick);
  await pool(media.docs, remove('media'), tick);
  await pool(ents.docs, remove('entities'), tick);

  if (out.failed > 0) return out; // leave the campaign so the deletion can be run again

  // The join code is looked up by code, so it is deleted by id (older campaigns may not have one).
  try {
    await deleteDoc(doc(db, 'joinCodes', campaign.joinCode));
  } catch {
    /* older rules or no code: harmless */
  }
  tick();
  try {
    await deleteDoc(doc(db, 'campaigns', campaign.id));
    out.campaignDeleted = true;
  } catch {
    out.failed++;
  }
  tick();
  return out;
}
