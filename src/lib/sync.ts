/**
 * Incremental sync: lets a device that already has the campaign cached download only what
 * changed since its last visit, instead of every entry again (each document delivered by a fresh
 * listener counts as a read on Firestore's free plan).
 *
 * - Every write to an entry or relationship stamps `syncAt` with the server's clock (the security
 *   rules insist on it being exactly the server time, so a wrong or spoofed clock can't skew it).
 * - Things a "changed since" query can't see — a deleted document, or an entry a player may no
 *   longer read — leave a small hint in `syncHints`. Hints never carry content; a device that
 *   receives an "access" hint asks the server for that one entry to find out where it stands.
 * - Bulk changes (pack import / removal) leave a "resync" hint: every device then reloads in full.
 */
import { collection, doc, getDocs, limit, query, serverTimestamp, Timestamp, where, writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from '../firebase';

export type SyncColl = 'entities' | 'relationships';
export type HintKind = 'deleted' | 'access' | 'resync';

export interface SyncHint {
  id: string;
  campaignId: string;
  coll: SyncColl;
  /** The document concerned (empty for 'resync'). */
  docId: string;
  kind: HintKind;
  at: unknown;
}

/** Fields to add to every write of an entry or relationship. Add after any cleaning of `undefined`s. */
export const syncStamp = () => ({ syncAt: serverTimestamp() });

/** Server time of a document's last write in ms; null while the write is still pending locally. */
export function syncMillis(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis();
  if (v && typeof v === 'object' && 'toMillis' in v && typeof (v as Timestamp).toMillis === 'function') return (v as Timestamp).toMillis();
  return null;
}

const hintsCol = () => collection(db, 'syncHints');

/** Adds a hint to a batch (so it's written together with the change it describes). */
export function addHint(batch: WriteBatch, h: Omit<SyncHint, 'id' | 'at'>) {
  const ref = doc(hintsCol());
  batch.set(ref, { id: ref.id, campaignId: h.campaignId, coll: h.coll, docId: h.docId, kind: h.kind, at: serverTimestamp() });
}

export function hintsCollection() {
  return hintsCol();
}

/** Players who could read an entry (for "who may have lost access"). '*' = everyone. */
export function viewersOf(e: { isPublic?: boolean; allowedPlayers?: string[]; ownerId?: string; playerId?: string | null }): string[] {
  if (e.isPublic) return ['*'];
  return [...new Set([...(e.allowedPlayers ?? []), ...(e.ownerId ? [e.ownerId] : []), ...(e.playerId ? [e.playerId] : [])])];
}

/** Players who could read `before` but can't read `after`. */
export function lostAccess(before: Parameters<typeof viewersOf>[0], after: Parameters<typeof viewersOf>[0]): string[] {
  const was = viewersOf(before);
  const now = viewersOf(after);
  if (now.includes('*')) return [];
  if (was.includes('*')) return ['*'];
  return was.filter((u) => !now.includes(u));
}

// ---------------------------------------------------------------------------
// What a device remembers between visits (localStorage, per campaign, user and collection)
// ---------------------------------------------------------------------------

export const SYNC_VERSION = 1;
/**
 * A full download at least this often, whatever happens (catches anything a hint missed).
 * Must stay below HINT_KEEP_MS, so a device in incremental mode never misses a deletion hint.
 */
export const FULL_EVERY_MS = 7 * 24 * 3600_000;
/** Overlap when asking for "changed since", against small timing differences. */
export const MARGIN_MS = 2 * 60_000;

export interface SyncState {
  v: number;
  /** Per query: server time up to which this device has every change. */
  cursors: number[];
  /** Server time up to which hints have been handled. */
  hintCursor: number;
  /** Hints already handled (recent ones), so none is applied twice. */
  doneHints: string[];
  /** When the last full download finished (device clock); 0 = a full load is owed. */
  fullAt: number;
  /** Ids visible at the last save: the only cached documents trusted on the next visit. */
  ids: string[];
  /** Device clock until which incremental sync is not tried again (e.g. indexes missing). */
  noDeltaUntil?: number;
}

const storageKey = (key: string) => `dndocs-sync:${key}`;

export function loadSyncState(key: string): SyncState | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const s = JSON.parse(raw) as SyncState;
    if (s.v !== SYNC_VERSION || !Array.isArray(s.ids) || !Array.isArray(s.cursors) || !Array.isArray(s.doneHints) || typeof s.hintCursor !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}

let saving = true;
/** At sign-out: nothing may write sync bookkeeping back afterwards. */
export function stopSavingSyncState() {
  saving = false;
}

export function saveSyncState(key: string, s: SyncState) {
  if (!saving) return;
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(s));
  } catch {
    /* storage full or blocked: the next visit simply loads in full */
  }
}

export function forgetSyncState(prefix = '') {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(storageKey(prefix))) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** Hints are kept eight days: a device away longer reloads in full anyway (FULL_EVERY_MS, a week). */
export const HINT_KEEP_MS = 8 * 24 * 3600_000;
const PRUNE_KEY = 'dndocs-hints-pruned';

/**
 * DM only: delete old hints, at most once a day per device and 200 at a time. `serverNow` is the
 * newest server time this device has seen (so a wrong device clock can't delete fresh hints).
 */
export async function pruneSyncHints(campaignId: string, serverNow: number) {
  if (!serverNow) return;
  try {
    if (Date.now() - Number(localStorage.getItem(`${PRUNE_KEY}:${campaignId}`) || 0) < 24 * 3600_000) return;
    localStorage.setItem(`${PRUNE_KEY}:${campaignId}`, String(Date.now()));
  } catch {
    return;
  }
  const old = await getDocs(query(hintsCol(), where('campaignId', '==', campaignId), where('at', '<', Timestamp.fromMillis(serverNow - HINT_KEEP_MS)), limit(200)));
  if (old.empty) return;
  const batch = writeBatch(db);
  old.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/** After a bulk change (pack import or removal): every device reloads that campaign in full. */
export async function writeResyncHint(campaignId: string) {
  const batch = writeBatch(db);
  addHint(batch, { campaignId, coll: 'entities', docId: '', kind: 'resync' });
  addHint(batch, { campaignId, coll: 'relationships', docId: '', kind: 'resync' });
  await batch.commit();
}
