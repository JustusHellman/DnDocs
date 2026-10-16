import { describe, expect, it } from 'vitest';
import { energy, layoutDice, startBodies, stepBodies, throwSize, type TossDie } from '../lib/chat/tossPhysics';

const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const d = (sides: number, ...values: number[]): TossDie[] => values.map((value) => ({ sides, value }));

describe('dice layout', () => {
  it('sorts by kind (d20 first) then low to high, each kind on its own row', () => {
    const dice = [...d(6, 5, 2), ...d(20, 14), ...d(6, 1)];
    const { slots } = layoutDice(dice, 1920, 1080);
    expect(slots[2].y).toBeLessThan(slots[0].y); // the d20 row is above the d6 row
    expect(slots[3].x).toBeLessThan(slots[1].x); // 1 before 2
    expect(slots[1].x).toBeLessThan(slots[0].x); // 2 before 5
    expect(slots[0].y).toBe(slots[1].y);
  });
  it('keeps everything on screen, and stacks identical results when there are too many', () => {
    for (const [vw, vh, n] of [[1920, 1080, 400], [390, 844, 120]]) {
      const many = Array.from({ length: n }, (_, i) => ({ sides: 6, value: (i % 6) + 1 }));
      const l = layoutDice(many, vw, vh);
      for (const s of l.slots) {
        expect(s.x - s.size / 2).toBeGreaterThanOrEqual(0);
        expect(s.x + s.size / 2).toBeLessThanOrEqual(vw);
        expect(s.y - s.size / 2).toBeGreaterThanOrEqual(0);
        expect(s.size).toBeGreaterThanOrEqual(40 * 0.62);
      }
      expect(l.stacked).toBe(true);
      expect(l.slots.filter((s) => !s.merged)).toHaveLength(6);
      expect(l.slots.reduce((n, s) => n + (s.merged ? 0 : (s.count ?? 1)), 0)).toBe(n);
    }
  });
  it('shows a normal handful one by one', () => {
    const l = layoutDice(d(6, 1, 2, 3, 4, 5, 6, 1, 2), 1920, 1080);
    expect(l.stacked).toBe(false);
    expect(l.slots.every((s) => !s.merged && !s.count)).toBe(true);
  });
});

describe('dice collisions', () => {
  it('calms down instead of escalating, even with 40 dice thrown into a pile', () => {
    for (const n of [2, 10, 40, 60]) {
      const vw = 1920;
      const vh = 1080;
      const size = throwSize(n, vw);
      const bodies = startBodies(n, size, vw, vh, seeded(n));
      const e0 = energy(bodies);
      let peak = e0;
      for (let t = 0; t < 1.1; t += 1 / 120) {
        stepBodies(bodies, size * 0.48, 1 / 120, vw, vh);
        peak = Math.max(peak, energy(bodies));
        for (const b of bodies) {
          expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
          expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(3200 + 1e-6);
        }
      }
      expect(peak).toBeLessThanOrEqual(e0 * 1.0001);
      expect(energy(bodies)).toBeLessThan(e0 * 0.05);
    }
  });
});
