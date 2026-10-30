/**
 * A character at the table: spell slots, class resources, hit dice, concentration and reaction.
 *
 * Two halves:
 *  - the setup (`PlayDef`, on the character in Firestore: attributes.play) changes rarely: which
 *    classes, any overrides of the maximums, extra counters, known and prepared spells;
 *  - what's used right now (`PlayLive`, in the chat's Realtime Database) changes every few
 *    minutes during play, is live for everyone and costs nothing against the Firestore limits.
 *
 * Maximums come from the class tables of the SRD (5.1 for 2014 rules, 5.2.1 for 2024), and every
 * one of them can be overridden. Pure functions: easy to test, no React, no Firebase.
 */
import classes2014 from '../../data/classes-2014.json';
import classes2024 from '../../data/classes-2024.json';

export type Edition = '2014' | '2024';
export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type Recharge = 'short' | 'long' | 'none';

interface LevelRow {
  pb?: number;
  s?: number[];
  pact?: [number, number];
  ca?: number;
  kn?: number;
  pr?: number;
  cs?: Record<string, number>;
}
interface ClassRow {
  n: string;
  hd: number;
  ab: Ability | null;
  cast: 'full' | 'half' | 'pact' | null;
  lv: (LevelRow | null)[];
}
const TABLES: Record<Edition, Record<string, ClassRow>> = {
  '2014': classes2014 as unknown as Record<string, ClassRow>,
  '2024': classes2024 as unknown as Record<string, ClassRow>,
};
export const CLASS_IDS = Object.keys(classes2014);
export const className = (id: string) => (classes2014 as Record<string, { n: string }>)[id]?.n ?? id;

export interface ClassLevel {
  cls: string;
  lvl: number;
}

/** A counter of the player's own: from a feat, a subclass feature, an item… */
export interface Counter {
  id: string;
  name: string;
  max: number;
  rest: Recharge;
  /** Uses of this counter can cast this spell instead of a slot. */
  spell?: string;
  /** Uses follow the proficiency bonus or an ability modifier (at least 1) instead of `max`. */
  per?: 'pb' | Ability;
}

/** The setup, stored on the character (attributes.play). Everything is optional: missing = worked out. */
export interface PlayDef {
  /** Classes and levels, when the "Class & Level" text doesn't say it clearly. */
  classes?: ClassLevel[];
  /** Spell slot maximums by level ("1"…"9"), overriding the class table. */
  slots?: Record<string, number>;
  /** Warlock pact slots: how many, and their level. */
  pact?: { n: number; l: number } | null;
  /** Class resources: a different maximum, or hidden. */
  res?: Record<string, { max?: number; off?: boolean }>;
  counters?: Counter[];
  /** Hit dice, when the classes don't say (die size, how many). */
  hd?: { die?: number; max?: number };
  /** Spellcasting ability, when it isn't the class's. */
  ability?: Ability;
  spells?: { known?: string[]; prepared?: string[]; always?: string[] };
}

/** What's used right now (Realtime Database: rooms/{campaign}/play/{key}). */
export interface PlayLive {
  /** Who may change it (the player, or the DM): kept by the database rules. */
  uid?: string;
  name?: string;
  /** Used slots by level. */
  s?: Record<string, number>;
  /** Used pact slots. */
  p?: number;
  /** Used class resources and counters, by key. */
  r?: Record<string, number>;
  /** Spent hit dice, by die size ("8": 2). */
  h?: Record<string, number>;
  /** Concentrating. */
  conc?: 1;
  /** Reaction used this round. */
  re?: 1;
  /** The spell being concentrated on. */
  cs?: string;
}

export interface Resource {
  key: string;
  name: string;
  max: number;
  rest: Recharge;
  /** Regains one use on a short rest (and all on a long one), as in the 2024 rules. */
  shortOne?: boolean;
  /** A pool of points (Lay on Hands, Ki…) rather than a few uses: shown as a number, not pips. */
  pool?: boolean;
  note?: string;
  spell?: string;
  custom?: boolean;
}

export interface Derived {
  classes: ClassLevel[];
  level: number;
  pb: number;
  /** Slot maximums, index 0 = 1st level. */
  slots: number[];
  pact: { n: number; l: number } | null;
  resources: Resource[];
  /** Hit dice by die size (multiclassing can mix them). */
  hitDice: { die: number; max: number }[];
  hitDiceMax: number;
  ability: Ability | null;
  mods: Record<Ability, number>;
  saveDC: number | null;
  attack: number | null;
  /** How the class picks its spells. */
  prep: 'prepared' | 'known' | 'spellbook' | null;
  preparedMax: number | null;
  cantripsMax: number | null;
  casterClasses: string[];
}

