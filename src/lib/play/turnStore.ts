/**
 * The fight going on (published by the battle map that's open): whose turn it is and which play
 * key belongs to which token. The cast dialog, the spellbook and the chat commands use it to mark
 * the action, bonus action or reaction a spell or feature took — only during combat.
 */
import { useSyncExternalStore } from 'react';
import { patchPlay, tableLive } from './live';
import type { PlayLive } from './model';
import { SPELL_BONUS, SPELL_LEVELLED, SPELL_OTHER, SPELL_SLOT, type Cost } from './turn';

export interface CombatToken {
  id: string;
  /** Where its live state is kept (a character's own key, or the token's). */
  key: string;
  name: string;
  /** Who writes its live state: the player, or the DM. */
  owner: string;
}
export interface CombatContext {
  cid: string;
  sceneId: string;
  round: number;
  /** The token whose turn it is. */
  turn: string | null;
  tokens: CombatToken[];
}

let current: CombatContext | null = null;
const subs = new Set<() => void>();
export function setCombatContext(c: CombatContext | null) {
  if (JSON.stringify(c) === JSON.stringify(current)) return;
  current = c;
  subs.forEach((f) => f());
}
export const combatContext = () => current;
export const useCombatContext = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => current,
  );

/** Is it this play key's turn right now? */
export function isTurnOf(key: string): boolean {
  const c = current;
  if (!c?.turn) return false;
  return c.tokens.find((t) => t.id === c.turn)?.key === key;
}
/** Is this play key in the fight? */
export const inCombat = (key: string) => !!current?.tokens.some((t) => t.key === key);

/** The change to the live state for using something that costs `cost` (null: nothing to mark). */
export function costPatch(live: PlayLive | null | undefined, cost: Cost, myTurn: boolean): Record<string, unknown> | null {
  const l = live ?? {};
  // Off your turn, an action or a bonus action can only be a readied one: it takes the reaction.
  const c = !myTurn && (cost === 'action' || cost === 'bonus') ? 'reaction' : cost;
  if (c === 'action') return { ac: Math.min(9, (l.ac ?? 0) + 1) };
  if (c === 'bonus') return { ba: 1 };
  if (c === 'reaction') return { re: 1 };
  return null;
}

/**
 * Mark what something cost, for a creature in the fight (no-op outside combat). Spells also note
 * what they mean for the rest of the turn (`sp`).
 */
export async function markCost(key: string, cost: Cost, extra: { spell?: { slot: boolean; cantrip: boolean } } = {}) {
  const c = current;
  if (!c) return;
  const tok = c.tokens.find((t) => t.key === key);
  if (!tok) return;
  const live = tableLive().play[key];
  const mine = isTurnOf(key);
  const patch = costPatch(live, cost, mine) ?? {};
  if (extra.spell && mine) {
    const sp = (live?.sp ?? 0) | (extra.spell.slot ? SPELL_SLOT : 0) | (cost === 'bonus' ? SPELL_BONUS : 0) | (extra.spell.cantrip && cost === 'action' ? 0 : SPELL_OTHER) | (extra.spell.cantrip ? 0 : SPELL_LEVELLED);
    if (sp) patch.sp = sp;
  }
  if (!Object.keys(patch).length) return;
  await patchPlay(c.cid, key, live?.uid ?? tok.owner, live?.name ?? tok.name, patch);
}
