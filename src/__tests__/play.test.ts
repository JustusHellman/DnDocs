import { describe, expect, it } from 'vitest';
import { concentrationDC, derive, longRest, parseClasses, shortRest, slotsLeft } from '../lib/play/model';

const mira = { str: 10, dex: 14, con: 14, int: 10, wis: 18, cha: 10 };

describe('classes', () => {
  it('reads class and level text', () => {
    expect(parseClasses('Druid 5 (Circle of Stars)')).toEqual([{ cls: 'druid', lvl: 5 }]);
    expect(parseClasses('Fighter 2 / Wizard 1')).toEqual(expect.arrayContaining([{ cls: 'fighter', lvl: 2 }, { cls: 'wizard', lvl: 1 }]));
    expect(parseClasses('Rogue (Thief) 3')).toEqual([{ cls: 'rogue', lvl: 3 }]);
  });
});

describe('derive', () => {
  it('a druid 5: slots, wild shape, hit dice, prepared spells, DC', () => {
    const d = derive({ classLevel: 'Druid 5', stats: mira });
    expect(d.slots).toEqual([4, 3, 2]);
    expect(d.resources.map((r) => [r.name, r.max, r.rest])).toEqual([['Wild Shape', 2, 'short']]);
    expect(d.hitDice).toEqual([{ die: 8, max: 5 }]);
    expect(d.preparedMax).toBe(9);
    expect(d.saveDC).toBe(15);
    expect(d.attack).toBe(7);
  });
  it('multiclass slots use the caster level; warlock pact slots stay apart', () => {
    const d = derive({ classLevel: 'Paladin 4 / Sorcerer 3', stats: mira });
    expect(d.slots).toEqual([4, 3, 2]); // caster level 2 + 3 = 5
    const w = derive({ classLevel: 'Warlock 5', stats: mira });
    expect(w.pact).toEqual({ n: 2, l: 3 });
    expect(w.slots).toEqual([]);
  });
  it('overrides and the player’s own counters', () => {
    const d = derive({ classLevel: 'Druid 5', stats: mira, def: { slots: { '1': 5 }, res: { wildshape: { max: 3 } }, counters: [{ id: 'sm', name: 'Star Map: Guiding Bolt', max: 3, rest: 'long', spell: 'guiding-bolt' }] } });
    expect(d.slots[0]).toBe(5);
    expect(d.resources.find((r) => r.key === 'wildshape')?.max).toBe(3);
    expect(d.resources.find((r) => r.custom)?.spell).toBe('guiding-bolt');
  });
});

describe('rests', () => {
  const d = derive({ classLevel: 'Druid 5', stats: mira, def: { counters: [{ id: 'sm', name: 'Star Map', max: 3, rest: 'long' }] } });
  const used = { s: { '1': 2, '2': 1 }, r: { wildshape: 2, x_sm: 1 }, h: { '8': 4 }, conc: 1 as const };
  it('short rest: short-rest things come back, slots don’t', () => {
    const s = shortRest(d, used);
    expect(s.r).toEqual({ x_sm: 1 });
    expect(slotsLeft(d, s, 1)).toBe(2);
  });
  it('long rest (2014): everything, and half the hit dice (at least one)', () => {
    const l = longRest(d, used, '2014');
    expect(l.s).toBeUndefined();
    expect(l.r).toEqual({});
    expect(l.h).toEqual({ '8': 2 }); // 5 dice: 2 come back, 4 spent → 2 still spent
    expect(l.conc).toBeUndefined();
  });
  it('long rest (2024): all hit dice', () => {
    expect(longRest(d, used, '2024').h).toEqual({});
  });
  it('concentration DC: 10 or half the damage; 2024 caps at 30', () => {
    expect(concentrationDC(14)).toBe(10);
    expect(concentrationDC(45)).toBe(22);
    expect(concentrationDC(100, '2014')).toBe(50);
    expect(concentrationDC(100, '2024')).toBe(30);
  });
});

describe('order and own counters', () => {
  it('keeps the classes in the order written', async () => {
    const { parseClasses } = await import('../lib/play/model');
    expect(parseClasses('Warlock 11 / Fighter 2').map((c) => c.cls)).toEqual(['warlock', 'fighter']);
  });
  it('counters can follow the proficiency bonus or a modifier', async () => {
    const { derive } = await import('../lib/play/model');
    const d = derive({ classLevel: 'Druid 5', stats: { wis: 18 }, def: { counters: [{ id: 'a', name: 'A', max: 0, per: 'pb', rest: 'long' }, { id: 'b', name: 'B', max: 0, per: 'cha', rest: 'short' }] } });
    expect(d.resources.find((r) => r.key === 'x_a')?.max).toBe(3);
    expect(d.resources.find((r) => r.key === 'x_b')?.max).toBe(1);
  });
});

describe('hit dice by size', () => {
  it('a long rest gives the biggest back first', async () => {
    const { derive, longRest, hitDieLeft } = await import('../lib/play/model');
    const d = derive({ classLevel: 'Fighter 2 / Wizard 4', stats: {} });
    const l = longRest(d, { h: { '10': 2, '6': 3 } }, '2014'); // 6 dice: 3 come back
    expect(l.h).toEqual({ '6': 2 });
    expect(hitDieLeft(d, l, 10)).toBe(2);
    expect(hitDieLeft(d, l, 6)).toBe(2);
  });
});
