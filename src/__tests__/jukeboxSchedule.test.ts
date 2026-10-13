import { describe, expect, it } from 'vitest';
import { BLEND, buildSequence, positionAt, slotLength } from '../lib/jukebox/schedule';

const durations: Record<string, number> = { a: 100, b: 200, c: 150, d: 120, e: 90, broken: 0 };
const ids = ['a', 'b', 'c', 'd', 'e', 'broken'];
const state = { seed: 42, lead: null, avoid: [] as string[] };

describe('jukebox schedule', () => {
  it('plays every track once per round, skipping tracks without a length', () => {
    const seq = buildSequence(state, ids, durations);
    const seen: string[] = [];
    let pos = 0;
    for (let i = 0; i < 5; i++) {
      const p = seq.at(pos)!;
      seen.push(p.trackId);
      pos = p.start + p.length + 0.001;
    }
    expect([...seen].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('gives the same order on every device and a different one for another seed', () => {
    const order = (seed: number) => {
      const seq = buildSequence({ ...state, seed }, ids, durations);
      return [seq.at(0)!.trackId, ...seq.upcoming(0, 9).map((s) => s.trackId)].join();
    };
    expect(order(42)).toBe(order(42));
    const others = [1, 2, 3, 4, 5, 6].map(order);
    expect(others.some((o) => o !== order(42))).toBe(true);
  });

  it('works out the track and the offset from the position', () => {
    const seq = buildSequence(state, ids, durations);
    const first = seq.at(0)!;
    expect(first.offset).toBe(0);
    const mid = seq.at(first.length - 1)!;
    expect(mid.trackId).toBe(first.trackId);
    expect(mid.offset).toBeCloseTo(first.length - 1);
    const second = seq.at(first.length + 2)!;
    expect(second.trackId).not.toBe(first.trackId);
    expect(second.offset).toBeCloseTo(2);
    expect(first.length).toBe(durations[first.trackId] - BLEND);
  });

  it('keeps going for hours without repeating a track back to back', () => {
    const seq = buildSequence(state, ids, durations);
    let prev = '';
    let pos = 0;
    for (let i = 0; i < 300; i++) {
      const p = seq.at(pos)!;
      expect(p.trackId).not.toBe(prev);
      prev = p.trackId;
      pos = p.start + p.length + 0.001;
    }
    expect(pos).toBeGreaterThan(3600 * 8);
  });

  it('starts with the DM’s pick and saves recently played tracks for last', () => {
    const lead = buildSequence({ ...state, lead: 'c' }, ids, durations);
    expect(lead.at(0)!.trackId).toBe('c');
    const avoid = buildSequence({ ...state, avoid: ['a', 'b'] }, ids, durations);
    const firstThree = [avoid.at(0)!.trackId, ...avoid.upcoming(0, 2).map((s) => s.trackId)];
    expect(firstThree).not.toContain('a');
    expect(firstThree).not.toContain('b');
  });

  it('plays a picked track that isn’t in the environment first, then the environment', () => {
    const seq = buildSequence({ ...state, lead: 'x' }, ['a', 'b'], { ...durations, x: 60 });
    expect(seq.at(0)!.trackId).toBe('x');
    expect(['a', 'b']).toContain(seq.upcoming(0, 1)[0].trackId);
  });

  it('is empty without playable tracks and survives a single track', () => {
    expect(buildSequence(state, ['broken'], durations).empty).toBe(true);
    expect(buildSequence(state, [], durations).at(10)).toBe(null);
    const one = buildSequence(state, ['a'], durations);
    expect(one.at(500)!.trackId).toBe('a');
  });

  it('moves the position with the clock only while playing', () => {
    expect(positionAt({ playing: true, anchorAt: 1000, anchorPos: 10 }, 6000)).toBe(15);
    expect(positionAt({ playing: false, anchorAt: 1000, anchorPos: 10 }, 6000)).toBe(10);
    expect(slotLength(5)).toBe(5);
  });
});

describe('jukebox schedule: starting at the hit', () => {
  it('skips quiet intros and shortens the slot to match', () => {
    const seq = buildSequence(state, ['a', 'b'], { a: 100, b: 200 }, { a: 30, b: 500 });
    const order = [seq.at(0)!, ...seq.upcoming(0, 1)];
    const a = order.find((p) => p.trackId === 'a')!;
    const b = order.find((p) => p.trackId === 'b')!;
    expect(a.skip).toBe(30);
    expect(a.length).toBe(70 - BLEND);
    // A start beyond the end of the track is ignored.
    expect(b.skip).toBe(0);
    const first = seq.at(0)!;
    expect(first.offset).toBe(first.skip);
    expect(seq.at(5)!.offset).toBeCloseTo(first.skip + 5);
  });
});
