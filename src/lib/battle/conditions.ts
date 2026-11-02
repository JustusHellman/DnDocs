/**
 * What the conditions do, in a line each (from the free rules, in our own words), shown when you
 * point at one on a token. Effects the turn helper adds (Dodging, Disengaged…) are explained too.
 */
const RULES: Record<string, string> = {
  blinded: "Can't see (fails checks that need sight). Its attacks have disadvantage; attacks against it have advantage.",
  charmed: "Can't attack the charmer or target it with harmful effects. The charmer has advantage on social checks with it.",
  concentrating: 'Holding a spell. Damage means a Constitution save (DC 10 or half the damage); 0 HP or another concentration spell ends it.',
  deafened: "Can't hear (fails checks that need hearing).",
  exhaustion: '2014: levels 1–6 (disadvantage on checks, half speed, … death at 6). 2024: −2 per level to d20 tests and −5 ft speed per level; death at 6.',
  frightened: "Disadvantage on checks and attacks while it can see the source; can't willingly move closer to it.",
  grappled: 'Speed 0. Ends if the grappler is incapacitated or it gets out of reach. (2024: disadvantage on attacks against anyone but the grappler.)',
  incapacitated: "Can't take actions or reactions. (2024: also no bonus actions, can't concentrate or speak, and rolls initiative with disadvantage.)",
  invisible: "Can't be seen without magic. Its attacks have advantage; attacks against it have disadvantage.",
  paralyzed: "Incapacitated, can't move or speak. Fails Strength and Dexterity saves; attacks against it have advantage, and hits from within 5 ft are critical.",
  petrified: 'Turned to stone: incapacitated, unaware, resistant to all damage, immune to poison and disease. Fails Strength and Dexterity saves.',
  poisoned: 'Disadvantage on attack rolls and ability checks.',
  prone: 'Can only crawl (or stand up for half its speed). Its attacks have disadvantage; attacks within 5 ft have advantage, from farther away disadvantage.',
  restrained: 'Speed 0. Its attacks and Dexterity saves have disadvantage; attacks against it have advantage.',
  stunned: "Incapacitated, can't move, speaks falteringly. Fails Strength and Dexterity saves; attacks against it have advantage.",
  unconscious: 'Incapacitated, drops what it holds and falls prone. Fails Strength and Dexterity saves; attacks have advantage, and hits from within 5 ft are critical.',
  dodging: 'Took the Dodge action: attacks against it have disadvantage and it has advantage on Dexterity saves, until its next turn.',
  disengaged: "Took the Disengage action: its movement doesn't provoke opportunity attacks this turn.",
  hidden: 'Hidden: unseen and unheard until found or it gives itself away (attacking, casting with a voice…). Attacks it makes have advantage.',
  readied: 'Has an action readied: it uses its reaction to do it when the trigger happens (until its next turn).',
  rage: 'Raging: advantage on Strength checks and saves, extra damage on Strength attacks, resistance to bludgeoning, piercing and slashing.',
  bless: '+1d4 to attack rolls and saving throws.',
  bane: '−1d4 to attack rolls and saving throws.',
  haste: 'Double speed, +2 AC, advantage on Dexterity saves, one extra limited action. When it ends: a turn without moving or acting.',
  slow: 'Half speed, −2 AC and Dexterity saves, no reactions, only an action or a bonus action, and spells may fail to go off.',
  flying: 'In the air: falls if knocked prone or its speed drops to 0 (unless it can hover).',
};

/** The rule text for a condition or effect name, if it's a known one. */
export function conditionRule(name: string): string | null {
  return RULES[name.trim().toLowerCase()] ?? null;
}
