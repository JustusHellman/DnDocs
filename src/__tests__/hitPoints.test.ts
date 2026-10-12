import { describe, expect, it } from 'vitest';
import { applyHp, hpToAttributes, parseHp, readHp } from '../lib/hitPoints';

describe('hit points', () => {
  it('reads the maximum from stat block text', () => {
    expect(parseHp('45 (6d8 + 18)')).toBe(45);
    expect(parseHp('')).toBe(null);
    expect(parseHp(undefined)).toBe(null);
  });
  it('treats a character without current HP as unhurt', () => {
    expect(readHp({}, '30')).toEqual({ current: 30, temp: 0, max: 30 });
    expect(readHp({ currentHp: '12', tempHp: '5' }, '30')).toEqual({ current: 12, temp: 5, max: 30 });
    expect(readHp({ currentHp: '12' }, '')).toEqual({ current: 12, temp: 0, max: null });
  });
  it('takes damage from temporary HP first and never below 0', () => {
    const s = { current: 20, temp: 5, max: 30 };
    expect(applyHp(s, 'damage', 3)).toEqual({ current: 20, temp: 2, max: 30 });
    expect(applyHp(s, 'damage', 8)).toEqual({ current: 17, temp: 0, max: 30 });
    expect(applyHp(s, 'damage', 99).current).toBe(0);
  });
  it('heals up to the maximum (or freely without one)', () => {
    expect(applyHp({ current: 25, temp: 0, max: 30 }, 'heal', 10).current).toBe(30);
    expect(applyHp({ current: 25, temp: 0, max: null }, 'heal', 10).current).toBe(35);
  });
  it('keeps the larger temporary HP instead of stacking', () => {
    expect(applyHp({ current: 10, temp: 6, max: 30 }, 'temp', 4).temp).toBe(6);
    expect(applyHp({ current: 10, temp: 6, max: 30 }, 'temp', 9).temp).toBe(9);
  });
  it('a long rest restores HP and removes temporary HP', () => {
    expect(applyHp({ current: 3, temp: 4, max: 30 }, 'full', 0)).toEqual({ current: 30, temp: 0, max: 30 });
  });
  it('stores numbers as text like the other fields', () => {
    expect(hpToAttributes({ current: 7, temp: 0, max: 30 })).toEqual({ currentHp: '7', tempHp: '' });
  });
});
