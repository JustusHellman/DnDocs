/**
 * A character's attacks (weapons, unarmed strikes, anything that rolls to hit): set up once on the
 * character, worked out from the current stats (so they grow with the character), and rolled from
 * the turn helper, the spellbook panel, the character page or `/attack` in the chat.
 */
import { parseFormula, rollFormula } from '../dice';
import { tableChat } from '../chat/bus';
import { toChatRoll } from '../chat/rolls';
import type { Ability, Derived, PlayLive } from './model';
import { tableLive, patchPlay } from './live';
import { combatContext, isTurnOf } from './turnStore';
import { attacksPerAction } from './turn';
import { critRule, CRIT_LABEL } from './rules';

export interface Attack {
  id: string;
  name: string;
  /** The ability it uses ('spell': the spellcasting ability; 'finesse': the better of STR and DEX). */
  ab: Ability | 'spell' | 'finesse' | 'none';
  /** Proficient (adds the proficiency bonus to hit). Default yes. */
  prof?: boolean;
  /** A magic weapon's +1 (to hit and damage), or any other flat bonus. */
  plus?: number;
  /** Damage dice ("1d8"). */
  dice: string;
  /** Damage type ("slashing"). */
  ty?: string;
  /** Add the ability modifier to damage. Default yes (an off-hand attack usually doesn't). */
  addMod?: boolean;
  /** What it takes: an attack within the Attack action (default) or a bonus action (off-hand…). */
  cost?: 'action' | 'bonus';
  /** Reach or range, a note ("80/320 ft", "light, thrown"). */
  note?: string;
}

const MOD_NAMES: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

/** The numbers right now: to-hit bonus, damage formula ("1d8 + 3"), and what they're made of. */
export function attackNumbers(a: Attack, d: Pick<Derived, 'mods' | 'pb' | 'ability'>): { hit: number; dmg: string; mod: number; from: string } {
  const ab = a.ab === 'spell' ? d.ability : a.ab === 'finesse' ? (d.mods.dex >= d.mods.str ? 'dex' : 'str') : a.ab === 'none' ? null : a.ab;
  const mod = ab ? d.mods[ab] : 0;
  const plus = a.plus ?? 0;
  const hit = mod + (a.prof === false ? 0 : d.pb) + plus;
  const flat = (a.addMod === false ? 0 : mod) + plus;
  const dice = (a.dice || '1').trim();
  const dmg = flat ? `${dice} ${flat > 0 ? '+' : '−'} ${Math.abs(flat)}` : dice;
  return { hit, dmg, mod, from: ab ? MOD_NAMES[ab] : '' };
}

/** A few to start from, so a fighter isn't facing an empty form. */
export const ATTACK_PRESETS: Omit<Attack, 'id'>[] = [
  { name: 'Longsword', ab: 'str', dice: '1d8', ty: 'slashing', note: 'versatile 1d10' },
  { name: 'Greatsword', ab: 'str', dice: '2d6', ty: 'slashing' },
  { name: 'Greataxe', ab: 'str', dice: '1d12', ty: 'slashing' },
  { name: 'Warhammer', ab: 'str', dice: '1d8', ty: 'bludgeoning', note: 'versatile 1d10' },
  { name: 'Rapier', ab: 'finesse', dice: '1d8', ty: 'piercing' },
  { name: 'Shortsword', ab: 'finesse', dice: '1d6', ty: 'piercing' },
  { name: 'Dagger', ab: 'finesse', dice: '1d4', ty: 'piercing', note: 'thrown 20/60 ft' },
  { name: 'Handaxe', ab: 'str', dice: '1d6', ty: 'slashing', note: 'thrown 20/60 ft' },
  { name: 'Quarterstaff', ab: 'str', dice: '1d6', ty: 'bludgeoning', note: 'versatile 1d8' },
  { name: 'Mace', ab: 'str', dice: '1d6', ty: 'bludgeoning' },
  { name: 'Spear', ab: 'str', dice: '1d6', ty: 'piercing', note: 'thrown 20/60, versatile 1d8' },
  { name: 'Shortbow', ab: 'dex', dice: '1d6', ty: 'piercing', note: '80/320 ft' },
  { name: 'Longbow', ab: 'dex', dice: '1d8', ty: 'piercing', note: '150/600 ft' },
  { name: 'Light crossbow', ab: 'dex', dice: '1d8', ty: 'piercing', note: '80/320 ft' },
  { name: 'Hand crossbow', ab: 'dex', dice: '1d6', ty: 'piercing', note: '30/120 ft' },
  { name: 'Unarmed strike', ab: 'str', dice: '1', ty: 'bludgeoning' },
];

/** Who an attack is aimed at: its AC only when the person rolling may know it (else null). */
export interface AttackTarget {
  name: string;
  ac: number | null;
}

/** The roll's label: "Longsword to hit", or against a target "Longsword vs Goblin: hits (AC 15)". */
export function toHitLabel(name: string, total: number, natural: number | undefined, vs?: AttackTarget | null): string {
  if (!vs) return `${name} to hit`;
  if (vs.ac === null) return `${name} to hit (vs ${vs.name})`;
  const verdict = natural === 20 ? 'critical hit!' : natural === 1 ? 'misses' : total >= vs.ac ? 'hits' : 'misses';
  return `${name} vs ${vs.name}: ${verdict} (AC ${vs.ac})`;
}

