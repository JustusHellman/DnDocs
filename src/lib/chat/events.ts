/**
 * Things that happen at the table and show in the chat as a line or a small card: a spell cast,
 * a slot or resource used, a concentration check, a rest, a sum, an action line. Stored as JSON
 * text on a chat message (kind "event").
 */
export type TableEvent =
  /** A spell was cast (the card is looked up again by id, so the message stays small). */
  | { t: 'cast'; who: string; key?: string; spell: string; id: string; lvl: number; slot: number; via: string; sum: string; conc?: 1; dice?: string }
  /** What a cast came to (typed results; rolls made here are in the chat already). */
  | { t: 'castres'; who: string; spell: string; parts: { l: string; v: number }[] }
  /** A slot, resource or counter was used or regained. */
  | { t: 'use'; who: string; what: string; left: number; of: number; back?: 1; undo?: { key: string; path: string; was: number } }
  /** Took damage while concentrating: the save to make. */
  | { t: 'conc'; who: string; key: string; owner: string; dmg: number; dc: number; con: number }
  /** How the concentration save went. */
  | { t: 'concres'; who: string; kept: boolean; total?: number }
  /** Concentration started or ended. */
  | { t: 'concon'; who: string; on: boolean; spell?: string }
  /** A rest (or the DM's party rest). */
  | { t: 'rest'; who: string; kind: 'short' | 'long'; party?: 1; hp?: string; hd?: string }
  /** Hit dice spent on a short rest. */
  | { t: 'hd'; who: string; die: number; total: number; hp: string }
  /** A sum: "/math 3+12+5". */
  | { t: 'math'; expr: string; total: number; half?: number }
  /** An action line: "/me ducks behind the cart". */
  | { t: 'me'; text: string }
  /** Initiative entered (typed or rolled). */
  | { t: 'init'; who: string; total: number; rolled?: 1 }
  /** Something done on a turn (Dodge, Dash, an opportunity attack…), from the turn helper. */
  | { t: 'act'; who: string; what: string; cost: 'action' | 'bonus' | 'reaction' | 'free'; note?: string }
  /** An area spell placed on the battle map, and who's inside (the DM applies it from here). */
  | { t: 'area'; spell: string; scene: string; shape: AreaShape; names: string[]; hit: import('../play/ui').AreaHit }
  /**
   * A player's hit (or healing) on someone they can't change themselves: the DM (or, for healing,
   * the character's player) applies it from here, after seeing it. `ids`: tokens on `scene`;
   * `ents`: the characters among them (healing can be applied without the map).
   */
  | { t: 'hit'; kind: 'damage' | 'heal'; title: string; by: string; scene?: string; ids: string[]; names: string[]; ents?: string[]; total: number; dmg?: string; ty?: string };

/** Where an area is on the battle map (squares): the template kind, its two points, a line's width. */
export interface AreaShape {
  k: 'circle' | 'cone' | 'beam' | 'cube';
  a: { x: number; y: number };
  b: { x: number; y: number };
  w?: number;
}

export function parseEvent(text: string): TableEvent | undefined {
  try {
    const e = JSON.parse(text) as TableEvent;
    return e && typeof e === 'object' && typeof (e as { t?: unknown }).t === 'string' ? e : undefined;
  } catch {
    return undefined;
  }
}
