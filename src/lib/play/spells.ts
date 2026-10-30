/**
 * Spells: the SRD's (built in, loaded only when spells are first opened) and the campaign's own
 * cards that players and the DM write themselves (kept in the chat's Realtime Database, readable
 * only by the campaign's members).
 *
 * SRD 5.1 (2014 rules) and SRD 5.2.1 (2024 rules) by Wizards of the Coast, CC-BY-4.0.
 */
import type { Edition } from './model';

export interface Spell {
  /** Id: the SRD index ("fireball"), or "x-…" for a campaign card. */
  i: string;
  /** Name. */
  n: string;
  /** Level (0 = cantrip). */
  l: number;
  /** School. */
  s: string;
  /** Class lists it's on. */
  c: string[];
  /** Casting time, range, components ("VSM"), duration. */
  t: string;
  r: string;
  v: string;
  d: string;
  m?: string;
  /** Concentration, ritual. */
  k?: 1;
  ri?: 1;
  /** Text and "at higher levels". */
  x: string;
  h?: string;
  /** Area: kind and size in feet (lines also have a width). */
  a?: { k: 'sphere' | 'cube' | 'cone' | 'cylinder' | 'line'; f: number; w?: number };
  /** Damage: type, dice by slot level ("at") or by character level for cantrips ("cl"). */
  dm?: { ty: string; at?: Record<string, string>; cl?: Record<string, string> };
  /** Healing dice by slot level ("+ MOD" = plus the spellcasting modifier). */
  he?: Record<string, string>;
  /** Saving throw ability, and what a success does. */
  sv?: string;
  sh?: string;
  /** Spell attack. */
  at?: 'ranged' | 'melee';
  /** A campaign card: who wrote it, and an optional book reference. */
  by?: string;
  ref?: string;
  /** A spell outside the free rules: its facts only, the text is in the book (`ref`). */
  xs?: 1;
  /** Only for these rules (the other edition's free rules have their own version). */
  e?: Edition;
  /** Who wrote the description (for a spell that comes without text). */
  nb?: string;
}

const cache = new Map<Edition, Promise<Spell[]>>();

/** The SRD spells for the campaign's rules (loaded once, on first use). */
export function loadSrdSpells(edition: Edition): Promise<Spell[]> {
  let p = cache.get(edition);
  if (!p) {
    // The free rules' spells, then the others' facts (no text) that these rules don't already have.
    p = Promise.all([edition === '2024' ? import('../../data/spells-2024.json') : import('../../data/spells-2014.json'), import('../../data/spells-extra.json')]).then(([srd, extra]) => [
      ...(srd.default as unknown as Spell[]),
      ...(extra.default as unknown as Spell[]).filter((s) => !s.e || s.e === edition),
    ]);
    cache.set(edition, p);
  }
  return p;
}

export const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];

/** The dice for a spell's damage (or healing) cast at `slot` by a character of `charLevel`. */
export function dmgAt(sp: Spell, slot: number, charLevel: number): string | null {
  if (sp.dm?.cl) {
    const keys = Object.keys(sp.dm.cl).map(Number).sort((a, b) => a - b);
    let best = keys[0];
    for (const k of keys) if (charLevel >= k) best = k;
    return sp.dm.cl[String(best)] ?? null;
  }
  return pickAt(sp.dm?.at, slot);
}
export const healAt = (sp: Spell, slot: number) => pickAt(sp.he, slot);
function pickAt(table: Record<string, string> | undefined, slot: number) {
  if (!table) return null;
  if (table[String(slot)]) return table[String(slot)];
  const keys = Object.keys(table).map(Number).filter((k) => k <= slot).sort((a, b) => b - a);
  return keys.length ? table[String(keys[0])] : null;
}

const ABIL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export const abilityName = (a: string | undefined) => (a ? ABIL[a] ?? a.toUpperCase() : '');

/** "20-ft cube", "15-ft cone", "100 × 5-ft line", "20-ft radius". */
export function areaLabel(a: Spell['a']) {
  if (!a) return '';
  if (a.k === 'line') return `${a.f}-ft line, ${a.w ?? 5} ft wide`;
  if (a.k === 'sphere') return `${a.f}-ft radius`;
  if (a.k === 'cylinder') return `${a.f}-ft radius cylinder`;
  return `${a.f}-ft ${a.k}`;
}

/** Does the area start at the caster ("Self (15-foot cone)", or a cone/line with range Self)? */
export const fromSelf = (sp: Spell) => /^self/i.test(sp.r) && !!sp.a;

/** The short line a cast posts: "2nd level · concentration, 1 min · 120 ft · CON save". */
export function castSummary(sp: Spell, slot: number) {
  const bits = [sp.l === 0 ? 'cantrip' : slot > sp.l ? `cast at ${ordinalWord(slot)}` : `${ordinalWord(sp.l)} level`];
  if (sp.k) bits.push(`concentration, ${sp.d.replace(/^up to /i, '').replace(/concentration,?\s*/i, '')}`);
  else if (!/instant/i.test(sp.d)) bits.push(sp.d);
  if (sp.a) bits.push(areaLabel(sp.a));
  else bits.push(sp.r);
  if (sp.sv) bits.push(`${sp.sv.toUpperCase()} save`);
  if (sp.at) bits.push(`${sp.at} spell attack`);
  return bits.join(' · ');
}
const ordinalWord = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** What a spell's level looks like on the cards. */
export const LEVEL_TONE = ['#7a6447', '#2f6e8e', '#2f9e44', '#c46a12', '#8b2a1c', '#6d3fa0', '#1c6e6a', '#9a3b6b', '#4b4f9e', '#a3741a'];

/** A campaign card, as entered by a player (checked before it's saved). */
export function cleanCustomSpell(s: Partial<Spell>, by: string): Spell {
  const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  const lvl = Math.max(0, Math.min(9, Math.round(Number(s.l) || 0)));
  const out: Spell = {
    i: s.i && s.i.startsWith('x-') ? s.i : `x-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    n: str(s.n, 80) || 'Untitled spell',
    l: lvl,
    s: SCHOOLS.includes(String(s.s)) ? String(s.s) : 'Evocation',
    c: (s.c ?? []).map((c) => str(c, 20)).filter(Boolean).slice(0, 12),
    t: str(s.t, 40) || '1 action',
    r: str(s.r, 40) || '—',
    v: str(s.v, 3).toUpperCase().replace(/[^VSM]/g, ''),
    d: str(s.d, 60) || 'Instantaneous',
    x: str(s.x, 2500),
    by,
  };
  if (s.m) out.m = str(s.m, 120);
  if (s.k) out.k = 1;
  if (s.ri) out.ri = 1;
  if (s.h) out.h = str(s.h, 600);
  if (s.ref) out.ref = str(s.ref, 60);
  if (s.a && ['sphere', 'cube', 'cone', 'cylinder', 'line'].includes(s.a.k) && s.a.f > 0) out.a = { k: s.a.k, f: Math.min(500, Math.round(s.a.f)), ...(s.a.k === 'line' ? { w: Math.max(5, Math.min(60, Math.round(s.a.w ?? 5))) } : {}) };
  if (s.dm?.at && Object.keys(s.dm.at).length) out.dm = { ty: str(s.dm.ty, 20), at: s.dm.at };
  if (s.sv && ABIL[s.sv]) out.sv = s.sv;
  if (s.at === 'ranged' || s.at === 'melee') out.at = s.at;
  return out;
}
