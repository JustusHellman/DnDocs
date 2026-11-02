import { describe, expect, it } from 'vitest';
import { derive } from '../lib/play/model';
import { attacksPerAction, basicOptions, castCost, classOptions, counterOptions, spellRule, statBlockOptions, turnState, walkSpeed } from '../lib/play/turn';
import { costPatch } from '../lib/play/turnStore';

const char = (classLevel: string, edition: '2014' | '2024' = '2014') => derive({ classLevel, stats: { str: 14, dex: 16, con: 14, int: 10, wis: 14, cha: 12 }, edition });
const ids = (o: { id: string }[]) => o.map((x) => x.id);

describe('turn options', () => {
  it('has the basic actions of each edition', () => {
    expect(ids(basicOptions('2014'))).toEqual(expect.arrayContaining(['attack', 'cast', 'dash', 'disengage', 'dodge', 'help', 'hide', 'ready', 'search', 'object', 'oa']));
    expect(ids(basicOptions('2014'))).not.toContain('influence');
    expect(ids(basicOptions('2024'))).toEqual(expect.arrayContaining(['influence', 'study', 'potion']));
    expect(basicOptions('2024').find((o) => o.id === 'cast')!.name).toBe('Magic');
  });

  it('counts Extra Attack', () => {
    expect(attacksPerAction(char('Fighter 4'))).toBe(1);
    expect(attacksPerAction(char('Fighter 5'))).toBe(2);
    expect(attacksPerAction(char('Fighter 11'))).toBe(3);
    expect(attacksPerAction(char('Paladin 6'))).toBe(2);
    expect(attacksPerAction(char('Wizard 9'))).toBe(1);
    expect(basicOptions('2014', 2)[0].name).toBe('Attack ×2');
  });

  it('gives a rogue Cunning Action from level 2 and Uncanny Dodge from 5', () => {
    expect(ids(classOptions('2014', char('Rogue 1')))).toEqual(['sneak']);
    const r5 = classOptions('2014', char('Rogue 5'));
    expect(r5.filter((o) => o.cost === 'bonus').map((o) => o.does)).toEqual(['dash', 'disengage', 'hide']);
    expect(r5.find((o) => o.id === 'uncanny')!.cost).toBe('reaction');
    expect(ids(classOptions('2024', char('Rogue 3', '2024')))).toContain('steadyaim');
    expect(ids(classOptions('2014', char('Rogue 3')))).not.toContain('steadyaim');
  });

  it('knows what changed between the editions', () => {
    expect(classOptions('2014', char('Druid 2')).find((o) => o.id === 'wildshape')!.cost).toBe('action');
    expect(classOptions('2024', char('Druid 2', '2024')).find((o) => o.id === 'wildshape')!.cost).toBe('bonus');
    expect(classOptions('2014', char('Paladin 2')).some((o) => o.id === 'smite')).toBe(true);
    expect(classOptions('2024', char('Paladin 2', '2024')).some((o) => o.id === 'smite')).toBe(false);
    expect(classOptions('2014', char('Bard 6')).find((o) => o.id === 'countercharm')!.cost).toBe('action');
    expect(classOptions('2024', char('Bard 7', '2024')).find((o) => o.id === 'countercharm')!.cost).toBe('reaction');
  });

  it('ties features to their resources, and multiclasses add up', () => {
    const fr = classOptions('2014', char('Fighter 2 / Rogue 2'));
    expect(fr.find((o) => o.id === 'secondwind')).toMatchObject({ cost: 'bonus', res: 'secondwind', from: 'Fighter 1' });
    expect(fr.find((o) => o.id === 'surge')).toMatchObject({ does: 'surge', res: 'surge' });
    expect(fr.some((o) => o.id === 'cunning-hide')).toBe(true);
    expect(classOptions('2014', char('Monk 1')).some((o) => o.id === 'flurry')).toBe(false);
    expect(classOptions('2014', char('Monk 2')).some((o) => o.id === 'flurry')).toBe(true);
  });

  it('shows the player’s own counters that say what they cost', () => {
    const d = derive({ classLevel: 'Wizard 3', def: { counters: [{ id: 'a', name: 'Fey Step', max: 1, rest: 'long' }, { id: 'b', name: 'Lucky', max: 3, rest: 'long' }] } });
    const o = counterOptions(d.resources, { x_a: 'bonus' });
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ name: 'Fey Step', cost: 'bonus', res: 'x_a' });
  });
});

const GOBLIN = `***Nimble Escape.*** The goblin can take the Disengage or Hide action as a bonus action on each of its turns.

### Actions

***Scimitar.*** Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.

***Shortbow.*** Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.

### Reactions

***Parry.*** The goblin adds 2 to its AC against one melee attack that would hit it.

### Legendary Actions

***Detect.*** The creature makes a Wisdom (Perception) check.`;

