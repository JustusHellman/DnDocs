import { describe, expect, it } from 'vitest';
import { DM_COLOR, PALETTE, pickColor, shouldRepick, textOn, tint } from '../lib/chat/colors';

describe('table colours', () => {
  it('reads dark numbers on light dice and white on dark ones', () => {
    expect(textOn('#e0a526')).toBe('#1c140d');
    expect(textOn('#9bcf3c')).toBe('#1c140d');
    expect(textOn('#1e3a8a')).toBe('#ffffff');
    expect(textOn('#7f1d1d')).toBe('#ffffff');
  });
  it('gives the DM gold and players a free colour', () => {
    expect(pickColor('dm', {}, true)).toBe(DM_COLOR);
    const taken = { dm: DM_COLOR, a: PALETTE[1].hex };
    const c = pickColor('b', taken, false);
    expect(c).not.toBe(DM_COLOR);
    expect(c).not.toBe(PALETTE[1].hex);
    expect(pickColor('b', taken, false)).toBe(c);
  });
  it('lets the later id re-pick a clash', () => {
    const colors = { a: '#e5484d', b: '#e5484d' };
    expect(shouldRepick('a', colors)).toBe(false);
    expect(shouldRepick('b', colors)).toBe(true);
  });
  it('tints with an alpha suffix', () => {
    expect(tint('#112233', 0.5)).toBe('#11223380');
  });
});
