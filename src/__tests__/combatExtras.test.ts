import { describe, expect, it } from 'vitest';
import { derive, type PlayLive } from '../lib/play/model';
import { attackNumbers, attacksLeft, canAttack, toHitLabel, type Attack } from '../lib/play/attacks';
import { averageHp, bumpClassText, whatChanges } from '../lib/play/levelUp';
import { legendaryCost, rechargeMin, rollRecharges, statBlockOptions } from '../lib/play/turn';
import { tokensInArea } from '../lib/battle/templates';
import { saveBonus } from '../lib/battle/applyDamage';
import { conditionRule } from '../lib/battle/conditions';
import { parseCommand } from '../lib/chat/commands';
import type { Entity } from '../types';

const stats = (o: Record<string, unknown> = {}) => ({ armorClass: '15', hitPoints: '40', speed: '30 ft', str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8, ...o }) as never;
const fighter5 = derive({ classLevel: 'Fighter 5', stats: stats() });

describe('attacks', () => {
  const sword: Attack = { id: 'a', name: 'Longsword', ab: 'str', dice: '1d8', ty: 'slashing' };
  it('works out to-hit and damage from the stats', () => {
    expect(attackNumbers(sword, fighter5)).toMatchObject({ hit: 6, dmg: '1d8 + 3', from: 'STR' });
    expect(attackNumbers({ ...sword, plus: 1 }, fighter5)).toMatchObject({ hit: 7, dmg: '1d8 + 4' });
    expect(attackNumbers({ ...sword, prof: false }, fighter5).hit).toBe(3);
    // Off-hand: no modifier to damage.
    expect(attackNumbers({ ...sword, addMod: false }, fighter5).dmg).toBe('1d8');
  });
  it('uses the better of STR and DEX for finesse', () => {
    const rogue = derive({ classLevel: 'Rogue 3', stats: stats({ str: 8, dex: 18 }) });
    expect(attackNumbers({ ...sword, ab: 'finesse' }, rogue)).toMatchObject({ hit: 6, dmg: '1d8 + 4', from: 'DEX' });
  });
  it('shows a negative modifier', () => {
    const weak = derive({ classLevel: 'Wizard 1', stats: stats({ str: 6 }) });
    expect(attackNumbers(sword, weak).dmg).toBe('1d8 − 2');
  });
  it('counts attacks within the Attack action', () => {
    const live = (o: Partial<PlayLive>) => o as PlayLive;
    expect(attacksLeft(live({}), fighter5)).toBeNull();
    expect(attacksLeft(live({ aa: 1, ac: 1 }), fighter5)).toEqual({ made: 1, of: 2 });
    expect(canAttack(live({ aa: 1, ac: 1 }), fighter5)).toBe(true);
    expect(canAttack(live({ aa: 2, ac: 1 }), fighter5)).toBe(false);
    // Action Surge: a second action, so a second round of attacks.
    expect(canAttack(live({ aa: 2, ac: 1, ax: 1 }), fighter5)).toBe(true);
  });
  it('says whether it hits a target', () => {
    expect(toHitLabel('Longsword', 17, 11, null)).toBe('Longsword to hit');
    expect(toHitLabel('Longsword', 17, 11, { name: 'Goblin', ac: null })).toBe('Longsword to hit (vs Goblin)');
    expect(toHitLabel('Longsword', 17, 11, { name: 'Goblin', ac: 15 })).toBe('Longsword vs Goblin: hits (AC 15)');
    expect(toHitLabel('Longsword', 14, 8, { name: 'Goblin', ac: 15 })).toBe('Longsword vs Goblin: misses (AC 15)');
    expect(toHitLabel('Longsword', 26, 20, { name: 'Goblin', ac: 30 })).toMatch(/critical hit/);
    expect(toHitLabel('Longsword', 16, 1, { name: 'Goblin', ac: 10 })).toMatch(/misses/);
  });
  it('reads /attack', () => {
    expect(parseCommand('/attack longsword')).toEqual({ c: 'attack', what: 'longsword' });
    expect(parseCommand('/a dagger adv')).toEqual({ c: 'attack', what: 'dagger', adv: true });
  });
});

