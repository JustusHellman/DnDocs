/**
 * Levelling up: the class text with one more level, the hit points it brings, and what changes
 * (slots, resources, turn options, Extra Attack, spells to choose) so nothing new goes unnoticed.
 * Pure functions.
 */
import { className, derive, ordinal, type ClassLevel, type Derived, type DeriveInput, type Edition } from './model';
import { attacksPerAction, classOptions } from './turn';

/** "Druid 5 (Circle of Stars)" with the druid one level up → "Druid 6 (Circle of Stars)"; a new class is added at the end. */
export function bumpClassText(text: string, cls: string): string {
  const name = className(cls);
  const re = new RegExp(`(${name}[^\\d/,;]*?)(\\d{1,2})`, 'i');
  if (re.test(text)) return text.replace(re, (_, pre: string, n: string) => `${pre}${Math.min(20, Number(n) + 1)}`);
  return text.trim() ? `${text.trim()} / ${name} 1` : `${name} 1`;
}

/** The hit die's average (rounded up, as the rules give it): d8 → 5. */
export const averageHp = (die: number) => Math.floor(die / 2) + 1;

export interface LevelChange {
  level: number;
  /** One line per thing that changed, in plain words. */
  lines: string[];
}

/** What levelling `cls` up changes, from the derived numbers before and after. */
export function whatChanges(input: DeriveInput, cls: string, edition: Edition): { before: Derived; after: Derived; change: LevelChange } {
  const before = derive({ ...input, edition });
  const classes: ClassLevel[] = before.classes.some((c) => c.cls === cls) ? before.classes.map((c) => (c.cls === cls ? { ...c, lvl: Math.min(20, c.lvl + 1) } : c)) : [...before.classes, { cls, lvl: 1 }];
  const after = derive({ ...input, def: { ...(input.def ?? {}), classes }, edition });
  const lines: string[] = [];
  if (after.pb > before.pb) lines.push(`Proficiency bonus +${after.pb} (attacks, saves and skills you're proficient in go up).`);
  after.slots.forEach((n, i) => {
    const was = before.slots[i] ?? 0;
    if (n > was) lines.push(`${n - was} more ${ordinal(i + 1)}-level spell slot${n - was > 1 ? 's' : ''}${was ? '' : ' — a new spell level'}.`);
  });
  if (after.pact && (!before.pact || after.pact.n > before.pact.n || after.pact.l > before.pact.l)) lines.push(`Pact slots: ${after.pact.n} of ${ordinal(after.pact.l)} level.`);
  for (const r of after.resources) {
    const was = before.resources.find((x) => x.key === r.key);
    if (!was) lines.push(`New: ${r.name} (${r.max}${r.pool ? '' : ` use${r.max > 1 ? 's' : ''}`}).`);
    else if (r.max > was.max) lines.push(`${r.name}: ${was.max} → ${r.max}.`);
  }
  const optsBefore = new Set(classOptions(edition, before).map((o) => o.id));
  for (const o of classOptions(edition, after)) if (!optsBefore.has(o.id)) lines.push(`New on your turn: ${o.name} (${o.cost === 'bonus' ? 'bonus action' : o.cost}).`);
  if (attacksPerAction(after) > attacksPerAction(before)) lines.push(`Extra Attack: ${attacksPerAction(after)} attacks with the Attack action.`);
  if ((after.cantripsMax ?? 0) > (before.cantripsMax ?? 0)) lines.push(`One more cantrip to learn (${after.cantripsMax}).`);
  if ((after.preparedMax ?? 0) > (before.preparedMax ?? 0)) lines.push(`${after.prep === 'known' ? 'Spells known' : 'Spells prepared'}: ${before.preparedMax ?? 0} → ${after.preparedMax}.`);
  const lvl = classes.find((c) => c.cls === cls)!.lvl;
  if ([4, 8, 12, 16, 19, ...(ASI_EXTRA[cls] ?? [])].includes(lvl)) lines.push(`${className(cls)} ${lvl}: an Ability Score Improvement (or a feat).`);
  if ((edition === '2024' && lvl === 3) || (edition === '2014' && lvl === SUBCLASS_2014[cls])) lines.push(`${className(cls)} ${lvl}: choose your subclass.`);
  lines.push(`Check your class's ${ordinal(lvl)}-level features too (anything from your subclass goes in as your own counter).`);
  return { before, after, change: { level: after.level, lines } };
}

/** Classes with Ability Score Improvements beyond the usual 4, 8, 12, 16 and 19. */
const ASI_EXTRA: Record<string, number[]> = { fighter: [6, 14], rogue: [10] };

export const SUBCLASS_2014: Record<string, number> = { barbarian: 3, bard: 3, cleric: 1, druid: 2, fighter: 3, monk: 3, paladin: 3, ranger: 3, rogue: 3, sorcerer: 1, warlock: 1, wizard: 2 };
