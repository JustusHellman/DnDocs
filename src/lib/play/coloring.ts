/**
 * How spell cards are coloured: by level (the default), school, casting time or what the spell
 * does. Each person picks their own (kept on this device).
 */
import { useSyncExternalStore } from 'react';
import { LEVEL_TONE, type Spell } from './spells';

export type Coloring = 'level' | 'school' | 'time' | 'effect';

export const COLORINGS: { value: Coloring; label: string }[] = [
  { value: 'level', label: 'Level' },
  { value: 'school', label: 'School' },
  { value: 'time', label: 'Casting time' },
  { value: 'effect', label: 'Effect' },
];

const SCHOOL_TONE: Record<string, string> = {
  Abjuration: '#2f6e8e',
  Conjuration: '#c46a12',
  Divination: '#7a6447',
  Enchantment: '#9a3b6b',
  Evocation: '#8b2a1c',
  Illusion: '#6d3fa0',
  Necromancy: '#2f3b2f',
  Transmutation: '#2f9e44',
};
const TIME_TONE = { action: '#8b2a1c', bonus: '#c46a12', reaction: '#6d3fa0', longer: '#2f6e8e' };
const EFFECT_TONE = { damage: '#8b2a1c', healing: '#2f9e44', control: '#6d3fa0', other: '#7a6447' };

export const castTime = (sp: Spell): keyof typeof TIME_TONE => (/reaction/i.test(sp.t) ? 'reaction' : /bonus/i.test(sp.t) ? 'bonus' : /^1 action/i.test(sp.t) ? 'action' : 'longer');
export const effectOf = (sp: Spell): keyof typeof EFFECT_TONE => (sp.dm ? 'damage' : sp.he ? 'healing' : sp.sv || sp.at ? 'control' : 'other');

/** The colour of a spell's card in the chosen scheme. */
export function spellTone(sp: Spell, mode: Coloring): string {
  if (mode === 'school') return SCHOOL_TONE[sp.s] ?? '#7a6447';
  if (mode === 'time') return TIME_TONE[castTime(sp)];
  if (mode === 'effect') return EFFECT_TONE[effectOf(sp)];
  return LEVEL_TONE[sp.l] ?? LEVEL_TONE[0];
}

/** What the colours mean, for the little legend next to the picker. */
export function legend(mode: Coloring): { label: string; tone: string }[] {
  if (mode === 'school') return Object.entries(SCHOOL_TONE).map(([label, tone]) => ({ label, tone }));
  if (mode === 'time')
    return [
      { label: 'Action', tone: TIME_TONE.action },
      { label: 'Bonus action', tone: TIME_TONE.bonus },
      { label: 'Reaction', tone: TIME_TONE.reaction },
      { label: 'Longer', tone: TIME_TONE.longer },
    ];
  if (mode === 'effect')
    return [
      { label: 'Damage', tone: EFFECT_TONE.damage },
      { label: 'Healing', tone: EFFECT_TONE.healing },
      { label: 'Save or attack, no damage', tone: EFFECT_TONE.control },
      { label: 'Other', tone: EFFECT_TONE.other },
    ];
  return [];
}

const KEY = 'dndocs-spell-coloring';
let current: Coloring = (() => {
  try {
    const v = localStorage.getItem(KEY) as Coloring | null;
    return v && COLORINGS.some((c) => c.value === v) ? v : 'level';
  } catch {
    return 'level';
  }
})();
const subs = new Set<() => void>();
export const useColoring = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => current,
  );
export function setColoring(c: Coloring) {
  current = c;
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}
