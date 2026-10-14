/** Firestore side of the Scavenger's Codex in DnDocs (see ./state for the shapes). */
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { type FieldOp, type CodexPack, logKey, NEW_PARTY, type PackDoc } from './state';

export const partyRef = (campaignId: string) => doc(db, 'codex', campaignId);
export const satchelRef = (campaignId: string, uid: string) => doc(db, 'codex', campaignId, 'satchels', uid);
export const packsCol = (campaignId: string) => collection(db, 'codex', campaignId, 'packs');
/** Gifts on their way to a player: others can drop things here, only the owner takes them out. */
export const inboxCol = (campaignId: string, uid: string) => collection(db, 'codex', campaignId, 'satchels', uid, 'inbox');

/** Something one player gave another in the codex. */
export interface Gift {
  from: string;
  fromName: string;
  items: Record<string, number>;
  /** Coin, in copper pieces. */
  cp: number;
  at?: unknown;
}

/** Pack documents can't hold every character a name might use. */
const packId = (name: string) => name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 80) || 'pack';

const MAX_DOC = 900_000;

function toUpdate(ops: FieldOp[]): unknown[] {
  const args: unknown[] = [];
  for (const op of ops) {
    args.push(new FieldPath(...op.path));
    if ('inc' in op) args.push(increment(op.inc));
    else if ('del' in op) args.push(deleteField());
    else args.push(op.set);
  }
  return args;
}

/** Applies field changes to a document, creating it (with `base`) when it doesn't exist yet. */
export async function applyOps(ref: ReturnType<typeof doc>, ops: FieldOp[], base: Record<string, unknown>) {
  if (!ops.length) return;
  const args = [...toUpdate(ops), new FieldPath('updatedAt'), serverTimestamp()];
  try {
    await (updateDoc as (...a: unknown[]) => Promise<void>)(ref, ...args);
  } catch (err) {
    if ((err as { code?: string })?.code !== 'not-found') throw err;
    // First change for this campaign (or player): create the document, then apply.
    await setDoc(ref, { ...base, updatedAt: serverTimestamp() }, { merge: true });
    await (updateDoc as (...a: unknown[]) => Promise<void>)(ref, ...args);
  }
}

export function applyPartyOps(campaignId: string, ops: FieldOp[]) {
  return applyOps(partyRef(campaignId), ops, { ...NEW_PARTY });
}

export function applySatchelOps(campaignId: string, uid: string, ops: FieldOp[]) {
  return applyOps(satchelRef(campaignId, uid), ops, { items: {}, prefs: {} });
}

export async function savePacks(campaignId: string, change: { put: CodexPack[]; remove: string[] }) {
  for (const p of change.put) {
    const data = JSON.stringify(p.data);
    if (data.length > MAX_DOC) throw new Error(`The homebrew pack “${p.name}” is too big to save in the campaign (over 900 KB).`);
    await setDoc(doc(packsCol(campaignId), packId(p.name)), { name: p.name, addedAt: p.addedAt ?? new Date().toISOString(), data } satisfies PackDoc);
  }
  for (const n of change.remove) await deleteDoc(doc(packsCol(campaignId), packId(n)));
}

const GIFT_ID = /^[a-z0-9]{4,40}$/;

/** Checks a gift as the codex sent it; returns the cleaned-up gift or null. */
export function cleanGift(raw: unknown): { id: string; to: string; items: Record<string, number>; cp: number } | null {
  const g = raw as { id?: unknown; to?: unknown; items?: unknown; cp?: unknown } | null;
  if (!g || typeof g.id !== 'string' || !GIFT_ID.test(g.id) || typeof g.to !== 'string' || !g.to) return null;
  const items: Record<string, number> = {};
  for (const [k, v] of Object.entries((g.items as Record<string, unknown>) ?? {})) {
    const q = Math.floor(Number(v));
    if (q > 0 && q <= 9999 && /^[a-z0-9-]{1,80}$/.test(k)) items[k] = q;
  }
  const cp = Math.max(0, Math.floor(Number(g.cp) || 0));
  if (!cp && !Object.keys(items).length) return null;
  return { id: g.id, to: g.to, items, cp };
}

