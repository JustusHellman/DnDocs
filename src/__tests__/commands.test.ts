import { describe, expect, it } from 'vitest';
import { commandHints, evalMath, findByName, matchWhisper, parseCommand } from '../lib/chat/commands';

describe('chat commands', () => {
  it('reads commands', () => {
    expect(parseCommand('hello')).toBeNull();
    expect(parseCommand('/r 1d20')).toBeNull();
    expect(parseCommand('= 3+4')).toEqual({ c: 'math', expr: '3+4' });
    expect(parseCommand('/cast 1')).toEqual({ c: 'cast', level: 1 });
    expect(parseCommand('/cast level 2')).toEqual({ c: 'cast', level: 2 });
    expect(parseCommand('/cast fireball 4')).toEqual({ c: 'cast', spell: 'fireball', level: 4 });
    expect(parseCommand('/cast guiding bolt')).toEqual({ c: 'cast', spell: 'guiding bolt' });
    expect(parseCommand('/use ki 2')).toEqual({ c: 'use', what: 'ki', n: 2 });
    expect(parseCommand('/conc off')).toEqual({ c: 'conc', on: false });
    expect(parseCommand('/conc Bless')).toEqual({ c: 'conc', on: true, spell: 'Bless' });
    expect(parseCommand('/init 17')).toEqual({ c: 'init', total: 17 });
    expect(parseCommand('/init x').c).toBe('bad');
    expect(parseCommand('/rest party long')).toEqual({ c: 'rest', kind: 'long', party: true });
    expect(parseCommand('/frobnicate')).toEqual({ c: 'unknown', name: 'frobnicate' });
  });
  it('does sums safely', () => {
    expect(evalMath('12+7+3')).toBe(22);
    expect(evalMath('2*(3+4)')).toBe(14);
    expect(evalMath('10 x 3 − 1')).toBe(29);
    expect(evalMath('7/2')).toBe(3.5);
    expect(evalMath('alert(1)')).toBeNull();
    expect(evalMath('1/0')).toBeNull();
  });
  it('finds names', () => {
    const items = ['Guidance', 'Guiding Bolt', 'Cure Wounds', 'Fire Bolt'];
    expect(findByName('guiding', items, (x) => x)).toBe('Guiding Bolt');
    expect(findByName('guid', items, (x) => x)).toBe('Guidance');
    expect(findByName('cure', items, (x) => x)).toBe('Cure Wounds');
    expect(findByName('fire b', items, (x) => x)).toBe('Fire Bolt');
    const people = [{ name: 'Old Tom' }, { name: 'Anna Berg' }];
    expect(matchWhisper('Old Tom hi there', people)).toEqual({ to: people[0], text: 'hi there' });
    expect(matchWhisper('anna psst', people)).toEqual({ to: people[1], text: 'psst' });
    expect(matchWhisper('Bob hi', people)).toBeNull();
  });
  it('hints', () => {
    expect(commandHints('/c', false).map((c) => c.name)).toEqual(['cast', 'conc', 'check']);
    expect(commandHints('/rest', false).map((c) => c.name)).toEqual(['rest']);
    expect(commandHints('/rest', true).map((c) => c.name)).toEqual(['rest', 'rest party']);
  });
});
