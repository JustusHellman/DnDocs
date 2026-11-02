/**
 * What a creature can do on a turn: the options everyone has (by rules edition), the class features
 * that take an action, a bonus action or a reaction, the player's own counters, and (for monsters)
 * what their stat block lists. Pure functions: no React, no Firebase.
 *
 * What's used this turn lives with the rest of the table state (PlayLive: `ac`, `ax`, `ba`, `re`,
 * `mv`, `dx`, `sp`) and is reset at the start of the creature's turn and when combat ends.
 */
import type { Derived, Edition, PlayLive, Resource } from './model';

export type Cost = 'action' | 'bonus' | 'reaction' | 'free';

/** What a turn option does when picked (besides marking what it costs). */
export type Does = 'attack' | 'cast' | 'dash' | 'disengage' | 'dodge' | 'hide' | 'help' | 'ready' | 'search' | 'surge' | 'stand' | 'oa' | 'rage' | 'note';

export interface TurnOption {
  id: string;
  name: string;
  cost: Cost;
  /** One line, in plain words. */
  text: string;
  /** Where it comes from ("Rogue 2"), for anything that isn't for everyone. */
  from?: string;
  /** Spends this resource (key) when used… */
  res?: string;
  /** …this many (default 1). */
  n?: number;
  does?: Does;
  /** A creature's attack: the to-hit bonus and the damage dice from its stat block. */
  hit?: number;
  dmg?: { f: string; ty: string }[];
  /** A monster's ability that recharges ("5–6"). */
  recharge?: string;
}

const O = (id: string, name: string, cost: Cost, text: string, extra: Partial<TurnOption> = {}): TurnOption => ({ id, name, cost, text, ...extra });

/** The options every creature has. */
export function basicOptions(ed: Edition, attacks = 1): TurnOption[] {
  const two = ed === '2024';
  const atk = attacks > 1 ? `Make ${attacks} weapon or unarmed attacks (Extra Attack).` : 'One weapon or unarmed attack.';
  return [
    O('attack', attacks > 1 ? `Attack ×${attacks}` : 'Attack', 'action', `${atk} A grapple or shove can take the place of an attack.`, { does: 'attack' }),
    O('cast', two ? 'Magic' : 'Cast a Spell', 'action', two ? 'Cast a spell, or use a magic item or feature that takes the Magic action.' : 'Cast a spell with a casting time of 1 action.', { does: 'cast' }),
    O('dash', 'Dash', 'action', 'Your movement this turn doubles (you get your speed again).', { does: 'dash' }),
    O('disengage', 'Disengage', 'action', 'Your movement doesn’t provoke opportunity attacks for the rest of the turn.', { does: 'disengage' }),
    O('dodge', 'Dodge', 'action', 'Until your next turn: attacks against you have disadvantage, and you have advantage on Dexterity saves.', { does: 'dodge' }),
    O('help', 'Help', 'action', two ? 'Give an ally advantage on their next check, or on their next attack against an enemy next to you.' : 'Give an ally advantage on a check, or on the next attack against a creature within 5 ft of you.', { does: 'help' }),
    O('hide', 'Hide', 'action', two ? 'Make a DC 15 Dexterity (Stealth) check while out of sight (heavily obscured or behind cover).' : 'Make a Dexterity (Stealth) check to hide, out of sight of your enemies.', { does: 'hide' }),
    ...(two ? [O('influence', 'Influence', 'action', 'Try to sway a creature’s attitude (Deception, Intimidation, Performance or Persuasion).')] : []),
    O('ready', 'Ready', 'action', 'Pick a trigger and an action (or a spell): when it happens, you do it with your reaction.', { does: 'ready' }),
    O('search', 'Search', 'action', two ? 'Look or listen for something (Wisdom: Insight, Medicine, Perception or Survival).' : 'Look for something (Wisdom (Perception) or Intelligence (Investigation)).', { does: 'search' }),
    ...(two ? [O('study', 'Study', 'action', 'Recall or work out something (Intelligence: Arcana, History, Investigation, Nature or Religion).')] : []),
    O('object', two ? 'Utilize' : 'Use an Object', 'action', two ? 'Use a nonmagical object that needs an action (a potion takes a bonus action in 2024).' : 'Use an object that takes an action (a potion, a lever…).'),
    O('offhand', 'Off-hand attack', 'bonus', two ? 'After attacking with a Light weapon, attack with a different Light weapon in the other hand.' : 'After attacking with a light weapon, attack with another light weapon in your other hand (no ability modifier to damage).'),
    ...(two ? [O('potion', 'Drink a potion', 'bonus', 'Drink a potion, or give one to someone within 5 ft.')] : []),
    O('oa', 'Opportunity Attack', 'reaction', 'When an enemy you can see leaves your reach: one melee attack against it.', { does: 'oa' }),
    O('readied', 'Readied action', 'reaction', 'Do what you readied, when its trigger happens.'),
    O('interact', 'Interact with an object', 'free', 'Once a turn, with your move or action: draw a weapon, open a door, pick something up.'),
    O('talk', 'Talk', 'free', 'A few words or a short shout, any time.'),
  ];
}