/** Checks a DM hand-out/take-back as the codex sent it (quantities and coin may be negative). */
export function cleanBankMove(raw: unknown): { id: string; uid: string; items: Record<string, number>; cp: number } | null {
  const m = raw as { id?: unknown; uid?: unknown; items?: unknown; cp?: unknown } | null;
  if (!m || typeof m.id !== 'string' || !GIFT_ID.test(m.id) || typeof m.uid !== 'string' || !m.uid) return null;
  const items: Record<string, number> = {};
  for (const [k, v] of Object.entries((m.items as Record<string, unknown>) ?? {})) {
    const q = Math.trunc(Number(v));
    if (q && Math.abs(q) <= 9999 && /^[a-z0-9-]{1,80}$/.test(k)) items[k] = q;
  }
  const cp = Math.trunc(Number(m.cp) || 0);
  if (!cp && !Object.keys(items).length) return null;
  return { id: m.id, uid: m.uid, items, cp };
}

export async function sendGift(campaignId: string, from: { uid: string; name: string }, gift: { id: string; to: string; items: Record<string, number>; cp: number }) {
  await setDoc(doc(inboxCol(campaignId, gift.to), gift.id), {
    from: from.uid,
    fromName: from.name,
    items: gift.items,
    cp: gift.cp,
    at: serverTimestamp(),
  } satisfies Gift);
}

/**
 * Takes a gift out of my inbox and puts it in my satchel, once (a transaction, so two open tabs
 * can't both take it). Returns the gift, or null if another tab already took it.
 */
export async function receiveGift(campaignId: string, uid: string, giftId: string): Promise<Gift | null> {
  const giftRef = doc(inboxCol(campaignId, uid), giftId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(giftRef);
    if (!snap.exists()) return null;
    const g = snap.data() as Gift;
    const items: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(g.items ?? {})) if (Number(v) > 0) items[k] = increment(Math.floor(Number(v)));
    const add: Record<string, unknown> = { items, updatedAt: serverTimestamp() };
    if (Number(g.cp) > 0) add.cp = increment(Math.floor(Number(g.cp)));
    tx.set(satchelRef(campaignId, uid), add, { merge: true });
    tx.delete(giftRef);
    return g;
  });
}

/** A revealed entry also becomes known in the party's codex journal. */
export async function unlockInCodex(campaignId: string, keys: string[]) {
  if (!keys.length) return;
  await applyPartyOps(
    campaignId,
    keys.map((k) => ({ path: ['known', k], set: true })),
  );
}

/** Everything the codex stored for a campaign (used when the campaign is deleted). */
export async function deleteCodexData(campaignId: string, memberIds: string[] = []) {
  const [satchels, packs] = await Promise.all([getDocs(collection(db, 'codex', campaignId, 'satchels')), getDocs(packsCol(campaignId))]);
  // Gifts nobody collected (also for players who never opened the codex, so have no satchel yet).
  const uids = new Set([...memberIds, ...satchels.docs.map((d) => d.id)]);
  const inboxes = await Promise.all([...uids].map((u) => getDocs(inboxCol(campaignId, u)).catch(() => null)));
  await Promise.all(inboxes.flatMap((q) => q?.docs ?? []).map((d) => deleteDoc(d.ref)));
  await Promise.all([...satchels.docs, ...packs.docs].map((d) => deleteDoc(d.ref)));
  if ((await getDoc(partyRef(campaignId))).exists()) await deleteDoc(partyRef(campaignId));
}

/**
 * DM: hand a codex thing (or coin) to a player's satchel or the party satchel, straight from DnDocs.
 * Also writes a line in the party's codex journal.
 */
export async function dmGive(campaignId: string, to: { uid: string | null; name: string }, id: string, q: number, thingName: string) {
  const at = Date.now();
  const text = `The DM gave ${to.name} ${q}× ${thingName}`;
  const line: FieldOp = { path: ['log', logKey({ at, text })], set: { at, clock: null, text } };
  if (to.uid) {
    await applySatchelOps(campaignId, to.uid, [{ path: ['items', id], inc: q }]);
    await applyPartyOps(campaignId, [line]);
  } else {
    await applyPartyOps(campaignId, [{ path: ['items', id], inc: q }, { path: ['known', `t:${id}`], set: true }, line]);
  }
}
