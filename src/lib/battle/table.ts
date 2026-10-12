/** Table conventions for battle maps: conditions, colours, sizes and dice. */

export const CONDITIONS = [
  'Blinded',
  'Charmed',
  'Concentrating',
  'Deafened',
  'Exhaustion',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
] as const;

/** Common spell effects and states, offered alongside the conditions (anything can be typed). */
export const EFFECTS = ['Bless', 'Bane', 'Blur', 'Dodging', 'Faerie Fire', 'Haste', 'Hex', 'Hidden', "Hunter's Mark", 'Mirror Image', 'Rage', 'Shield of Faith', 'Slow', 'Flying'];

/** Token rings and drawing inks that read on parchment and on dark maps alike. */
export const TOKEN_COLORS = ['#b8862b', '#8e2020', '#2d6a43', '#2e5b72', '#5b3a7d', '#9a5518', '#3c3a3c', '#c9c2b0'];
export const INK_COLORS = ['#d4202a', '#f2b632', '#2f9e44', '#1c7ed6', '#9c36b5', '#111111', '#f8f9fa'];

export const TOKEN_SIZES: { value: number; label: string }[] = [
  { value: 0.5, label: 'Tiny' },
  { value: 1, label: 'Small / Medium' },
  { value: 2, label: 'Large' },
  { value: 3, label: 'Huge' },
  { value: 4, label: 'Gargantuan' },
];

export function rollD20(mod = 0): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 20) + 1 + mod;
}

/** Spots around a point for placing several tokens at once (a small spiral of squares). */
export function spreadAround(x: number, y: number, count: number, size: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const step = Math.max(1, size);
  const taken = new Set<string>();
  for (let ring = 0; out.length < count && ring < 20; ring++) {
    for (let dy = -ring; dy <= ring && out.length < count; dy++) {
      for (let dx = -ring; dx <= ring && out.length < count; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const key = `${dx},${dy}`;
        if (taken.has(key)) continue;
        taken.add(key);
        out.push({ x: x + dx * step, y: y + dy * step });
      }
    }
  }
  return out;
}
