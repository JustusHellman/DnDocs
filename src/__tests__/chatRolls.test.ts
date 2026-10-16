import { describe, expect, it } from 'vitest';
import { parseChatRoll, parseRollCommand, rollCommand, toChatRoll } from '../lib/chat/rolls';
import { parseFormula, rollFormula } from '../lib/dice';

describe('rolling from the chat box', () => {
  it('reads /r commands with a label and options', () => {
    const c = parseRollCommand('/r 1d20 + 5 adv Stealth')!;
    expect(c.formula).toEqual({ dice: [{ sign: 1, count: 1, sides: 20 }], mod: 5 });
    expect(c.opts).toEqual({ advantage: true });
    expect(c.label).toBe('Stealth');
    expect(parseRollCommand('/roll 2d6+3 Longsword')?.label).toBe('Longsword');
    expect(parseRollCommand('/r d20 dis')?.opts).toEqual({ disadvantage: true });
    expect(parseRollCommand('/r 1d8+3 crit')?.opts).toEqual({ crit: true });
  });

  it('a bare formula rolls; ordinary messages stay messages', () => {
    expect(parseRollCommand('1d20+5')).not.toBeNull();
    expect(parseRollCommand('2d6')).not.toBeNull();
    for (const msg of ['hello', '15', 'I attack!', '1d20 is fine by me', 'd&d tonight?']) expect(parseRollCommand(msg)).toBeNull();
  });

  it('a roll survives the trip through the chat', () => {
    const r = rollFormula(parseFormula('1d20+5')!, { advantage: true }, () => 0.99);
    const c = toChatRoll(r, 'Attack');
    const back = parseChatRoll(JSON.stringify(c))!;
    expect(back.t).toBe(25);
    expect(back.nat).toBe(20);
    expect(back.adv).toBe(1);
    expect(back.l).toBe('Attack');
    expect(parseChatRoll('nonsense')).toBeNull();
    expect(rollCommand(parseRollCommand('/r 3d6')!).d[0].v).toHaveLength(3);
  });
});
