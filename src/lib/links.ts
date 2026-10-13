/**
 * Links between entries ("relationships"), stored in a handful of bundle documents per campaign
 * instead of one document per link.
 *
 * Why: Firestore's free plan counts every document read and written. A campaign with 800 links
 * cost 800 reads on every full reload and 800 writes for a pack import. In bundles it's at most
 * BUNDLES reads for a full reload and one write per touched bundle, whatever the number of links.
 *
 *   linkBundles/{campaignId}__{n}   { campaignId, n, links: { [linkId]: Relationship } }
 *
 * A link always lives in the same bundle (chosen from its id), so adding, changing or removing
 * one is a single merge write that never needs to read the bundle first.
 *
 * Older campaigns keep one document per link in `relationships` until the owner's device moves
 * them over (see migrateLinks); `campaign.linksV2` says which storage a campaign uses.
 */
import { collection, deleteDoc, deleteField, doc, getDocFromServer, getDocs, getDocsFromServer, query, setDoc, updateDoc, where, type WriteBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Relationship } from '../types';

export const BUNDLES = 8;
/** Firestore documents max out at 1 MiB; a link takes ~250 bytes. Stay well clear. */
export const MAX_LINKS = BUNDLES * 3000;

const v2 = new Set<string>();
/** Called by the data layer when a campaign's storage is known. */
export function setLinksV2(campaignId: string, on: boolean) {
  if (on) v2.add(campaignId);
  else v2.delete(campaignId);
}
export const usesBundles = (campaignId: string) => v2.has(campaignId);

/** Stable bundle number for a link id (FNV-1a). */
export function bundleOf(linkId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < linkId.length; i++) {
    h ^= linkId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % BUNDLES;
}

export const bundleId = (campaignId: string, n: number) => `${campaignId}__${n}`;
export const bundleRef = (campaignId: string, n: number) => doc(db, 'linkBundles', bundleId(campaignId, n));
export const bundlesQuery = (campaignId: string) => query(collection(db, 'linkBundles'), where('campaignId', '==', campaignId));

/** A fresh link id (random, like Firestore's own). */
export const newLinkId = () => doc(collection(db, 'relationships')).id;

/** Plain link data, as stored inside a bundle (no server timestamps). */
function record(r: Relationship): Relationship {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (v !== undefined && k !== 'syncAt') out[k] = v;
  return out as unknown as Relationship;
}

/** All links of a campaign from a bundle snapshot. */
export function linksFromBundles(docs: { data: () => unknown }[]): Relationship[] {
  const out: Relationship[] = [];
  for (const d of docs) {
    const links = (d.data() as { links?: Record<string, Relationship> }).links ?? {};
    for (const [id, r] of Object.entries(links)) if (r && typeof r === 'object') out.push({ ...r, id });
  }
  return out;
}

export interface LinkChanges {
  put?: Relationship[];
  remove?: string[];
}

/** The merge write for each touched bundle (puts and removals together). */
function bundleWrites(campaignId: string, changes: LinkChanges) {
  const per = new Map<number, Record<string, unknown>>();
  const at = (id: string) => {
    const n = bundleOf(id);
    if (!per.has(n)) per.set(n, {});
    return per.get(n)!;
  };
  for (const r of changes.put ?? []) at(r.id)[r.id] = record({ ...r, campaignId });
  for (const id of changes.remove ?? []) at(id)[id] = deleteField();
  return [...per.entries()].map(([n, links]) => ({ ref: bundleRef(campaignId, n), data: { campaignId, n, links } }));
}

/** Add, change and remove links: one write per touched bundle. */
export async function writeLinks(campaignId: string, changes: LinkChanges) {
  const writes = bundleWrites(campaignId, changes);
  await Promise.all(writes.map((w) => setDoc(w.ref, w.data, { merge: true })));
  return writes.length;
}

/** The same, as part of a batch (e.g. together with deleting an entry). */
export function addLinkWritesToBatch(batch: WriteBatch, campaignId: string, changes: LinkChanges) {
  for (const w of bundleWrites(campaignId, changes)) batch.set(w.ref, w.data, { merge: true });
}

/**
 * Every link of a campaign (at most BUNDLES reads). From the server by default; `allowCache`
 * accepts the offline copy (fine for finding links to remove, e.g. when deleting an entry offline).
 */
export async function fetchLinks(campaignId: string, opts: { allowCache?: boolean } = {}): Promise<Relationship[]> {
  const snap = await (opts.allowCache ? getDocs : getDocsFromServer)(bundlesQuery(campaignId));
  return linksFromBundles(snap.docs);
}

/** Does the campaign (according to the server) keep its links in bundles? */
export async function campaignUsesBundles(campaignId: string): Promise<boolean> {
  try {
    const snap = await getDocFromServer(doc(db, 'campaigns', campaignId));
    return snap.exists() ? !!(snap.data() as { linksV2?: boolean }).linksV2 : usesBundles(campaignId);
  } catch {
    return usesBundles(campaignId);
  }
}

/**
 * Moves an older campaign's links into bundles (owner's device, once). Writes the bundles first,
 * then flags the campaign, then tidies the old documents away; if anything fails on the way the
 * campaign simply keeps using the old storage and it's tried again later.
 */
export async function migrateLinks(campaignId: string): Promise<{ moved: number }> {
  // Always from the server: an offline copy could bring back links deleted meanwhile.
  if (await campaignUsesBundles(campaignId)) return sweepOldLinks(campaignId);
  const old = await getDocsFromServer(query(collection(db, 'relationships'), where('campaignId', '==', campaignId)));
  const links = old.docs.map((d) => ({ ...(d.data() as Relationship), id: d.id }));
  if (links.length > MAX_LINKS) throw new Error(`Too many links to bundle (${links.length}).`);
  // Replace every bundle outright (no merge), so leftovers of an earlier, interrupted attempt
  // can't bring back links deleted since.
  const per = Array.from({ length: BUNDLES }, () => ({}) as Record<string, Relationship>);
  for (const l of links) per[bundleOf(l.id)][l.id] = record({ ...l, campaignId });
  await Promise.all(per.map((m, n) => setDoc(bundleRef(campaignId, n), { campaignId, n, links: m })));
  await updateDoc(doc(db, 'campaigns', campaignId), { linksV2: true });
  // The old one-per-link documents are no longer read; remove them (best effort, a few at a time:
  // each delete is checked by the security rules, which limit look-ups per batch).
  for (let i = 0; i < old.docs.length; i += 10) {
    await Promise.all(old.docs.slice(i, i + 10).map((d) => deleteDoc(d.ref).catch(() => undefined)));
  }
  // Anything another device wrote the old way in the meantime.
  const late = await sweepOldLinks(campaignId);
  return { moved: links.length + late.moved };
}

/**
 * After the move: links that a device still on the old storage wrote as separate documents (an
 * old open tab, a co-DM) are moved into the bundles. Costs one read when there are none.
 */
export async function sweepOldLinks(campaignId: string): Promise<{ moved: number }> {
  const old = await getDocsFromServer(query(collection(db, 'relationships'), where('campaignId', '==', campaignId)));
  if (old.empty) return { moved: 0 };
  await writeLinks(campaignId, { put: old.docs.map((d) => ({ ...(d.data() as Relationship), id: d.id })) });
  for (let i = 0; i < old.docs.length; i += 10) {
    await Promise.all(old.docs.slice(i, i + 10).map((d) => deleteDoc(d.ref).catch(() => undefined)));
  }
  return { moved: old.docs.length };
}
