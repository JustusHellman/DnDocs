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
  | { t: 'init'; who: string; total: number; rolled?: 1 };

export function parseEvent(text: string): TableEvent | undefined {
  try {
    const e = JSON.parse(text) as TableEvent;
    return e && typeof e === 'object' && typeof (e as { t?: unknown }).t === 'string' ? e : undefined;
  } catch {
    return undefined;
  }
}
