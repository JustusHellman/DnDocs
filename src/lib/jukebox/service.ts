/**
 * Firestore: one document per campaign, jukebox/{campaignId}, holding what plays (state) and the
 * DM's own environments and tracks (config). Everyone in the campaign reads it; only DMs write.
 */
import { deleteField, doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Change } from './actions';
import type { JukeboxConfig } from './types';

export const jukeboxDoc = (campaignId: string) => doc(db, 'jukebox', campaignId);

export async function applyChange(campaignId: string, uid: string, change: Change) {
  const data: Record<string, unknown> = {
    campaignId,
    state: change.state,
    updatedAt: Date.now(),
    updatedBy: uid,
  };
  if (change.recent) data.config = { recent: { [change.recent.envId]: change.recent.tracks } };
  await setDoc(jukeboxDoc(campaignId), data, { merge: true });
}

export async function setFade(campaignId: string, uid: string, fadeMs: number) {
  await setDoc(jukeboxDoc(campaignId), { campaignId, state: { fadeMs }, updatedAt: Date.now(), updatedBy: uid }, { merge: true });
}

type ConfigPatch = { [K in keyof JukeboxConfig]?: unknown };

/** Merge a change into the config (use `removed()` as a value to delete a key). */
export async function patchConfig(campaignId: string, uid: string, patch: ConfigPatch) {
  await setDoc(jukeboxDoc(campaignId), { campaignId, config: patch, updatedAt: Date.now(), updatedBy: uid }, { merge: true });
}

export const removed = () => deleteField();

export function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
