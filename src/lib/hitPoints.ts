/** Hit point maths for player characters (5e: temporary HP absorb damage first, healing can't pass the maximum). */

/** The first whole number in a value: "45 (6d8 + 18)" → 45, "" → null. */
export function parseHp(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  const m = String(value ?? '').match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

export interface HpState {
  current: number | null;
  temp: number;
  max: number | null;
}

/** A character's HP as stored (current HP and temp HP in attributes, maximum in the stat block). */
export function readHp(attributes: Record<string, unknown> | undefined, maxText: unknown): HpState {
  const max = parseHp(maxText);
  const current = parseHp(attributes?.currentHp);
  return {
    max: max !== null && max > 0 ? max : null,
    // No current HP written down yet: a fresh character is at full health.
    current: current ?? (max !== null && max > 0 ? max : null),
    temp: Math.max(0, parseHp(attributes?.tempHp) ?? 0),
  };
}

export type HpChange = 'damage' | 'heal' | 'temp' | 'set' | 'full';

export function applyHp(state: HpState, kind: HpChange, amount: number): HpState {
  const n = Math.max(0, Math.trunc(amount) || 0);
  const current = state.current ?? state.max ?? 0;
  const cap = (v: number) => (state.max !== null ? Math.min(v, state.max) : v);
  switch (kind) {
    case 'damage': {
      const absorbed = Math.min(state.temp, n);
      return { ...state, temp: state.temp - absorbed, current: Math.max(0, current - (n - absorbed)) };
    }
    case 'heal':
      return { ...state, current: cap(current + n) };
    case 'temp':
      // Temporary HP don't stack: keep the higher amount.
      return { ...state, temp: Math.max(state.temp, n) };
    case 'set':
      return { ...state, current: cap(n) };
    case 'full':
      // A long rest: back to maximum, temporary HP gone.
      return { ...state, current: state.max ?? current, temp: 0 };
  }
}

/** What gets written back to the entry's attributes. */
export function hpToAttributes(state: HpState): { currentHp: string; tempHp: string } {
  return { currentHp: state.current === null ? '' : String(state.current), tempHp: state.temp > 0 ? String(state.temp) : '' };
}

// ---------------------------------------------------------------------------
// Death saving throws (stored on the character as "successes/failures", e.g. "2/1").
// ---------------------------------------------------------------------------

export interface DeathSaves {
  successes: number;
  failures: number;
}

export function readDeathSaves(attributes: Record<string, unknown> | undefined): DeathSaves {
  const m = String(attributes?.deathSaves ?? '').match(/(\d)\s*\/\s*(\d)/);
  return m ? { successes: Math.min(3, +m[1]), failures: Math.min(3, +m[2]) } : { successes: 0, failures: 0 };
}

export const writeDeathSaves = (d: DeathSaves) => `${d.successes}/${d.failures}`;

/**
 * A rolled death save: 1 counts as two failures, 20 brings the character back with 1 HP,
 * 10 or more is a success. Three successes: stable. Three failures: dead.
 */
export function rollDeathSave(d: DeathSaves, roll: number): { saves: DeathSaves; regain: boolean } {
  if (roll >= 20) return { saves: { successes: 0, failures: 0 }, regain: true };
  if (roll <= 1) return { saves: { ...d, failures: Math.min(3, d.failures + 2) }, regain: false };
  if (roll >= 10) return { saves: { ...d, successes: Math.min(3, d.successes + 1) }, regain: false };
  return { saves: { ...d, failures: Math.min(3, d.failures + 1) }, regain: false };
}

export function deathState(d: DeathSaves): 'dying' | 'stable' | 'dead' {
  return d.failures >= 3 ? 'dead' : d.successes >= 3 ? 'stable' : 'dying';
}

/**
 * Death saves after an HP change (5e): a hit while at 0 HP is a failed save; damage that leaves at
 * least the hit point maximum over after reaching 0 kills outright (unless the table switched that
 * off); back above 0 resets them.
 * `undefined` = leave the saves as they are.
 */
export function deathSavesAfter(before: HpState, after: HpState, kind: HpChange, amount: number, saves: DeathSaves, massiveDamage = true): { deathSaves?: string; massive: boolean } {
  const n = Math.max(0, Math.trunc(amount) || 0);
  const nowUp = (after.current ?? 1) > 0;
  if (nowUp) return { deathSaves: saves.successes || saves.failures ? '' : undefined, massive: false };
  if (kind !== 'damage' || n <= 0) return { massive: false };
  const left = before.current === 0 ? n : n - (before.current ?? 0) - before.temp;
  if (massiveDamage && before.max && left >= before.max) return { deathSaves: writeDeathSaves({ successes: 0, failures: 3 }), massive: true };
  if (before.current === 0) return { deathSaves: writeDeathSaves({ ...saves, failures: Math.min(3, saves.failures + 1) }), massive: false };
  return { massive: false };
}