describe('level up', () => {
  it('bumps the right class in the text', () => {
    expect(bumpClassText('Druid 5 (Circle of Stars)', 'druid')).toBe('Druid 6 (Circle of Stars)');
    expect(bumpClassText('Fighter 3 / Wizard 2', 'wizard')).toBe('Fighter 3 / Wizard 3');
    expect(bumpClassText('Fighter 3', 'rogue')).toBe('Fighter 3 / Rogue 1');
    expect(bumpClassText('', 'cleric')).toBe('Cleric 1');
    expect(bumpClassText('Fighter 20', 'fighter')).toBe('Fighter 20');
  });
  it('rounds the average hit die up', () => {
    expect(averageHp(8)).toBe(5);
    expect(averageHp(10)).toBe(6);
    expect(averageHp(12)).toBe(7);
  });
  it('lists what changes', () => {
    const w = whatChanges({ classLevel: 'Fighter 4', stats: stats() }, 'fighter', '2014');
    expect(w.after.level).toBe(5);
    expect(w.change.lines.join('\n')).toMatch(/Proficiency bonus \+3/);
    expect(w.change.lines.join('\n')).toMatch(/Extra Attack: 2/);
    const asi = whatChanges({ classLevel: 'Fighter 5', stats: stats() }, 'fighter', '2014');
    expect(asi.change.lines.join('\n')).toMatch(/Fighter 6: an Ability Score Improvement/);
    const wiz = whatChanges({ classLevel: 'Wizard 2', stats: stats() }, 'wizard', '2014');
    expect(wiz.change.lines.join('\n')).toMatch(/2nd-level spell slot.*new spell level/);
  });
});

describe('monster extras', () => {
  const block = `### Actions

***Fire Breath (Recharge 5–6).*** The dragon exhales fire.

### Legendary Actions

The dragon can take 3 legendary actions, choosing from the options below.

**Detect.** The dragon makes a Wisdom (Perception) check.

**Wing Attack (Costs 2 Actions).** The dragon beats its wings.`;
  it('reads recharge and legendary actions', () => {
    const o = statBlockOptions(block);
    expect(o.legendaryPer).toBe(3);
    expect(o.legendary.map((x) => x.name)).toEqual(['Detect', 'Wing Attack (Costs 2 Actions)']);
    expect(legendaryCost('Wing Attack (Costs 2 Actions)')).toBe(2);
    expect(legendaryCost('Detect')).toBe(1);
    const breath = o.options.find((x) => x.name.startsWith('Fire Breath'))!;
    expect(rechargeMin(breath.recharge!)).toBe(5);
  });
  it('rolls recharges', () => {
    expect(rollRecharges({ breath: 5 }, () => 6)).toMatchObject({ rc: null });
    expect(rollRecharges({ breath: 5 }, () => 2)).toMatchObject({ rc: { breath: 5 } });
    expect(rollRecharges({ 'sb-2-fire-breath': 5 }, () => 5).lines[0]).toMatch(/^Fire breath recharged/);
  });
});

describe('area damage', () => {
  const tok = (id: string, x: number, y: number, size = 1) => ({ id, x, y, size });
  it('finds the tokens inside a template', () => {
    const toks = [tok('in', 5, 5), tok('edge', 7, 5), tok('out', 12, 12), tok('big', 8, 3, 2)];
    // A 10-ft-radius circle (2 squares) around the corner (6,6).
    const caught = tokensInArea('circle', { x: 6, y: 6 }, { x: 8, y: 6 }, undefined, toks).map((t) => t.id);
    expect(caught).toContain('in');
    expect(caught).toContain('edge');
    expect(caught).not.toContain('out');
    // A 15-ft cube.
    expect(tokensInArea('cube', { x: 0, y: 0 }, { x: 3, y: 3 }, undefined, [tok('a', 2, 2), tok('b', 3, 3)]).map((t) => t.id)).toEqual(['a']);
  });
  it('finds a creature’s save bonus', () => {
    expect(saveBonus('dex', undefined, '**Saving Throws** Dex +5, Wis +2')).toBe(5);
    expect(saveBonus('wis', undefined, 'Saving Throws Dex +5, Wis +2')).toBe(2);
    expect(saveBonus('con', { dndStats: { con: 16 } } as unknown as Entity, 'Saving Throws Dex +5')).toBe(3);
    expect(saveBonus('str', undefined, null)).toBe(0);
  });
});

