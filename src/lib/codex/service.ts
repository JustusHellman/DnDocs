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
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { type FieldOp, type CodexPack, NEW_PARTY, type PackDoc } from './state';

export const partyRef = (campaignId: string) => doc(db, 'codex', campaignId);
export const satchelRef = (campaignId: string, uid: string) => doc(db, 'codex', campaignId, 'satchels', uid);
export const packsCol = (campaignId: string) => collection(db, 'codex', campaignId, 'packs');

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

/** A revealed entry also becomes known in the party's codex journal. */
export async function unlockInCodex(campaignId: string, keys: string[]) {
  if (!keys.length) return;
  await applyPartyOps(
    campaignId,
    keys.map((k) => ({ path: ['known', k], set: true })),
  );
}

/** Everything the codex stored for a campaign (used when the campaign is deleted). */
export async function deleteCodexData(campaignId: string) {
  const [satchels, packs] = await Promise.all([getDocs(collection(db, 'codex', campaignId, 'satchels')), getDocs(packsCol(campaignId))]);
  await Promise.all([...satchels.docs, ...packs.docs].map((d) => deleteDoc(d.ref)));
  if ((await getDoc(partyRef(campaignId))).exists()) await deleteDoc(partyRef(campaignId));
}
