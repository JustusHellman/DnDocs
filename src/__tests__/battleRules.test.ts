import { initiativeOrder, moveInOrder } from '../lib/battle/geometry';
import { describe, expect, it } from 'vitest';
import { walk, WallIndex, gridSteps } from '../lib/battle/pathing';
import { snapTemplate, squaresIn, templateLabel, templatePolygon } from '../lib/battle/templates';
import { levelOf, partyBudget, rate, xpForCr } from '../lib/battle/encounter';
import { deathState, readDeathSaves, rollDeathSave, deathSavesAfter } from '../lib/hitPoints';

const g5e = { feet: 5, diagonal: '5e' as const };
const bounds = { x0: 0, y0: 0, x1: 20, y1: 14 };

describe('walking distance', () => {
  it('is the straight grid distance when nothing is in the way', () => {
    const r = walk({ x: 1.5, y: 1.5 }, { x: 5.5, y: 3.5 }, new WallIndex([]), g5e, bounds);
    expect(r).toMatchObject({ feet: 20, detour: false, blocked: false });
  });
  it('goes around a wall', () => {
    // A wall at x = 5 from y = 0 to y = 10: from (3,5) to (7,5) you walk round its end at y = 10.
    const walls = new WallIndex([[5, 0, 5, 10]]);
    const r = walk({ x: 3.5, y: 5.5 }, { x: 7.5, y: 5.5 }, walls, g5e, bounds);
    expect(r.detour).toBe(true);
    expect(r.feet).toBeGreaterThan(20);
    // Down to the wall's end, one step across (no cutting the corner), and back up: 11 squares.
    expect(r.feet).toBe(55);
    expect(r.path.length).toBeGreaterThan(2);
  });
  it('does not squeeze diagonally between wall corners', () => {
    const walls = new WallIndex([
      [5, 0, 5, 5],
      [5, 5, 10, 5],
    ]);
    // From just inside the corner (4,5) to (5,4): the diagonal would cut the corner at (5,5).
    const r = walk({ x: 4.5, y: 5.5 }, { x: 5.5, y: 4.5 }, walls, g5e, { x0: 0, y0: 0, x1: 12, y1: 12 });
    expect(r.feet).toBeGreaterThan(5);
  });
  it('reports when there is no way through', () => {
    const box: [number, number, number, number][] = [
      [8, 8, 12, 8],
      [12, 8, 12, 12],
      [12, 12, 8, 12],
      [8, 12, 8, 8],
    ];
    const r = walk({ x: 2.5, y: 2.5 }, { x: 10.5, y: 10.5 }, new WallIndex(box), g5e, bounds);
    expect(r.blocked).toBe(true);
  });
  it('counts diagonals by the table’s rule', () => {
    expect(gridSteps(3, 3, '5e')).toBe(3);
    expect(gridSteps(3, 3, 'alt')).toBe(4);
    const walls = new WallIndex([[5, 0, 5, 10]]);
    const alt = walk({ x: 3.5, y: 5.5 }, { x: 7.5, y: 5.5 }, walls, { feet: 5, diagonal: 'alt' }, bounds);
    expect(alt.feet).toBeGreaterThan(50);
  });
});

describe('spell templates', () => {
  it('a 15 ft cone is as wide as it is long and catches the squares in front', () => {
    const a = { x: 5, y: 5 };
    const b = { x: 8, y: 5 };
    const poly = templatePolygon('cone', a, b);
    expect(poly).toHaveLength(3);
    expect(Math.hypot(poly[1].x - poly[2].x, poly[1].y - poly[2].y)).toBeCloseTo(3);
    const sq = squaresIn(poly).map((p) => `${p.x},${p.y}`);
    expect(sq).toContain('6,4'); // centre (6.5, 4.5) is inside, half a square off the axis
    expect(sq).not.toContain('4,5'); // behind the caster
    expect(templateLabel('cone', a, b, 5)).toBe('15 ft cone');
  });
  it('a line leaves from the middle of a square side and is one square wide', () => {
    const s = snapTemplate('beam', { x: 0.1, y: 5.4 }, { x: 6.2, y: 5.5 });
    expect(s.a).toEqual({ x: 0, y: 5.5 });
    const sq = squaresIn(templatePolygon('beam', s.a, s.b, 1));
    expect(sq.map((p) => p.y)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(templateLabel('beam', s.a, s.b, 5)).toBe('30 ft line');
  });
  it('snaps the origin to a corner and the size to whole squares', () => {
    const s = snapTemplate('circle', { x: 4.4, y: 4.6 }, { x: 7.3, y: 4.6 });
    expect(s.a).toEqual({ x: 4, y: 5 });
    expect(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)).toBeCloseTo(3);
    const c = snapTemplate('cube', { x: 2.2, y: 2.2 }, { x: 5.1, y: 3.6 });
    expect(c).toEqual({ a: { x: 2, y: 2 }, b: { x: 5, y: 5 } });
  });
});

