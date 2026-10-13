/**
 * The jukebox's play order, worked out the same way on every device.
 *
 * An environment's tracks are shuffled into "rounds" (every track once per round, a new shuffle
 * each round) using the seed from the shared state. Consecutive tracks overlap by BLEND seconds,
 * where one fades out and the next fades in. Given the shared state and the clock, any device can
 * say which track is playing and how far into it, without anyone writing anything when a track
 * ends. Pure functions only (unit-tested).
 */
import type { JukeboxState } from './types';

/** Seconds that one track overlaps the next. */
export const BLEND = 4;

export interface SlotInfo {
  trackId: string;
  /** Unique per play (the same track in another round is another slot). */
  key: string;
  round: number;
  index: number;
  /** Where in the sequence (seconds) this track starts. */
  start: number;
  /** Seconds until the next track starts (track length minus the blend). */
  length: number;
  /** Full length of the track's file. */
  duration: number;
  /** Seconds skipped at the start of the file (environments that start at the hit). */
  skip: number;
}

export interface Playhead extends SlotInfo {
  /** Seconds into the track's file. */
  offset: number;
}

/** Seconds a track occupies before the next one begins. */
export function slotLength(duration: number) {
  return duration > BLEND * 2 + 2 ? duration - BLEND : duration;
}

/** Small, fast, seedable random numbers (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], seed: number): T[] {
  const out = [...list];
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Where the sequence is (seconds) at a given moment. */
export function positionAt(state: Pick<JukeboxState, 'playing' | 'anchorAt' | 'anchorPos'>, now: number) {
  const p = state.playing ? state.anchorPos + (now - state.anchorAt) / 1000 : state.anchorPos;
  return Math.max(0, p);
}

export interface Sequence {
  /** The track at a position (null when there's nothing to play). */
  at(pos: number): Playhead | null;
  /** The next `count` tracks after the one at `pos` (for "up next" and preloading). */
  upcoming(pos: number, count: number): SlotInfo[];
  /** Nothing playable. */
  empty: boolean;
}

/**
 * The play order for an environment.
 * @param trackIds the environment's tracks
 * @param durations seconds per track id (tracks without a length are skipped)
 * @param starts seconds to skip at the start of a track (optional, per track id)
 */
export function buildSequence(
  state: Pick<JukeboxState, 'seed' | 'lead' | 'avoid'>,
  trackIds: string[],
  durations: Record<string, number>,
  starts: Record<string, number> = {},
): Sequence {
  const ok = (id: string) => (durations[id] ?? 0) > 0;
  const skipOf = (id: string) => {
    const s = starts[id] ?? 0;
    return s > 0 && s < durations[id] - 10 ? s : 0;
  };
  const pool = [...new Set(trackIds.filter(ok))].sort();
  const lead = state.lead && ok(state.lead) ? state.lead : null;
  const avoid = new Set(state.avoid ?? []);
  const len = (id: string) => slotLength(durations[id] - skipOf(id));
  const poolLength = pool.reduce((a, id) => a + len(id), 0);

  const rounds = new Map<number, string[]>();
  function order(round: number): string[] {
    const cached = rounds.get(round);
    if (cached) return cached;
    let list: string[];
    if (round === 0) {
      const shuffled = shuffle(pool, state.seed);
      list = [...shuffled.filter((id) => !avoid.has(id)), ...shuffled.filter((id) => avoid.has(id))];
      if (lead) list = [lead, ...list.filter((id) => id !== lead)];
    } else {
      // Fill in earlier rounds first (each one depends on how the previous one ended).
      for (let r = Math.max(1, Math.max(...rounds.keys(), 0)); r < round; r++) order(r);
      list = shuffle(pool, (state.seed + round * 7919) >>> 0);
      const prevLast = order(round - 1).at(-1);
      if (list.length > 1 && list[0] === prevLast) [list[0], list[1]] = [list[1], list[0]];
    }
    rounds.set(round, list);
    return list;
  }

  const round0Length = () => order(0).reduce((a, id) => a + len(id), 0);
  const empty = pool.length === 0 && !lead;

  function locate(pos: number): { round: number; rem: number; base: number } {
    const l0 = round0Length();
    if (pos < l0 || poolLength <= 0) return { round: 0, rem: Math.min(pos, Math.max(0, l0 - 1e-6)), base: 0 };
    const r = 1 + Math.floor((pos - l0) / poolLength);
    const base = l0 + (r - 1) * poolLength;
    return { round: r, rem: pos - base, base };
  }

  function slot(round: number, index: number, start: number): SlotInfo {
    const trackId = order(round)[index];
    return { trackId, key: `${trackId}:${round}:${index}`, round, index, start, length: len(trackId), duration: durations[trackId], skip: skipOf(trackId) };
  }

  function at(pos: number): Playhead | null {
    if (empty) return null;
    pos = Math.max(0, pos);
    const { round, rem, base } = locate(pos);
    const list = order(round);
    let start = base;
    for (let i = 0; i < list.length; i++) {
      const l = len(list[i]);
      if (rem < start - base + l || i === list.length - 1) {
        const s = slot(round, i, start);
        return { ...s, offset: Math.min(s.skip + Math.max(0, pos - start), s.duration) };
      }
      start += l;
    }
    return null;
  }

  function upcoming(pos: number, count: number): SlotInfo[] {
    const out: SlotInfo[] = [];
    let cur = at(pos);
    while (cur && out.length < count) {
      const nextPos = cur.start + cur.length + 1e-6;
      const next = at(nextPos);
      if (!next || next.key === cur.key) break;
      out.push(next);
      cur = next;
    }
    return out;
  }

  return { at, upcoming, empty };
}
