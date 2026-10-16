/**
 * Table chat helpers (pure): what a roll looks like in the chat, and reading "/r 1d20+5"-style
 * commands typed into the message box.
 */
import { formatFormula, parseFormula, rollFormula, type Formula, type RollOptions, type RollResult } from '../dice';

/** A roll as it travels through the chat (short keys: it's stored as JSON text). */
export interface ChatRoll {
  /** What it was for ("Longsword attack", "STR"), when known. */
  l?: string;
  /** The formula, e.g. "1d20 + 5". */
  f: string;
  t: number;
  /** Dice groups: sides, kept values, set-aside values (advantage / disadvantage), sign. */
  d: { s: number; v: number[]; x?: number[]; n?: 1 }[];
  m: number;
  /** A single d20's natural value. */
  nat?: number;
  adv?: 1;
  dis?: 1;
  crit?: 1;
}

export function toChatRoll(r: RollResult, label?: string): ChatRoll {
  const out: ChatRoll = {
    f: r.formula.replace(/^.*: /, ''),
    t: r.total,
    d: r.terms.map((t) => ({ s: t.sides, v: t.rolls, ...(t.dropped ? { x: t.dropped } : {}), ...(t.sign < 0 ? { n: 1 as const } : {}) })),
    m: r.mod,
  };
  if (label) out.l = label.slice(0, 60);
  if (r.natural !== undefined) out.nat = r.natural;
  if (r.advantage) out.adv = 1;
  if (r.disadvantage) out.dis = 1;
  if (r.crit) out.crit = 1;
  return out;
}

/** Reads a stored roll back (null for anything that doesn't look like one). */
export function parseChatRoll(text: string | undefined | null): ChatRoll | null {
  if (!text) return null;
  try {
    const r = JSON.parse(text) as ChatRoll;
    if (!r || typeof r.f !== 'string' || typeof r.t !== 'number' || !Array.isArray(r.d)) return null;
    return r;
  } catch {
    return null;
  }
}

export interface ChatCommand {
  formula: Formula;
  label?: string;
  opts: RollOptions;
}

/**
 * "/r 1d20+5", "/roll 2d6+3 Longsword", "/r d20 adv Stealth", or a bare formula ("1d20+5").
 * Returns null for ordinary messages.
 */
export function parseRollCommand(text: string): ChatCommand | null {
  const s = text.trim();
  const cmd = s.match(/^\/(?:r|roll)\s+(.+)$/i);
  const words = (cmd ? cmd[1] : s).split(/\s+/).filter(Boolean);
  // The formula: the longest run of words from the start that reads as one ("1d20 + 5 adv Stealth").
  let k = words.length;
  let formula: Formula | null = null;
  for (; k > 0; k--) {
    formula = parseFormula(words.slice(0, k).join(''));
    if (formula) break;
  }
  if (!formula) return null;
  // A bare message needs at least one die ("15" is a message, "1d20" is a roll).
  if (!cmd && !formula.dice.length) return null;
  // Without "/r", only a message that is nothing but a formula rolls ("1d20 is fine" is chat).
  if (!cmd && k < words.length && !/^(adv|advantage|dis|disadvantage|crit)$/i.test(words[k])) return null;
  let rest = words.slice(k).join(' ');
  const opts: RollOptions = {};
  const flag = (re: RegExp, k: keyof RollOptions) => {
    if (re.test(rest)) {
      opts[k] = true;
      rest = rest.replace(re, ' ').trim();
    }
  };
  flag(/\b(adv|advantage)\b/i, 'advantage');
  flag(/\b(dis|disadvantage)\b/i, 'disadvantage');
  flag(/\bcrit\b/i, 'crit');
  return { formula, opts, ...(rest ? { label: rest.slice(0, 60) } : {}) };
}

export function rollCommand(c: ChatCommand): ChatRoll {
  return toChatRoll(rollFormula(c.formula, c.opts), c.label);
}

export { formatFormula };
