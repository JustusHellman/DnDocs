/**
 * Who the acting creature is aiming at, picked on purpose on the battle map ("Pick target"), so a
 * spell's damage or an attack can be offered for that token. Clicking a token only looks at it;
 * it never makes it a target.
 */
import { useSyncExternalStore } from 'react';
import { emit } from '../play/tableEvents';

export interface Aim {
  /** The acting token and its target. */
  by: string;
  byName: string;
  /** The acting token's entry (a character's), so its spells can offer damage for the target. */
  byEntity?: string | null;
  target: string;
  targetName: string;
}

let aim: Aim | null = null;
const subs = new Set<() => void>();
export const setAim = (a: Aim | null) => {
  aim = a;
  subs.forEach((f) => f());
};
export const currentAim = () => aim;
export const useAim = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => aim,
  );

/** Damage or healing to put on tokens, after the person sees it: what the battle map's dialog opens with. */
export interface HitRequest {
  /** What it's from ("Scimitar", "Cure Wounds"). */
  title: string;
  by: string;
  kind: 'damage' | 'heal';
  tokenIds: string[];
  /** The formula (for a new roll) and the total rolled, if any. */
  dmg?: string;
  ty?: string;
  total?: number;
  save?: string;
  dc?: number;
  half?: boolean;
  /** Came from the chat (a player's hit the DM applies). */
  fromChat?: boolean;
}
/** Ask the open battle map to show the damage (or healing) dialog. */
export const requestHit = (r: HitRequest) => emit('hit', r);

/** The tokens on the open battle map (to heal a character on it through the map's dialog). */
let mapTokens: { id: string; entityId: string | null; name: string }[] = [];
export const setMapTokens = (t: typeof mapTokens) => {
  mapTokens = t;
};
export const tokenOfEntity = (entityId: string) => mapTokens.find((t) => t.entityId === entityId) ?? null;

/** An attack that went at its target: its damage offered to apply (never applied by itself). */
export interface PendingHit {
  /** The attacking token. */
  by: string;
  byName: string;
  title: string;
  verdict: 'hit' | 'miss' | 'crit' | null;
  total: number | null;
  dmg?: string;
  ty?: string;
  target: { id: string; name: string };
}
let pending: PendingHit | null = null;
const pendingSubs = new Set<() => void>();
export const setPending = (p: PendingHit | null) => {
  pending = p;
  pendingSubs.forEach((f) => f());
};
export const usePending = () =>
  useSyncExternalStore(
    (f) => (pendingSubs.add(f), () => void pendingSubs.delete(f)),
    () => pending,
  );
/** Open the damage dialog for an offered hit (the amount can still change there). */
export const applyPending = (p: PendingHit) =>
  requestHit({ title: p.title, by: p.byName, kind: 'damage', tokenIds: [p.target.id], dmg: p.dmg?.replace(/\s+/g, '').replace('−', '-'), ty: p.ty, total: p.total ?? undefined });
