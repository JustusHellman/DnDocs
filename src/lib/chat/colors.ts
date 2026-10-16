/**
 * Everyone at the table gets a colour of their own: their dice, pings and rulers on the map, a
 * ring on the tokens they play, and a quiet tint on their chat lines. Pure helpers; the colours
 * themselves live in the Realtime Database next to the chat (see service.ts).
 */

export interface TableColor {
  hex: string;
  name: string;
}

/** Bright enough to read on the dark chat and the parchment maps, and easy to tell apart. */
export const PALETTE: TableColor[] = [
  { hex: '#e0a526', name: 'Gold' },
  { hex: '#e5484d', name: 'Crimson' },
  { hex: '#f07c2e', name: 'Ember' },
  { hex: '#9bcf3c', name: 'Moss' },
  { hex: '#2fbf7f', name: 'Emerald' },
  { hex: '#22b5b5', name: 'Teal' },
  { hex: '#4c9ef0', name: 'Sky' },
  { hex: '#7c7ff2', name: 'Indigo' },
  { hex: '#b06ae6', name: 'Violet' },
  { hex: '#ea63ad', name: 'Rose' },
  { hex: '#9aabbf', name: 'Steel' },
  { hex: '#c08e5c', name: 'Bronze' },
];
/** The DM's colour when it's free. Players are only given it if they pick it themselves. */
export const DM_COLOR = PALETTE[0].hex;
/** For anyone without a colour yet. */
export const FALLBACK = '#e8c77a';

export const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Dark or light numbers on a die of this colour: whichever reads better (WCAG contrast). */
export function textOn(hex: string) {
  if (!isColor(hex)) return '#1c140d';
  const l = luminance(hex);
  // Contrast with near-black (#1c140d, L≈0.008) vs white (L=1).
  return (l + 0.05) / 0.058 >= 1.05 / (l + 0.05) ? '#1c140d' : '#ffffff';
}

/** A colour as a faint wash (e.g. a chat bubble): `alpha` 0–1. */
export function tint(hex: string, alpha: number) {
  if (!isColor(hex)) return undefined;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A colour for someone who doesn't have one: a free one, picked "at random" (but the same pick
 * every time for the same person, so two tabs agree). The DM gets gold when it's free.
 */
export function pickColor(uid: string, colors: Record<string, string>, isOwner: boolean): string {
  const taken = new Set(Object.entries(colors).filter(([u]) => u !== uid).map(([, c]) => c.toLowerCase()));
  if (isOwner && !taken.has(DM_COLOR)) return DM_COLOR;
  const free = PALETTE.slice(1).filter((c) => !taken.has(c.hex));
  const pool = free.length ? free : PALETTE.slice(1);
  return pool[hash(uid) % pool.length].hex;
}

/**
 * Two people who ended up with the same colour (they picked at the same moment): the one whose
 * id sorts later should pick again. True for `uid` when that's them.
 */
export function shouldRepick(uid: string, colors: Record<string, string>) {
  const mine = colors[uid]?.toLowerCase();
  if (!mine) return false;
  return Object.entries(colors).some(([u, c]) => u !== uid && c.toLowerCase() === mine && u < uid);
}