/**
 * Roll an attack in the chat: to hit, then damage (the dice doubled on a natural 20). Returns the
 * to-hit total and whether it was a critical hit.
 */
export function rollAttack(a: Attack, d: Pick<Derived, 'mods' | 'pb' | 'ability'>, opts: { adv?: boolean; dis?: boolean; vs?: AttackTarget | null } = {}): { total: number; crit: boolean; natural?: number; damage: number | null } | null {
  const n = attackNumbers(a, d);
  const toHit = parseFormula(`1d20${n.hit >= 0 ? '+' : ''}${n.hit}`);
  const dmg = parseFormula(n.dmg.replace('−', '-'));
  if (!toHit) return null;
  const r = rollFormula(toHit, { advantage: opts.adv, disadvantage: opts.dis });
  tableChat.roll(toChatRoll(r, toHitLabel(a.name, r.total, r.natural, opts.vs)));
  const crit = r.natural === 20;
  const rule = critRule();
  const dmgRoll = dmg ? rollFormula(dmg, crit ? { crit: rule } : {}) : null;
  if (dmgRoll) tableChat.roll(toChatRoll(dmgRoll, `${a.name}${a.ty ? ` ${a.ty}` : ''}${crit ? ` (${CRIT_LABEL[rule]})` : ''}`));
  return { total: r.total, crit, natural: r.natural, damage: dmgRoll?.total ?? null };
}

/**
 * Making an attack in a fight: the first one on your turn takes the Attack action, the next ones are
 * part of it (Extra Attack) until they run out; an off-hand attack takes the bonus action; off your
 * turn it's an opportunity attack (the reaction). Rolls either way. Returns a warning to show, if any.
 */
export async function makeAttack(p: { key: string; d: Derived; live: PlayLive; entity: { id: string; name: string }; owner: string }, a: Attack, opts: { adv?: boolean; dis?: boolean; vs?: AttackTarget | null } = {}): Promise<{ warn: string | null; roll: ReturnType<typeof rollAttack> }> {
  const c = combatContext();
  let warn: string | null = null;
  if (c && c.tokens.some((t) => t.key === p.key)) {
    const live = tableLive().play[p.key] ?? p.live;
    const mine = isTurnOf(p.key);
    const per = attacksPerAction(p.d);
    const patch: Record<string, unknown> = {};
    if (!mine) {
      if (live.re) warn = 'Your reaction is already used.';
      else patch.re = 1;
    } else if (a.cost === 'bonus') {
      if (live.ba) warn = 'Your bonus action is already used.';
      else patch.ba = 1;
    } else {
      const made = live.aa ?? 0;
      const actions = 1 + (live.ax ?? 0);
      // Attacks still left in an Attack action already taken (Extra Attack)?
      const leftInAction = made > 0 && made < per * (live.ac ?? 0);
      if (!leftInAction) {
        // A new Attack action.
        if ((live.ac ?? 0) >= actions) warn = made >= per * (live.ac ?? 0) && made > 0 ? `That's all ${per * (live.ac ?? 1)} of your attacks this turn.` : 'Your action is already used.';
        else patch.ac = (live.ac ?? 0) + 1;
      }
      if (!warn) patch.aa = made + 1;
    }
    if (Object.keys(patch).length) await patchPlay(c.cid, p.key, live.uid ?? p.owner, live.name ?? p.entity.name, patch).catch(() => undefined);
  }
  const roll = rollAttack(a, p.d, opts);
  return { warn, roll };
}

/** "Attack 2 of 3" while an Attack action is going, for the turn helper. */
export function attacksLeft(live: PlayLive, d: Pick<Derived, 'classes'>): { made: number; of: number } | null {
  const made = live.aa ?? 0;
  if (!made) return null;
  const per = attacksPerAction(d);
  return { made: ((made - 1) % per) + 1, of: per };
}

/** Whether a fresh Attack action is still possible, or one going has attacks left. */
export function canAttack(live: PlayLive, d: Pick<Derived, 'classes'>): boolean {
  const per = attacksPerAction(d);
  const made = live.aa ?? 0;
  if (made > 0 && made < per * (live.ac ?? 0)) return true;
  return (live.ac ?? 0) < 1 + (live.ax ?? 0);
}

/**
 * The open battle map's way of making a character's attack (aimed at the picked target, with the
 * reach check and the damage offered after): set by the map while it's open.
 */
type MapAttack = (p: Parameters<typeof makeAttack>[0], a: Attack, opts: { adv?: boolean; dis?: boolean; from: 'turn' | 'elsewhere' }) => Promise<{ warn: string | null } | null>;
let mapAttack: MapAttack | null = null;
export const setMapAttack = (f: MapAttack | null) => {
  mapAttack = f;
};

/**
 * One way to attack, from anywhere (the turn helper, the character page, the spellbook panel,
 * `/attack` in the chat): through the battle map when it's open and the character is on it (its
 * target, the reach check, "Apply damage…" after), otherwise just the rolls. Returns a warning to
 * show, if any. `false`: called off (out of reach and not confirmed).
 */
export async function attack(p: Parameters<typeof makeAttack>[0], a: Attack, opts: { adv?: boolean; dis?: boolean; from?: 'turn' | 'elsewhere' } = {}): Promise<string | null> {
  const viaMap = mapAttack ? await mapAttack(p, a, { ...opts, from: opts.from ?? 'elsewhere' }) : null;
  if (viaMap) return viaMap.warn;
  return (await makeAttack(p, a, opts)).warn;
}

