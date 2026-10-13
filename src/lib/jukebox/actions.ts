/**
 * The DM's jukebox buttons as pure state changes (unit-tested), plus the shared clock.
 */
import { buildSequence, newSeed, positionAt } from './schedule';
import type { JukeboxConfig, JukeboxState } from './types';

export const DEFAULT_FADE_MS = 3000;
const RECENT_MAX = 12;

/** Milliseconds this device's clock is behind the web server's (see measureClockSkew). */
let skew = 0;
export const now = () => Date.now() + skew;

/**
 * Everyone works out the position from wall-clock time, so a device whose clock is far off would
 * play the wrong part. The page's own server (same origin, so the Date header is readable) gives
 * a second-accurate time; we only correct clocks that are clearly wrong.
 */
export async function measureClockSkew() {
  try {
    const t0 = Date.now();
    const res = await fetch(`${location.pathname}?clock=${t0}`, { method: 'HEAD', cache: 'no-store' });
    const t1 = Date.now();
    const date = res.headers.get('date');
    if (!date) return;
    const server = Date.parse(date) + 500; // the header is rounded down to the second
    const diff = server - (t0 + t1) / 2;
    if (Math.abs(diff) > 2000) skew = diff;
  } catch {
    /* offline: trust the device clock */
  }
}

export interface ActionContext {
  /** Track ids of each environment. */
  envTracks: (envId: string) => string[];
  durations: Record<string, number>;
  config?: JukeboxConfig;
  at?: number;
}

export interface Change {
  state: JukeboxState;
  /** New "recently played" list for an environment. */
  recent?: { envId: string; tracks: string[] };
}

const blank = (): JukeboxState => ({ envId: null, tracks: [], seed: 0, lead: null, avoid: [], playing: false, anchorAt: 0, anchorPos: 0, fadeMs: DEFAULT_FADE_MS, rev: 0 });

/** The track playing right now (if any). */
export function currentTrack(state: JukeboxState | undefined, ctx: ActionContext) {
  if (!state?.envId) return null;
  const seq = buildSequence(state, state.tracks ?? ctx.envTracks(state.envId), ctx.durations);
  return seq.at(positionAt(state, ctx.at ?? now()));
}

/** Remember what's playing as recently played, so coming back to the environment starts fresh. */
function remember(state: JukeboxState | undefined, ctx: ActionContext): Change['recent'] {
  const head = currentTrack(state, ctx);
  if (!state?.envId || !head) return undefined;
  const prev = ctx.config?.recent?.[state.envId] ?? [];
  return { envId: state.envId, tracks: [head.trackId, ...prev.filter((id) => id !== head.trackId)].slice(0, RECENT_MAX) };
}

export function playEnvironment(cur: JukeboxState | undefined, envId: string, ctx: ActionContext, fadeMs?: number): Change {
  const base = cur ?? blank();
  const recent = remember(cur, ctx);
  const avoid = recent?.envId === envId ? recent.tracks : (ctx.config?.recent?.[envId] ?? []);
  return {
    state: { ...base, envId, tracks: ctx.envTracks(envId), seed: newSeed(), lead: null, avoid, playing: true, anchorAt: ctx.at ?? now(), anchorPos: 0, fadeMs: fadeMs ?? base.fadeMs, rev: base.rev + 1 },
    recent,
  };
}

/** Play a specific track now (in the given environment, or the current one). */
export function playTrack(cur: JukeboxState | undefined, trackId: string, envId: string | null, ctx: ActionContext): Change {
  const base = cur ?? blank();
  const env = envId ?? base.envId;
  if (!env) throw new Error('Pick an environment first');
  const recent = remember(cur, ctx);
  const avoid = [...new Set([trackId, ...(recent?.envId === env ? recent.tracks : (ctx.config?.recent?.[env] ?? []))])];
  return {
    state: { ...base, envId: env, tracks: ctx.envTracks(env), seed: newSeed(), lead: trackId, avoid, playing: true, anchorAt: ctx.at ?? now(), anchorPos: 0, rev: base.rev + 1 },
    recent,
  };
}

export function skip(cur: JukeboxState | undefined, ctx: ActionContext): Change | null {
  if (!cur?.envId) return null;
  const head = currentTrack(cur, ctx);
  if (!head) return null;
  return {
    state: { ...cur, playing: true, anchorAt: ctx.at ?? now(), anchorPos: head.start + head.length + 0.01, rev: cur.rev + 1 },
    recent: remember(cur, ctx),
  };
}

export function pause(cur: JukeboxState | undefined, ctx: ActionContext): Change | null {
  if (!cur?.envId || !cur.playing) return null;
  const at = ctx.at ?? now();
  return { state: { ...cur, playing: false, anchorPos: positionAt(cur, at), anchorAt: at, rev: cur.rev + 1 } };
}

export function resume(cur: JukeboxState | undefined, ctx: ActionContext): Change | null {
  if (!cur?.envId || cur.playing) return null;
  return { state: { ...cur, playing: true, anchorAt: ctx.at ?? now(), rev: cur.rev + 1 } };
}

export function stop(cur: JukeboxState | undefined, ctx: ActionContext): Change | null {
  if (!cur?.envId) return null;
  return { state: { ...cur, envId: null, playing: false, lead: null, rev: cur.rev + 1 }, recent: remember(cur, ctx) };
}

/**
 * After the DM edits the environment that's playing: take the new track list, keeping the current
 * track going where it is (it becomes the first of a new order, so nothing audibly changes).
 */
export function refreshTracks(cur: JukeboxState | undefined, ctx: ActionContext): Change | null {
  if (!cur?.envId) return null;
  const tracks = ctx.envTracks(cur.envId);
  const head = currentTrack(cur, ctx);
  if (!head || !cur.playing) return { state: { ...cur, tracks, seed: newSeed(), lead: null, anchorPos: 0 } };
  return {
    state: { ...cur, tracks, seed: newSeed(), lead: head.trackId, avoid: [...new Set([head.trackId, ...(cur.avoid ?? [])])], anchorAt: ctx.at ?? now(), anchorPos: head.offset },
  };
}
