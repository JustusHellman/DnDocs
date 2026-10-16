/**
 * What the table chat needs to roll initiative: the open battle map's scene and who still has
 * to roll. The initiative tracker (on the battle map) fills it in; the chat reads it. Also the DM's
 * "sitting out" list per scene: creatures on the map that aren't in this fight (kept on this device).
 */
import { useSyncExternalStore } from 'react';

export interface InitiativeToken {
  id: string;
  name: string;
  /** Initiative bonus (DEX modifier) from the creature's stats, when known. */
  mod: number;
  /** Played by someone (a character), rather than the DM. */
  player: boolean;
  mine: boolean;
  hidden: boolean;
}

export interface InitiativeContext {
  sceneId: string;
  sceneName: string;
  asDM: boolean;
  combatActive: boolean;
  /** Tokens without an initiative yet (players: only their own). */
  unrolled: InitiativeToken[];
}

let ctx: InitiativeContext | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

export function setInitiativeContext(next: InitiativeContext | null) {
  if (JSON.stringify(next) === JSON.stringify(ctx)) return;
  ctx = next;
  emit();
}
export const useInitiativeContext = () => useSyncExternalStore(subscribe, () => ctx);

// Sitting out (DM, per scene, this device).
const outKey = (sceneId: string) => `dndocs-init-out:${sceneId}`;
const outCache = new Map<string, string[]>();
export function sittingOut(sceneId: string): string[] {
  let v = outCache.get(sceneId);
  if (!v) {
    try {
      v = JSON.parse(localStorage.getItem(outKey(sceneId)) || '[]') as string[];
    } catch {
      v = [];
    }
    if (!Array.isArray(v)) v = [];
    outCache.set(sceneId, v);
  }
  return v;
}
export function setSittingOut(sceneId: string, ids: string[]) {
  const v = [...new Set(ids)];
  outCache.set(sceneId, v);
  try {
    localStorage.setItem(outKey(sceneId), JSON.stringify(v));
  } catch {
    /* ignore */
  }
  emit();
}
export const useSittingOut = (sceneId: string | undefined) => useSyncExternalStore(subscribe, () => (sceneId ? sittingOut(sceneId) : EMPTY));
const EMPTY: string[] = [];