/** How many attacks the Attack action makes at this level (Extra Attack). */
export function attacksPerAction(d: Pick<Derived, 'classes'>): number {
  let n = 1;
  for (const c of d.classes) {
    if (c.cls === 'fighter') n = Math.max(n, c.lvl >= 20 ? 4 : c.lvl >= 11 ? 3 : c.lvl >= 5 ? 2 : 1);
    else if (['barbarian', 'monk', 'paladin', 'ranger'].includes(c.cls) && c.lvl >= 5) n = Math.max(n, 2);
  }
  return n;
}

/**
 * The class features that take an action, a bonus action or a reaction (or are used for free on a
 * turn), by class and level, for each edition. Only the free rules' classes and features; anything
 * else goes in as the player's own counter.
 */
export function classOptions(ed: Edition, d: Pick<Derived, 'classes' | 'resources'>): TurnOption[] {
  const two = ed === '2024';
  const out: TurnOption[] = [];
  const has = (key: string) => d.resources.some((r) => r.key === key);
  for (const { cls, lvl } of d.classes) {
    const from = (l: number) => `${cls[0].toUpperCase()}${cls.slice(1)} ${l}`;
    const add = (min: number, o: TurnOption) => lvl >= min && !out.some((x) => x.id === o.id) && out.push({ ...o, from: o.from ?? from(min) });
    switch (cls) {
      case 'barbarian':
        if (has('rage')) add(1, O('rage', 'Rage', 'bonus', 'Advantage on Strength checks and saves, extra damage on Strength attacks, resistance to bludgeoning, piercing and slashing damage.', { res: 'rage', does: 'rage' }));
        add(2, O('reckless', 'Reckless Attack', 'free', 'On your first attack: advantage on Strength attacks this turn, but attacks against you have advantage until your next turn.'));
        break;
      case 'bard':
        if (has('inspiration')) add(1, O('inspire', 'Bardic Inspiration', 'bonus', 'Give a creature within 60 ft an Inspiration die to add to a roll.', { res: 'inspiration' }));
        if (two) add(7, O('countercharm', 'Countercharm', 'reaction', 'When a creature within 30 ft fails a save against being charmed or frightened: it rerolls with advantage.'));
        else add(6, O('countercharm', 'Countercharm', 'action', 'Until the end of your next turn, allies within 30 ft have advantage on saves against being charmed or frightened.'));
        break;
      case 'cleric':
        if (has('channel')) add(2, O('channel', two ? 'Channel Divinity' : 'Channel Divinity: Turn Undead', 'action', two ? 'Divine Spark (heal or harm 1d8 + Wisdom) or Turn Undead, or your domain’s option.' : 'Undead within 30 ft make a Wisdom save or are turned for a minute (or your domain’s option).', { res: 'channel' }));
        break;
      case 'druid':
        if (has('wildshape')) add(2, O('wildshape', 'Wild Shape', two ? 'bonus' : 'action', 'Turn into a beast you have seen (and back again as a bonus action).', { res: 'wildshape' }));
        break;
      case 'fighter':
        if (has('secondwind')) add(1, O('secondwind', 'Second Wind', 'bonus', `Regain 1d10 + ${lvl} hit points.`, { res: 'secondwind' }));
        if (has('surge')) add(2, O('surge', 'Action Surge', 'free', 'Take one more action this turn (not the Magic action, in 2024).', { res: 'surge', does: 'surge' }));
        if (has('indomitable')) add(9, O('indomitable', 'Indomitable', 'free', 'When you fail a saving throw: reroll it.', { res: 'indomitable' }));
        break;
      case 'monk':
        add(1, O('martial', 'Martial Arts strike', 'bonus', 'After you attack (or take the Attack action) with unarmed strikes or monk weapons: one unarmed strike.'));
        if (has('ki')) {
          add(2, O('flurry', 'Flurry of Blows', 'bonus', `After the Attack action: ${two && lvl >= 10 ? 'three' : 'two'} unarmed strikes.`, { res: 'ki' }));
          add(2, O('patient', 'Patient Defense', 'bonus', two ? 'Disengage (free), or spend 1 Focus Point to Disengage and Dodge.' : 'Spend 1 ki point to take the Dodge action.', { res: 'ki', does: 'dodge' }));
          add(2, O('stepwind', 'Step of the Wind', 'bonus', two ? 'Dash (free), or spend 1 Focus Point to Disengage and Dash (and jump twice as far).' : 'Spend 1 ki point to Disengage or Dash (and jump twice as far).', { res: 'ki', does: 'dash' }));
          add(5, O('stunning', 'Stunning Strike', 'free', two ? 'Once a turn, when you hit with a monk weapon or unarmed strike: 1 Focus Point, Constitution save or stunned.' : 'When you hit with a melee weapon attack: 1 ki point, Constitution save or stunned until the end of your next turn.', { res: 'ki' }));
        }
        add(3, O('deflect', two ? 'Deflect Attacks' : 'Deflect Missiles', 'reaction', two ? 'When an attack hits you: reduce the damage by 1d10 + Dex + level (and redirect it with 1 Focus Point).' : 'When a ranged weapon attack hits you: reduce the damage by 1d10 + Dex + level (catch and throw it back with 1 ki point).'));
        add(4, O('slowfall', 'Slow Fall', 'reaction', `When you fall: reduce the damage by ${5 * lvl}.`));
        break;
      case 'paladin':
        if (has('layonhands')) add(1, O('layonhands', 'Lay on Hands', two ? 'bonus' : 'action', 'Touch a creature: restore hit points from your pool (5 to cure a disease or poison).', { res: 'layonhands', n: 0 }));
        if (!two) add(1, O('divinesense', 'Divine Sense', 'action', 'Until the end of your next turn: you know where celestials, fiends and undead are within 60 ft.', { res: 'divinesense' }));
        if (!two) add(2, O('smite', 'Divine Smite', 'free', 'When you hit with a melee weapon attack: spend a spell slot for 2d8 radiant damage (+1d8 per slot level above 1st; +1d8 against undead and fiends).'));
        if (has('channel')) add(3, O('channel', 'Channel Divinity', two ? 'bonus' : 'action', two ? 'Divine Sense, or your oath’s option.' : 'Your oath’s option (Sacred Weapon, Turn the Unholy…).', { res: 'channel' }));
        break;
      case 'rogue':
        add(1, O('sneak', 'Sneak Attack', 'free', 'Once a turn: extra damage when you hit with a finesse or ranged weapon and have advantage (or an ally is next to the target).'));
        add(2, O('cunning-dash', 'Cunning Action: Dash', 'bonus', 'Dash as a bonus action.', { does: 'dash', from: 'Rogue 2 · Cunning Action' }));
        add(2, O('cunning-disengage', 'Cunning Action: Disengage', 'bonus', 'Disengage as a bonus action.', { does: 'disengage', from: 'Rogue 2 · Cunning Action' }));
        add(2, O('cunning-hide', 'Cunning Action: Hide', 'bonus', 'Hide as a bonus action.', { does: 'hide', from: 'Rogue 2 · Cunning Action' }));
        if (two) add(3, O('steadyaim', 'Steady Aim', 'bonus', 'If you haven’t moved this turn: advantage on your next attack, but your speed is 0 for the rest of the turn.'));
        add(5, O('uncanny', 'Uncanny Dodge', 'reaction', 'When an attacker you can see hits you: halve the damage.'));
        break;
      case 'sorcerer':
        if (has('sorcery')) {
          add(2, O('flexible', 'Font of Magic', two ? 'free' : 'bonus', 'Turn sorcery points into a spell slot (or a slot into points).', { res: 'sorcery', n: 0 }));
          add(two ? 2 : 3, O('quicken', 'Quickened Spell (if you know it)', 'free', 'Spend 2 sorcery points: a spell with a casting time of 1 action takes a bonus action instead.', { res: 'sorcery', n: 2 }));
        }
        break;
    }
  }
  return out;
}

