/** Encounter difficulty with the 2024 Dungeon Master's Guide XP budgets. */

const CR_XP: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900,
  '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000,
  '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

/** XP budget per character by level: [low, moderate, high]. */
const BUDGET: [number, number, number][] = [
  [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100], [600, 1000, 1400],
  [750, 1300, 1700], [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100], [1900, 2900, 4100],
  [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800], [3800, 6100, 9800],
  [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000],
];

/** XP for a challenge rating written any common way: "1/2", "0.5", "5 (1,800 XP)", "CR 3". */
export function xpForCr(text: unknown): number | null {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const explicit = s.match(/\(([\d,]+)\s*XP\)/i);
  if (explicit) return parseInt(explicit[1].replace(/,/g, ''), 10);
  const m = s.match(/(\d+\s*\/\s*\d+|\d*\.\d+|\d+)/);
  if (!m) return null;
  let cr = m[1].replace(/\s/g, '');
  if (cr === '0.125') cr = '1/8';
  else if (cr === '0.25') cr = '1/4';
  else if (cr === '0.5') cr = '1/2';
  return CR_XP[cr] ?? null;
}

/** Total character level from "Rogue 3", "Fighter 2 / Wizard 1", "Level 5", "3". */
export function levelOf(text: unknown): number | null {
  const nums = String(text ?? '').match(/\d+/g);
  if (!nums) return null;
  const total = nums.map(Number).reduce((a, b) => a + b, 0);
  return total >= 1 && total <= 20 ? total : Math.min(20, Math.max(1, nums.map(Number)[0]));
}

export type Difficulty = 'trivial' | 'low' | 'moderate' | 'high' | 'deadly';

export function partyBudget(levels: number[]): { low: number; moderate: number; high: number } {
  const b = { low: 0, moderate: 0, high: 0 };
  for (const l of levels) {
    const row = BUDGET[Math.min(20, Math.max(1, Math.round(l))) - 1];
    b.low += row[0];
    b.moderate += row[1];
    b.high += row[2];
  }
  return b;
}

export function rate(xp: number, budget: { low: number; moderate: number; high: number }): Difficulty {
  if (xp <= 0) return 'trivial';
  if (xp > budget.high * 1.5) return 'deadly';
  if (xp > budget.moderate) return 'high';
  if (xp > budget.low) return 'moderate';
  if (xp >= budget.low * 0.5) return 'low';
  return 'trivial';
}