describe('encounter difficulty (2024 DMG)', () => {
  it('reads challenge ratings and levels written different ways', () => {
    expect(xpForCr('1')).toBe(200);
    expect(xpForCr('1/4')).toBe(50);
    expect(xpForCr('0.5')).toBe(100);
    expect(xpForCr('5 (1,800 XP)')).toBe(1800);
    expect(levelOf('Rogue 3')).toBe(3);
    expect(levelOf('Fighter 2 / Wizard 1')).toBe(3);
  });
  it('rates four level-3 characters against five dire wolves', () => {
    const budget = partyBudget([3, 3, 3, 3]);
    expect(budget).toEqual({ low: 600, moderate: 900, high: 1600 });
    expect(rate(5 * 200, budget)).toBe('high');
    expect(rate(3 * 200, budget)).toBe('low');
    expect(rate(4 * 200, budget)).toBe('moderate');
    expect(rate(3000, budget)).toBe('deadly');
  });
});

describe('death saves', () => {
  it('follows the 5e rules', () => {
    let d = readDeathSaves({});
    d = rollDeathSave(d, 12).saves;
    d = rollDeathSave(d, 1).saves;
    expect(d).toEqual({ successes: 1, failures: 2 });
    expect(deathState(rollDeathSave(d, 5).saves)).toBe('dead');
    expect(rollDeathSave(d, 20)).toEqual({ saves: { successes: 0, failures: 0 }, regain: true });
    expect(deathState({ successes: 3, failures: 1 })).toBe('stable');
    expect(readDeathSaves({ deathSaves: '2/1' })).toEqual({ successes: 2, failures: 1 });
  });
});

describe('death saves after damage', () => {
  const s0 = { successes: 0, failures: 0 };
  it('a hit at 0 HP is one failure; massive damage kills; healing resets', () => {
    const at0 = { current: 0, temp: 0, max: 28 };
    expect(deathSavesAfter(at0, at0, 'damage', 5, s0)).toEqual({ deathSaves: '0/1', massive: false });
    expect(deathSavesAfter(at0, at0, 'damage', 28, s0)).toEqual({ deathSaves: '0/3', massive: true });
    const up = { current: 10, temp: 5, max: 28 };
    // 10 HP + 5 temp: 42 damage leaves 27 over → not massive; 43 leaves 28 → massive.
    expect(deathSavesAfter(up, at0, 'damage', 42, s0).massive).toBe(false);
    expect(deathSavesAfter(up, at0, 'damage', 43, s0).massive).toBe(true);
    expect(deathSavesAfter(at0, { current: 3, temp: 0, max: 28 }, 'heal', 3, { successes: 1, failures: 2 })).toEqual({ deathSaves: '', massive: false });
    expect(deathSavesAfter(up, { current: 5, temp: 0, max: 28 }, 'damage', 10, s0)).toEqual({ deathSaves: undefined, massive: false });
  });
});

describe('initiative order', () => {
  const tk = (id: string, initiative: number | null, player = false, initTie: number | null = null) => ({ id, name: id, initiative, initTie, controlledBy: player ? ['p'] : [] });
  it('ties: players before monsters, then the DM can reorder', () => {
    const list = [tk('wolf', 15), tk('brom', 15, true), tk('vex', 15, true), tk('ogre', 20), tk('sela', 8, true)];
    const ids = (l: typeof list) => initiativeOrder(l).map((t) => t.id);
    expect(ids(list)).toEqual(['ogre', 'brom', 'vex', 'wolf', 'sela']);
    // Vex goes before Brom (the players agreed): only the tie order changes.
    let places = moveInOrder(initiativeOrder(list), 'vex', -1);
    let next = list.map((t) => (places[t.id] ? { ...t, ...places[t.id] } : t));
    expect(ids(next)).toEqual(['ogre', 'vex', 'brom', 'wolf', 'sela']);
    expect(Object.values(places).every((p) => p.initiative === 15)).toBe(true);
    // The wolf jumps ahead of the ogre: it takes the ogre's roll and goes first.
    const o = initiativeOrder(next);
    places = moveInOrder(o, 'wolf', -1);
    next = next.map((t) => (places[t.id] ? { ...t, ...places[t.id] } : t));
    places = moveInOrder(initiativeOrder(next), 'wolf', -1);
    next = next.map((t) => (places[t.id] ? { ...t, ...places[t.id] } : t));
    places = moveInOrder(initiativeOrder(next), 'wolf', -1);
    next = next.map((t) => (places[t.id] ? { ...t, ...places[t.id] } : t));
    expect(ids(next)).toEqual(['wolf', 'ogre', 'vex', 'brom', 'sela']);
    expect(next.find((t) => t.id === 'wolf')!.initiative).toBe(20);
    // Last place can't go further down; one place up puts Sela (8) directly before Brom, on 15.
    expect(moveInOrder(initiativeOrder(next), 'sela', 1)).toEqual({});
    places = moveInOrder(initiativeOrder(next), 'sela', -1);
    next = next.map((t) => (places[t.id] ? { ...t, ...places[t.id] } : t));
    expect(ids(next)).toEqual(['wolf', 'ogre', 'vex', 'sela', 'brom']);
  });
});