/** The player's own counters that say what they cost. */
export function counterOptions(resources: Resource[], costs: Record<string, Cost | undefined>): TurnOption[] {
  return resources
    .filter((r) => r.custom && costs[r.key])
    .map((r) => O(`own-${r.key}`, r.name, costs[r.key]!, r.spell ? 'Your own counter: casts its spell.' : 'Your own counter.', { res: r.key, from: 'Your counter', ...(r.spell ? { does: 'cast' as const } : {}) }));
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

const SECTION: Record<string, Cost | 'legendary'> = { actions: 'action', 'bonus actions': 'bonus', reactions: 'reaction', 'legendary actions': 'legendary' };

/** A stat block's actions, bonus actions, reactions and legendary actions (Markdown "### Actions" + "***Name.*** text"). */
export function statBlockOptions(text: string | null | undefined): { options: TurnOption[]; legendary: TurnOption[] } {
  const options: TurnOption[] = [];
  const legendary: TurnOption[] = [];
  if (!text) return { options, legendary };
  let section: Cost | 'legendary' | 'traits' = 'traits';
  const lines = text.split('\n');
  for (const raw of lines) {
    const ln = raw.trim();
    const head = /^#{1,4}\s*(.+?)\s*$/.exec(ln) ?? /^\*\*([A-Za-z ]+)\*\*$/.exec(ln);
    if (head) {
      section = SECTION[head[1].toLowerCase()] ?? (head[1].toLowerCase().includes('action') ? 'action' : 'traits');
      continue;
    }
    const m = /^\*{2,3}([^*]+?)\.?\*{2,3}\s*(.*)$/.exec(ln);
    if (!m) continue;
    const full = m[1].replace(/\.$/, '').trim();
    const body = m[2].trim();
    const recharge = /\(Recharge ([^)]+)\)/i.exec(full)?.[1];
    const name = full.replace(/\s*\((Recharge[^)]*|\d+\/Day[^)]*)\)/i, '').trim();
    let cost: Cost | 'legendary' | null = section === 'traits' ? null : section;
    // Traits that work as a bonus action or a reaction (Nimble Escape, Parry…).
    if (!cost) cost = /\bas a bonus action\b/i.test(body) ? 'bonus' : /\buses? (?:its|their) reaction\b|\bas a reaction\b/i.test(body) ? 'reaction' : null;
    if (!cost) continue;
    const hit = /([+-]\d+) to hit|Attack Roll:\s*([+-]\d+)/i.exec(body);
    const dmg = [...body.matchAll(/\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s+([A-Za-z]+) damage/g)].map((x) => ({ f: x[1].replace(/\s+/g, ' '), ty: x[2].toLowerCase() }));
    const sentence = body.replace(/\s+/g, ' ');
    // "…can take the Disengage or Hide action as a bonus action" (Nimble Escape, Cunning Action…):
    // one line for each, doing what the action does.
    const asBonus = /take the ((?:Dash|Disengage|Dodge|Hide)(?:(?:,| or|, or) (?:Dash|Disengage|Dodge|Hide))*) actions? as a bonus action/i.exec(body);
    if (asBonus) {
      for (const a of asBonus[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map((x) => x.trim()).filter(Boolean)) {
        const act = a[0].toUpperCase() + a.slice(1).toLowerCase();
        options.push({ id: `sb-${options.length}-${act.toLowerCase()}`, name: `${name}: ${act}`, cost: 'bonus', text: sentence, does: act.toLowerCase() as Does });
      }
      continue;
    }
    const o: TurnOption = {
      id: `sb-${options.length + legendary.length}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      cost: cost === 'legendary' ? 'free' : cost,
      text: sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence,
      ...(hit ? { hit: Number(hit[1] ?? hit[2]) } : {}),
      ...(dmg.length ? { dmg } : {}),
      ...(recharge ? { recharge } : {}),
    };
    (cost === 'legendary' ? legendary : options).push(o);
  }
  return { options, legendary };
}

// ---------------------------------------------------------------------------
// What's left this turn
// ---------------------------------------------------------------------------

/** Conditions that stop actions and reactions (and those that stop movement). */
const NO_ACTIONS = ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'];
const NO_MOVE = ['grappled', 'restrained', 'paralyzed', 'petrified', 'stunned', 'unconscious'];
const has = (conditions: string[], list: string[]) => conditions.find((c) => list.includes(c.trim().toLowerCase())) ?? null;

export interface TurnState {
  /** Actions this turn (1, or 2 after Action Surge) and how many were taken. */
  actions: number;
  actionsTaken: number;
  bonusTaken: boolean;
  reactionTaken: boolean;
  /** Can't act at all (and why). */
  cantAct: string | null;
  /** Speed for this turn (null: unknown), after Dash and conditions; why it's 0, if it is. */
  speed: number | null;
  stuck: string | null;
  moved: number;
  /** Spell rules for the turn (2014: a bonus-action spell leaves only a cantrip for the action; 2024: one slot spell a turn). */
  spellNote: string | null;
}

export function turnState(live: PlayLive | null | undefined, opts: { speed: number | null; conditions: string[]; edition: Edition; spells?: SpellsPerTurn }): TurnState {
  const l = live ?? {};
  const stopped = has(opts.conditions, NO_ACTIONS);
  const stuck = has(opts.conditions, NO_MOVE);
  const base = opts.speed;
  const speed = base === null ? null : stuck ? 0 : base * (1 + (l.dx ?? 0));
  const spellNote = spellsNote(l.sp ?? 0, opts.edition, opts.spells);
  return {
    actions: 1 + (l.ax ?? 0),
    actionsTaken: l.ac ?? 0,
    bonusTaken: !!l.ba,
    reactionTaken: !!l.re,
    cantAct: stopped,
    speed,
    stuck,
    moved: l.mv ?? 0,
    spellNote,
  };
}

// ---------------------------------------------------------------------------
// One spell a turn (or so)
// ---------------------------------------------------------------------------

/** What `sp` records about the spells cast this turn. */
export const SPELL_SLOT = 1;
export const SPELL_BONUS = 2;
/** A spell that isn't a cantrip with a casting time of 1 action (a levelled spell, a bonus-action or reaction cantrip…). */
export const SPELL_OTHER = 4;
/** A levelled spell (not a cantrip), slot or no slot. */
export const SPELL_LEVELLED = 8;

/** Which spells-a-turn rule the table plays: the edition's, the "one levelled spell" house rule, or none. */
export type SpellsPerTurn = 'rules' | 'one-levelled' | 'off';

/** What a spell takes to cast: an action, a bonus action, a reaction, or longer (2014 "1 action", 2024 "Action"). */
export const castCost = (t: string): Cost | 'longer' => (/reaction/i.test(t) ? 'reaction' : /bonus/i.test(t) ? 'bonus' : /^(1 )?action/i.test(t) ? 'action' : 'longer');

/**
 * Why this spell can't be cast now, by the rules of the edition (null: it can):
 *  - 2014: a turn with a bonus-action spell in it can only have one other spell: a cantrip with a
 *    casting time of 1 action — in either order. So Fire Bolt + Healing Word is fine; Fireball +
 *    Healing Word isn't, nor Fireball + Shillelagh.
 *  - 2024: one spell slot a turn (Fireball + Shillelagh is fine; Fireball + Healing Word isn't).
 * Only for spells on your own turn; features that bend it (Quickened Spell…) are the DM's call, so
 * this warns rather than stops.
 */
export function spellRule(sp: { l: number; t: string }, bits: number, edition: Edition, mode: SpellsPerTurn = 'rules'): string | null {
  if (mode === 'off') return null;
  if (mode === 'one-levelled') return bits & SPELL_LEVELLED && sp.l > 0 ? 'You’ve cast a levelled spell this turn: only one a turn at this table (cantrips are free).' : null;
  const cost = castCost(sp.t);
  if (edition === '2024') return bits & SPELL_SLOT && sp.l > 0 ? 'You’ve used a spell slot this turn: only one a turn (a free use or a cantrip still works).' : null;
  if (bits & SPELL_BONUS && !(sp.l === 0 && cost === 'action')) return 'You cast a bonus-action spell this turn: the only other spell can be a cantrip that takes an action.';
  if (bits & SPELL_OTHER && cost === 'bonus') return 'You’ve cast a spell this turn that isn’t a cantrip taking an action: no bonus-action spell now.';
  return null;
}

/** The same rule as a line for the turn helper. */
export function spellsNote(bits: number, edition: Edition, mode: SpellsPerTurn = 'rules'): string | null {
  if (mode === 'off') return null;
  if (mode === 'one-levelled') return bits & SPELL_LEVELLED ? 'You’ve cast a levelled spell this turn: any other spell has to be a cantrip (this table’s rule).' : null;
  if (edition === '2024') return bits & SPELL_SLOT ? 'You’ve used a spell slot this turn: any other spell has to be a cantrip (or a free use).' : null;
  if (bits & SPELL_BONUS) return 'You cast a bonus-action spell: the only other spell this turn can be a cantrip with a casting time of 1 action.';
  if (bits & SPELL_OTHER) return 'You’ve cast a spell that isn’t an action cantrip: no bonus-action spell this turn (an action cantrip, like Fire Bolt, would have left it open).';
  return null;
}

/** The live fields a new turn clears (reaction included: it comes back at the start of your turn). */
export const TURN_RESET: Record<string, null> = { ac: null, ax: null, ba: null, re: null, mv: null, dx: null, sp: null };
export const turnFieldsUsed = (live: PlayLive | null | undefined) => !!live && Object.keys(TURN_RESET).some((k) => (live as Record<string, unknown>)[k]);

/** The first number of feet in a speed ("30 ft., fly 60 ft." → 30). */
export function walkSpeed(text: string | null | undefined): number | null {
  const m = /(\d+)\s*(?:ft|feet|')/i.exec(text ?? '');
  return m ? Number(m[1]) : null;
}

export const COST_LABEL: Record<Cost, string> = { action: 'Action', bonus: 'Bonus action', reaction: 'Reaction', free: 'Free' };