describe('stat blocks', () => {
  it('reads actions, bonus actions, reactions and legendary actions', () => {
    const { options, legendary } = statBlockOptions(GOBLIN);
    expect(options.map((o) => [o.name, o.cost])).toEqual([
      ['Nimble Escape: Disengage', 'bonus'],
      ['Nimble Escape: Hide', 'bonus'],
      ['Scimitar', 'action'],
      ['Shortbow', 'action'],
      ['Parry', 'reaction'],
    ]);
    expect(options[0].does).toBe('disengage');
    expect(options[2]).toMatchObject({ hit: 4, dmg: [{ f: '1d6 + 2', ty: 'slashing' }] });
    expect(legendary.map((o) => o.name)).toEqual(['Detect']);
  });
  it('reads 2024 attacks and recharges', () => {
    const { options } = statBlockOptions('### Actions\n\n***Fire Breath (Recharge 5–6).*** Dexterity Saving Throw: DC 13. Failure: 24 (7d6) Fire damage.\n\n***Bite.*** Melee Attack Roll: +6, reach 5 ft. Hit: 9 (1d10 + 4) Piercing damage plus 3 (1d6) Fire damage.');
    expect(options[0]).toMatchObject({ name: 'Fire Breath', recharge: '5–6', dmg: [{ f: '7d6', ty: 'fire' }] });
    expect(options[1]).toMatchObject({ name: 'Bite', hit: 6, dmg: [{ f: '1d10 + 4', ty: 'piercing' }, { f: '1d6', ty: 'fire' }] });
  });
  it('is empty without a stat block', () => {
    expect(statBlockOptions(null)).toEqual({ options: [], legendary: [] });
  });
});

describe('the turn', () => {
  it('counts actions, Action Surge, Dash and conditions', () => {
    const s = turnState({ ac: 1, ax: 1, ba: 1, mv: 20, dx: 1 }, { speed: 30, conditions: [], edition: '2014' });
    expect(s).toMatchObject({ actions: 2, actionsTaken: 1, bonusTaken: true, reactionTaken: false, speed: 60, moved: 20, cantAct: null });
    expect(turnState({}, { speed: 30, conditions: ['Grappled'], edition: '2014' })).toMatchObject({ speed: 0, stuck: 'Grappled', cantAct: null });
    expect(turnState({}, { speed: 30, conditions: ['Stunned'], edition: '2014' }).cantAct).toBe('Stunned');
    expect(turnState({}, { speed: null, conditions: [], edition: '2014' }).speed).toBeNull();
  });
  it('knows the spell-per-turn rules', () => {
    expect(turnState({ sp: 2 }, { speed: 30, conditions: [], edition: '2014' }).spellNote).toMatch(/cantrip/);
    expect(turnState({ sp: 1 }, { speed: 30, conditions: [], edition: '2014' }).spellNote).toBeNull();
    expect(turnState({ sp: 1 }, { speed: 30, conditions: [], edition: '2024' }).spellNote).toMatch(/cantrip/);
  });
  it('marks what something cost; off your turn an action is a readied one (the reaction)', () => {
    expect(costPatch({ ac: 1 }, 'action', true)).toEqual({ ac: 2 });
    expect(costPatch({}, 'bonus', true)).toEqual({ ba: 1 });
    expect(costPatch({}, 'action', false)).toEqual({ re: 1 });
    expect(costPatch({}, 'free', true)).toBeNull();
  });
  it('reads a walking speed', () => {
    expect(walkSpeed('30 ft., fly 60 ft.')).toBe(30);
    expect(walkSpeed('25 feet')).toBe(25);
    expect(walkSpeed('')).toBeNull();
  });
  it('reads casting times of both editions', () => {
    expect(castCost('1 action')).toBe('action');
    expect(castCost('Action')).toBe('action');
    expect(castCost('Bonus Action')).toBe('bonus');
    expect(castCost('1 reaction, which you take when…')).toBe('reaction');
    expect(castCost('1 minute')).toBe('longer');
  });
});

describe('spells per turn', () => {
  const fireball = { l: 3, t: '1 action' };
  const firebolt = { l: 0, t: '1 action' };
  const healingWord = { l: 1, t: '1 bonus action' };
  const shillelagh = { l: 0, t: '1 bonus action' };
  it('2014: after a bonus-action spell, only an action cantrip', () => {
    expect(spellRule(fireball, 2, '2014')).toMatch(/cantrip/);
    expect(spellRule(firebolt, 2, '2014')).toBeNull();
    expect(spellRule(shillelagh, 2, '2014')).not.toBeNull();
  });
  it('2014: after a spell that isn’t an action cantrip, no bonus-action spell; after an action cantrip, fine', () => {
    // Fireball (4) then Healing Word or Shillelagh: no.
    expect(spellRule(healingWord, 4, '2014')).toMatch(/bonus-action/);
    expect(spellRule(shillelagh, 4, '2014')).not.toBeNull();
    // Fire Bolt (an action cantrip leaves no mark) then Healing Word: fine.
    expect(spellRule(healingWord, 0, '2014')).toBeNull();
    expect(spellRule(fireball, 4, '2014')).toBeNull();
  });
  it('2024: a levelled action spell and a bonus-action cantrip are fine together', () => {
    expect(spellRule(shillelagh, 1 | 4, '2024')).toBeNull();
    expect(spellRule(firebolt, 1 | 2 | 4, '2024')).toBeNull();
  });
  it('2024: one spell slot a turn', () => {
    expect(spellRule(healingWord, 1, '2024')).toMatch(/slot/);
    expect(spellRule(firebolt, 1, '2024')).toBeNull();
    expect(spellRule(healingWord, 2 | 4, '2024')).toBeNull();
  });
  it('the table’s own rule: one levelled spell a turn, or no warnings', () => {
    expect(spellRule(shillelagh, 4 | 8, '2014', 'one-levelled')).toBeNull();
    expect(spellRule(healingWord, 4 | 8, '2014', 'one-levelled')).toMatch(/levelled/);
    expect(spellRule(healingWord, 2 | 4 | 8, '2014', 'off')).toBeNull();
  });
  it('nothing cast yet: anything goes', () => {
    expect(spellRule(fireball, 0, '2014')).toBeNull();
    expect(spellRule(healingWord, 0, '2024')).toBeNull();
  });
});