const ALIASES: Record<string, string> = { warlock: 'warlock', sorceror: 'sorcerer', 'artificer': 'artificer' };

/** "Druid 5", "Fighter 2 / Wizard 1", "Rogue (Thief) 3", "Lvl 4 Cleric" → classes and levels. */
export function parseClasses(text: unknown): ClassLevel[] {
  const s = String(text ?? '').toLowerCase();
  const out: (ClassLevel & { at: number })[] = [];
  for (const id of CLASS_IDS.concat(Object.keys(ALIASES))) {
    const cls = ALIASES[id] ?? id;
    if (out.some((c) => c.cls === cls)) continue;
    const m = s.match(new RegExp(`${id}[^\\d/,;]*?(\\d{1,2})`)) ?? s.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?[^\\d/,;a-z]*(?:level\\s*)?${id}`));
    const at = s.indexOf(id);
    if (m && CLASS_IDS.includes(cls)) out.push({ cls, lvl: Math.max(1, Math.min(20, Number(m[1]))), at });
    else if (at >= 0 && CLASS_IDS.includes(cls)) out.push({ cls, lvl: 1, at });
  }
  // In the order written: the first class is the one the character started with (saving throws).
  return out.sort((a, b) => a.at - b.at).map(({ cls, lvl }) => ({ cls, lvl }));
}

export const abilityMod = (score: unknown) => {
  const n = Number(score);
  return Math.floor(((Number.isFinite(n) ? n : 10) - 10) / 2);
};
export const profBonus = (level: number) => Math.ceil(Math.max(1, level) / 4) + 1;

/** Full-caster slot table (also the multiclass table), by caster level 1–20. */
function fullSlots(level: number): number[] {
  const t = TABLES['2014'].wizard.lv[Math.max(1, Math.min(20, level)) - 1];
  return [...(t?.s ?? [])];
}

const row = (ed: Edition, c: ClassLevel) => TABLES[ed][c.cls]?.lv[c.lvl - 1] ?? null;

/** The class's own resources at that level (the SRD's numbers; anything can be overridden). */
function classResources(ed: Edition, c: ClassLevel, mods: Record<Ability, number>): Resource[] {
  const r = row(ed, c);
  const cs = r?.cs ?? {};
  const out: Resource[] = [];
  const add = (key: string, name: string, max: number, rest: Recharge, extra: Partial<Resource> = {}) => max > 0 && out.push({ key, name, max, rest, ...extra });
  const two = ed === '2024';
  switch (c.cls) {
    case 'barbarian':
      add('rage', 'Rage', cs.rage_count >= 100 ? 99 : cs.rage_count ?? 2, 'long', two ? { shortOne: true } : {});
      break;
    case 'bard':
      add('inspiration', 'Bardic Inspiration', Math.max(1, mods.cha), c.lvl >= 5 ? 'short' : 'long', { note: cs.bardic_inspiration_die ? `d${cs.bardic_inspiration_die}` : undefined });
      break;
    case 'cleric':
      add('channel', 'Channel Divinity', cs.channel_divinity_charges ?? (c.lvl >= 2 ? 1 : 0), 'short', two ? { shortOne: true, rest: 'long' } : {});
      break;
    case 'druid':
      add('wildshape', 'Wild Shape', cs.wild_shape_uses ?? (c.lvl >= 2 ? (c.lvl >= 20 ? 99 : 2) : 0), 'short', two ? { shortOne: true, rest: 'long' } : {});
      break;
    case 'fighter':
      add('secondwind', 'Second Wind', cs.second_wind_uses ?? 1, 'short', two ? { shortOne: true, rest: 'long' } : {});
      add('surge', 'Action Surge', cs.action_surges ?? (c.lvl >= 17 ? 2 : c.lvl >= 2 ? 1 : 0), 'short');
      add('indomitable', 'Indomitable', cs.indomitable_uses ?? (c.lvl >= 17 ? 3 : c.lvl >= 13 ? 2 : c.lvl >= 9 ? 1 : 0), 'long');
      break;
    case 'monk':
      add('ki', two ? 'Focus Points' : 'Ki Points', cs.focus_points ?? cs.ki_points ?? (c.lvl >= 2 ? c.lvl : 0), 'short', { pool: true });
      break;
    case 'paladin':
      add('layonhands', 'Lay on Hands', 5 * c.lvl, 'long', { pool: true, note: 'hit points' });
      if (!two) add('divinesense', 'Divine Sense', 1 + Math.max(0, mods.cha), 'long');
      add('channel', 'Channel Divinity', cs.channel_divinity_charges ?? (c.lvl >= 3 ? 1 : 0), 'short', two ? { shortOne: true, rest: 'long' } : {});
      break;
    case 'sorcerer':
      add('sorcery', 'Sorcery Points', cs.sorcery_points ?? (c.lvl >= 2 ? c.lvl : 0), 'long', { pool: true });
      break;
    case 'warlock':
      for (const l of [6, 7, 8, 9]) add(`arcanum${l}`, `Mystic Arcanum (level ${l})`, cs[`mystic_arcanum_level_${l}`] ?? (c.lvl >= 2 * l - 1 ? 1 : 0), 'long');
      break;
    case 'wizard':
      add('arcanerecovery', 'Arcane Recovery', 1, 'long', { note: `slots up to ${Math.ceil(c.lvl / 2)} levels` });
      break;
  }
  return out;
}

const PREP: Record<string, Derived['prep']> = { cleric: 'prepared', druid: 'prepared', paladin: 'prepared', wizard: 'spellbook', bard: 'known', ranger: 'known', sorcerer: 'known', warlock: 'known' };

export interface DeriveInput {
  classLevel?: unknown;
  stats?: Partial<Record<Ability, number>> & { proficiencyBonus?: string };
  def?: PlayDef | null;
  edition?: Edition;
}

/** Everything the tracker shows, worked out from the classes, the stats and the overrides. */
export function derive({ classLevel, stats, def, edition = '2014' }: DeriveInput): Derived {
  const ed: Edition = edition === '2024' ? '2024' : '2014';
  const classes = def?.classes?.length ? def.classes.filter((c) => TABLES[ed][c.cls]) : parseClasses(classLevel);
  const level = Math.min(20, classes.reduce((a, c) => a + c.lvl, 0));
  const mods = Object.fromEntries((['str', 'dex', 'con', 'int', 'wis', 'cha'] as Ability[]).map((a) => [a, abilityMod(stats?.[a])])) as Record<Ability, number>;
  const pbText = Number(String(stats?.proficiencyBonus ?? '').replace(/[^\d-]/g, ''));
  const pb = Number.isFinite(pbText) && pbText > 0 ? pbText : profBonus(level || 1);

  // Spell slots: one class uses its own table; several use the multiclass caster level.
  const casters = classes.filter((c) => TABLES[ed][c.cls]?.cast && TABLES[ed][c.cls].cast !== 'pact');
  let slots: number[] = [];
  if (casters.length === 1) slots = [...(row(ed, casters[0])?.s ?? [])];
  else if (casters.length > 1) {
    const casterLevel = casters.reduce((a, c) => a + (TABLES[ed][c.cls].cast === 'full' ? c.lvl : ed === '2024' ? Math.ceil(c.lvl / 2) : Math.floor(c.lvl / 2)), 0);
    slots = casterLevel ? fullSlots(casterLevel) : [];
  }
  for (const [k, v] of Object.entries(def?.slots ?? {})) {
    const i = Number(k) - 1;
    if (i >= 0 && i < 9 && Number.isFinite(v)) {
      while (slots.length <= i) slots.push(0);
      slots[i] = Math.max(0, Math.min(9, Math.round(v)));
    }
  }
  while (slots.length && !slots[slots.length - 1]) slots.pop();
  const lock = classes.find((c) => c.cls === 'warlock');
  const tablePact = lock ? row(ed, lock)?.pact : undefined;
  const pact = def?.pact !== undefined ? (def.pact && def.pact.n > 0 ? def.pact : null) : tablePact ? { n: tablePact[0], l: tablePact[1] } : null;

  // Resources: the classes' own, with overrides; then the player's counters.
  const resources: Resource[] = [];
  for (const c of classes) for (const r of classResources(ed, c, mods)) if (!resources.some((x) => x.key === r.key)) resources.push(r);
  for (const r of resources) {
    const o = def?.res?.[r.key];
    if (o?.max !== undefined && Number.isFinite(o.max)) r.max = Math.max(0, o.max);
  }
  const shown = resources.filter((r) => !def?.res?.[r.key]?.off && r.max > 0);
  for (const c of def?.counters ?? []) {
    const max = c.per === 'pb' ? pb : c.per ? Math.max(1, mods[c.per]) : Math.max(0, c.max);
    shown.push({ key: `x_${c.id}`, name: c.name || 'Counter', max, rest: c.rest, spell: c.spell, custom: true });
  }

  // Hit dice: one per level, the size of each class's die.
  const byDie = new Map<number, number>();
  for (const c of classes) {
    const d = TABLES[ed][c.cls]?.hd ?? 8;
    byDie.set(d, (byDie.get(d) ?? 0) + c.lvl);
  }
  let hitDice = [...byDie.entries()].sort((a, b) => b[0] - a[0]).map(([die, max]) => ({ die, max }));
  if (def?.hd?.die || def?.hd?.max) hitDice = [{ die: def.hd.die ?? hitDice[0]?.die ?? 8, max: def.hd.max ?? (level || 1) }];
  const hitDiceMax = hitDice.reduce((a, h) => a + h.max, 0);

  // Spellcasting: the first casting class decides the ability and the way spells are chosen.
  const casterClasses = classes.filter((c) => TABLES[ed][c.cls]?.cast).map((c) => c.cls);
  const main = classes.find((c) => TABLES[ed][c.cls]?.cast);
  const ability = def?.ability ?? (main ? TABLES[ed][main.cls].ab : null);
  const mainRow = main ? row(ed, main) : null;
  const prep: Derived['prep'] = main ? (ed === '2024' ? (main.cls === 'wizard' ? 'spellbook' : 'prepared') : PREP[main.cls] ?? 'known') : null;
  let preparedMax: number | null = null;
  if (main) {
    if (mainRow?.pr) preparedMax = mainRow.pr;
    else if (mainRow?.kn) preparedMax = mainRow.kn;
    else if (ability) {
      const lv = TABLES[ed][main.cls].cast === 'half' ? Math.floor(main.lvl / 2) : main.lvl;
      preparedMax = Math.max(1, mods[ability] + lv);
    }
  }
  return {
    classes,
    level,
    pb,
    slots,
    pact,
    resources: shown,
    hitDice,
    hitDiceMax,
    ability,
    mods,
    saveDC: ability ? 8 + pb + mods[ability] : null,
    attack: ability ? pb + mods[ability] : null,
    prep,
    preparedMax,
    cantripsMax: mainRow?.ca ?? null,
    casterClasses,
  };
}

// ---------------------------------------------------------------------------
// Using and regaining
// ---------------------------------------------------------------------------

export const slotsLeft = (d: Derived, live: PlayLive | null | undefined, level: number) => Math.max(0, (d.slots[level - 1] ?? 0) - (live?.s?.[String(level)] ?? 0));
export const pactLeft = (d: Derived, live: PlayLive | null | undefined) => (d.pact ? Math.max(0, d.pact.n - (live?.p ?? 0)) : 0);
export const resourceLeft = (r: Resource, live: PlayLive | null | undefined) => Math.max(0, r.max - (live?.r?.[r.key] ?? 0));
const spentDice = (live: PlayLive | null | undefined) => Object.values(live?.h ?? {}).reduce((a, n) => a + (n || 0), 0);
export const hitDiceLeft = (d: Derived, live: PlayLive | null | undefined) => Math.max(0, d.hitDiceMax - spentDice(live));
/** Hit dice of one size still there (a multiclassed character has several sizes). */
export const hitDieLeft = (d: Derived, live: PlayLive | null | undefined, die: number) => Math.max(0, (d.hitDice.find((h) => h.die === die)?.max ?? 0) - (live?.h?.[String(die)] ?? 0));

/** The DC of the Constitution save to keep concentrating after taking damage. */
export function concentrationDC(damage: number, edition: Edition = '2014') {
  const dc = Math.max(10, Math.floor(Math.max(0, damage) / 2));
  return edition === '2024' ? Math.min(30, dc) : dc;
}

/** After a short rest: short-rest resources and pact slots come back. */
export function shortRest(d: Derived, live: PlayLive): PlayLive {
  const r = { ...(live.r ?? {}) };
  for (const res of d.resources) {
    if (res.rest === 'short') delete r[res.key];
    else if (res.shortOne && r[res.key]) r[res.key] = Math.max(0, r[res.key] - 1);
  }
  return { ...live, r: clean(r), p: 0 };
}

/**
 * After a long rest: everything comes back except some hit dice. 2014: up to half the character's
 * total (at least one). 2024: all of them. Concentration and reaction end.
 */
export function longRest(d: Derived, live: PlayLive, edition: Edition = '2014'): PlayLive {
  const r = { ...(live.r ?? {}) };
  for (const res of d.resources) if (res.rest !== 'none') delete r[res.key];
  let back = edition === '2024' ? d.hitDiceMax : Math.max(1, Math.floor(d.hitDiceMax / 2));
  // The biggest dice come back first.
  const h = { ...(live.h ?? {}) };
  for (const k of Object.keys(h).sort((a, b) => Number(b) - Number(a))) {
    const n = Math.min(back, h[k]);
    h[k] -= n;
    back -= n;
  }
  return { uid: live.uid, name: live.name, r: clean(r), h: clean(h) };
}

function clean<T extends Record<string, number>>(o: T): T {
  for (const k of Object.keys(o)) if (!o[k]) delete o[k];
  return o;
}

/** The key a character's (or a token's) live state is stored under. */
export const playKey = (entityId: string | null | undefined, tokenId?: string) => (entityId ? `c_${entityId}` : `t_${tokenId}`);

export const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