describe('conditions', () => {
  it('explains the standard ones', () => {
    expect(conditionRule('Poisoned')).toMatch(/Disadvantage on attack rolls/);
    expect(conditionRule('prone')).toBeTruthy();
    expect(conditionRule('Blessed by the moon')).toBeNull();
  });
});

describe('aiming', () => {
  it('measures between tokens edge to edge', async () => {
    const { tokenGapFeet } = await import('../lib/battle/targeting');
    const grid = { feet: 5, diagonal: '5e' as const };
    expect(tokenGapFeet({ x: 2, y: 2, size: 1 }, { x: 3, y: 2, size: 1 }, grid)).toBe(5);
    expect(tokenGapFeet({ x: 2, y: 2, size: 1 }, { x: 3, y: 3, size: 1 }, grid)).toBe(5);
    expect(tokenGapFeet({ x: 2, y: 2, size: 1 }, { x: 7, y: 2, size: 1 }, grid)).toBe(25);
    // A large creature (2×2) next to a medium one.
    expect(tokenGapFeet({ x: 2, y: 2, size: 2 }, { x: 4, y: 3, size: 1 }, grid)).toBe(5);
  });
  it('reads reach and range', async () => {
    const { checkRange, rangeIn, weaponRange } = await import('../lib/battle/targeting');
    expect(rangeIn('Melee Weapon Attack: +4 to hit, reach 5 ft., one target.')).toEqual({ reach: 5 });
    expect(rangeIn('Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target.')).toEqual({ normal: 80, long: 320 });
    expect(rangeIn('Melee or Ranged Weapon Attack: +4 to hit, reach 5 ft. or range 20/60 ft.')).toEqual({ reach: 5, normal: 20, long: 60 });
    expect(weaponRange({ ab: 'str' })).toEqual({ reach: 5 });
    expect(weaponRange({ ab: 'dex', note: '80/320 ft' })).toEqual({ normal: 80, long: 320 });
    expect(weaponRange({ ab: 'finesse', note: 'thrown 20/60 ft' })).toEqual({ normal: 20, long: 60, reach: 5 });
    expect(weaponRange({ ab: 'str', note: 'thrown 20/60, versatile 1d8' })).toEqual({ normal: 20, long: 60, reach: 5 });
    expect(checkRange(5, { reach: 5 })).toEqual({ ok: true });
    expect(checkRange(25, { reach: 5 })).toEqual({ ok: false, max: 5 });
    expect(checkRange(100, { normal: 80, long: 320 })).toEqual({ ok: true, long: true });
    expect(checkRange(400, { normal: 80, long: 320 })).toEqual({ ok: false, max: 320 });
    expect(checkRange(400, {})).toEqual({ ok: true });
  });
});

describe('critical hit rules', () => {
  it('rolls the damage by the table’s rule', async () => {
    const { parseFormula, rollFormula } = await import('../lib/dice');
    const f = parseFormula('2d6+3')!;
    const threes = () => 0.4; // every die shows 3
    expect(rollFormula(f, { crit: true }, threes).total).toBe(4 * 3 + 3);
    expect(rollFormula(f, { crit: 'double-dice' }, threes).total).toBe(15);
    expect(rollFormula(f, { crit: 'max-plus-roll' }, threes).total).toBe(12 + 6 + 3);
    expect(rollFormula(f, { crit: 'double-total' }, threes).total).toBe(12 + 3);
    expect(rollFormula(f, {}, threes).total).toBe(9);
  });
});
