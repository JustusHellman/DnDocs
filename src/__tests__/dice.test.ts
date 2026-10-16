import { describe, expect, it } from 'vitest';
import { addDie, addModifier, formatFormula, parseFormula, rollFormula } from '../lib/dice';

/** A die that lands on the values given, in order (as fractions of the sides). */
const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('dice formulas', () => {
  it('reads what people type', () => {
    expect(parseFormula('1d20+5')).toEqual({ dice: [{ sign: 1, count: 1, sides: 20 }], mod: 5 });
    expect(parseFormula(' 2d6 + 1d8 + 3 ')).toEqual({ dice: [{ sign: 1, count: 2, sides: 6 }, { sign: 1, count: 1, sides: 8 }], mod: 3 });
    expect(parseFormula('d100')).toEqual({ dice: [{ sign: 1, count: 1, sides: 100 }], mod: 0 });
    expect(parseFormula('4d6-1')?.mod).toBe(-1);
    expect(parseFormula('1d6+1d6')?.dice).toEqual([{ sign: 1, count: 2, sides: 6 }]);
    for (const bad of ['', 'abc', '1d', 'd1', '2x6', '1d20++2', '1000d6']) expect(parseFormula(bad)).toBeNull();
  });

  it('builds up from taps and writes it back', () => {
    let f = addDie(null, 6);
    f = addDie(f, 6);
    f = addDie(f, 4);
    f = addModifier(f, 3);
    expect(formatFormula(f)).toBe('2d6 + 1d4 + 3');
    expect(formatFormula(addModifier(parseFormula('1d20'), -2))).toBe('1d20 - 2');
  });

  it('rolls and adds up', () => {
    // d6 showing 3 (0.4*6 → 2 → 3) and 6 (0.99 → 6), +2
    const r = rollFormula(parseFormula('2d6+2')!, {}, fixed(0.4, 0.99));
    expect(r.terms[0].rolls).toEqual([3, 6]);
    expect(r.total).toBe(11);
  });

  it('advantage keeps the higher d20, disadvantage the lower', () => {
    const adv = rollFormula(parseFormula('1d20+3')!, { advantage: true }, fixed(0.1, 0.9)); // 3 and 19
    expect(adv.total).toBe(22);
    expect(adv.terms[0].dropped).toEqual([3]);
    expect(adv.natural).toBe(19);
    const dis = rollFormula(parseFormula('1d20+3')!, { disadvantage: true }, fixed(0.1, 0.9));
    expect(dis.total).toBe(6);
    // Both at once cancel out.
    expect(rollFormula(parseFormula('1d20')!, { advantage: true, disadvantage: true }, fixed(0.5)).terms[0].dropped).toBeUndefined();
  });

  it('a crit doubles the dice, not the modifier', () => {
    const r = rollFormula(parseFormula('1d8+3')!, { crit: true }, fixed(0.99));
    expect(r.terms[0].rolls).toEqual([8, 8]);
    expect(r.total).toBe(19);
  });

  it('spots a natural 20 or 1 on a single d20', () => {
    expect(rollFormula(parseFormula('1d20+5')!, {}, fixed(0.999)).natural).toBe(20);
    expect(rollFormula(parseFormula('1d20+5')!, {}, fixed(0)).natural).toBe(1);
    expect(rollFormula(parseFormula('2d20')!, {}, fixed(0)).natural).toBeUndefined();
  });
});
