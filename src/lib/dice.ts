/**
 * Dice formulas ("1d20+5", "2d6 + 1d8 + 3", "d100", "4d6-1") and rolling them. Pure, local: rolls
 * are never saved to the database.
 *
 * Advantage / disadvantage roll every d20 twice and keep the higher / lower. A critical hit doubles
 * the number of dice (not the modifier), as in 5e.
 */

export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
const MAX_DICE = 100;
const MAX_SIDES = 1000;

export interface DiceTerm {
  /** +1 or -1 */
  sign: 1 | -1;
  count: number;
  sides: number;
}

export interface Formula {
  dice: DiceTerm[];
  mod: number;
}

/** Reads a formula; null when it isn't one. Spaces don't matter, "d20" means "1d20". */
export function parseFormula(text: string): Formula | null {
  const s = text.toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  const parts = s.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join('') !== s) return null;
  const dice: DiceTerm[] = [];
  let mod = 0;
  let total = 0;
  for (const p of parts) {
    const sign: 1 | -1 = p.startsWith('-') ? -1 : 1;
    const body = p.replace(/^[+-]/, '');
    const d = body.match(/^(\d*)d(\d+)$/);
    if (d) {
      const count = d[1] === '' ? 1 : parseInt(d[1], 10);
      const sides = parseInt(d[2], 10);
      if (!count || sides < 2 || sides > MAX_SIDES) return null;
      total += count;
      if (total > MAX_DICE) return null;
      const same = dice.find((x) => x.sides === sides && x.sign === sign);
      if (same) same.count += count;
      else dice.push({ sign, count, sides });
    } else if (/^\d+$/.test(body)) {
      mod += sign * parseInt(body, 10);
    } else return null;
  }
  if (!dice.length && !mod) return null;
  return { dice, mod };
}

/** Writes a formula back as text: "2d6 + 1d4 + 3". */
export function formatFormula(f: Formula): string {
  const out: string[] = [];
  for (const d of f.dice) out.push(`${out.length ? (d.sign < 0 ? '- ' : '+ ') : d.sign < 0 ? '-' : ''}${d.count}d${d.sides}`);
  if (f.mod) out.push(`${out.length ? (f.mod < 0 ? '- ' : '+ ') : f.mod < 0 ? '-' : ''}${Math.abs(f.mod)}`);
  return out.join(' ');
}

/** One more die of a kind (tapping a die button). */
export function addDie(f: Formula | null, sides: number): Formula {
  const base: Formula = f ? { dice: f.dice.map((d) => ({ ...d })), mod: f.mod } : { dice: [], mod: 0 };
  const same = base.dice.find((d) => d.sides === sides && d.sign === 1);
  if (same) same.count = Math.min(MAX_DICE, same.count + 1);
  else base.dice.push({ sign: 1, count: 1, sides });
  return base;
}

export function addModifier(f: Formula | null, by: number): Formula {
  return { dice: f?.dice.map((d) => ({ ...d })) ?? [], mod: (f?.mod ?? 0) + by };
}

export interface RollOptions {
  advantage?: boolean;
  disadvantage?: boolean;
  crit?: boolean;
}

export interface RolledTerm extends DiceTerm {
  /** The dice that count. */
  rolls: number[];
  /** With advantage/disadvantage: the d20s that were set aside. */
  dropped?: number[];
}

export interface RollResult {
  formula: string;
  terms: RolledTerm[];
  mod: number;
  total: number;
  /** A single d20 rolled (with or without advantage): what it showed, for "natural 20" and "natural 1". */
  natural?: number;
  advantage?: boolean;
  disadvantage?: boolean;
  crit?: boolean;
}

/** A fair die roll (crypto random, no modulo bias). */
export function rollDie(sides: number, rand: () => number = secureRandom): number {
  return 1 + Math.floor(rand() * sides);
}

function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

export function rollFormula(f: Formula, opts: RollOptions = {}, rand: () => number = secureRandom): RollResult {
  // Both at once cancel out (5e).
  const adv = !!opts.advantage && !opts.disadvantage;
  const dis = !!opts.disadvantage && !opts.advantage;
  const terms: RolledTerm[] = f.dice.map((d) => {
    const count = opts.crit ? d.count * 2 : d.count;
    if (d.sides === 20 && (adv || dis)) {
      const rolls: number[] = [];
      const dropped: number[] = [];
      for (let i = 0; i < count; i++) {
        const a = rollDie(20, rand);
        const b = rollDie(20, rand);
        const keep = adv ? Math.max(a, b) : Math.min(a, b);
        rolls.push(keep);
        dropped.push(keep === a ? b : a);
      }
      return { ...d, count, rolls, dropped };
    }
    return { ...d, count, rolls: Array.from({ length: count }, () => rollDie(d.sides, rand)) };
  });
  const total = terms.reduce((sum, t) => sum + t.sign * t.rolls.reduce((a, b) => a + b, 0), 0) + f.mod;
  const d20s = terms.filter((t) => t.sides === 20);
  const natural = d20s.length === 1 && d20s[0].rolls.length === 1 ? d20s[0].rolls[0] : undefined;
  return {
    formula: formatFormula(f),
    terms,
    mod: f.mod,
    total,
    natural,
    ...(adv ? { advantage: true } : {}),
    ...(dis ? { disadvantage: true } : {}),
    ...(opts.crit ? { crit: true } : {}),
  };
}
