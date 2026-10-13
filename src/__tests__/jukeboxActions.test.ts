import { describe, expect, it } from 'vitest';
import * as act from '../lib/jukebox/actions';
import { mergeCatalog } from '../lib/jukebox/catalog';
import type { LibraryCatalog } from '../lib/jukebox/types';

const durations = { a: 100, b: 200, c: 150, d: 120, x: 60 };
const envs: Record<string, string[]> = { tavern: ['a', 'b', 'c'], fight: ['d', 'x'] };
const ctx = (at: number, config = {}): act.ActionContext => ({ envTracks: (id) => envs[id] ?? [], durations, config, at });

describe('jukebox actions', () => {
  it('starts an environment from the top, with its track list frozen in', () => {
    const { state } = act.playEnvironment(undefined, 'tavern', ctx(1000));
    expect(state).toMatchObject({ envId: 'tavern', tracks: ['a', 'b', 'c'], playing: true, anchorAt: 1000, anchorPos: 0, rev: 1 });
    expect(act.currentTrack(state, ctx(1000))!.offset).toBe(0);
  });

  it('skips to the very start of the next track', () => {
    const { state } = act.playEnvironment(undefined, 'tavern', ctx(0));
    const first = act.currentTrack(state, ctx(10_000))!;
    const next = act.skip(state, ctx(10_000))!;
    const head = act.currentTrack(next.state, ctx(10_000))!;
    expect(head.trackId).not.toBe(first.trackId);
    expect(head.offset).toBeLessThan(0.1);
    expect(next.state.rev).toBe(state.rev + 1);
    expect(next.recent).toEqual({ envId: 'tavern', tracks: [first.trackId] });
  });

  it('pauses and resumes where it was', () => {
    const { state } = act.playEnvironment(undefined, 'tavern', ctx(0));
    const paused = act.pause(state, ctx(30_000))!.state;
    expect(paused.playing).toBe(false);
    expect(act.currentTrack(paused, ctx(90_000))!.offset).toBeCloseTo(30);
    const resumed = act.resume(paused, ctx(90_000))!.state;
    expect(act.currentTrack(resumed, ctx(95_000))!.offset).toBeCloseTo(35);
  });

  it('plays a picked track first, and remembers what played when switching', () => {
    const tavern = act.playEnvironment(undefined, 'tavern', ctx(0)).state;
    const playing = act.currentTrack(tavern, ctx(5000))!.trackId;
    const change = act.playTrack(tavern, 'x', 'fight', ctx(5000));
    expect(change.state.envId).toBe('fight');
    expect(act.currentTrack(change.state, ctx(5000))!.trackId).toBe('x');
    expect(change.recent).toEqual({ envId: 'tavern', tracks: [playing] });
  });

  it('keeps the current track playing when the DM edits the environment', () => {
    const { state } = act.playEnvironment(undefined, 'tavern', ctx(0));
    const before = act.currentTrack(state, ctx(20_000))!;
    envs.tavern = ['a', 'b', 'c', 'd'];
    const after = act.refreshTracks(state, ctx(20_000))!.state;
    const head = act.currentTrack(after, ctx(20_000))!;
    expect(head.trackId).toBe(before.trackId);
    expect(head.offset).toBeCloseTo(before.offset);
    expect(after.tracks).toEqual(['a', 'b', 'c', 'd']);
    envs.tavern = ['a', 'b', 'c'];
  });

  it('stops', () => {
    const { state } = act.playEnvironment(undefined, 'tavern', ctx(0));
    expect(act.stop(state, ctx(1000))!.state.envId).toBe(null);
    expect(act.stop({ ...state, envId: null }, ctx(1000))).toBe(null);
  });
});

describe('jukebox catalog', () => {
  const library: LibraryCatalog = {
    version: 1,
    environments: [
      { id: 'tavern', name: 'Tavern', emoji: '🍺', tracks: ['a', 'b'] },
      { id: 'boss', name: 'Boss', tracks: ['b'] },
    ],
    tracks: {
      a: { title: 'A', artist: 'Kevin MacLeod', file: 'audio/a.m4a', duration: 100 },
      b: { title: 'B', artist: 'Kevin MacLeod', file: 'audio/b.m4a', duration: 90 },
    },
  };
  it('merges the DM’s own environments, edits and hidden ones', () => {
    const m = mergeCatalog(
      library,
      {
        customTracks: { t1: { title: 'Mine', url: 'https://elsewhere.example/song.mp3', duration: 60 } },
        customEnvs: { e1: { name: 'Lair', emoji: '🐉', tracks: ['t1', 'a', 'gone'] } },
        envEdits: { tavern: { add: ['t1'], remove: ['a'] } },
        hiddenEnvs: ['boss'],
      },
      'https://lib.example/Jukebox/',
    );
    expect(m.environments.map((e) => e.id)).toEqual(['e1', 'tavern']);
    expect(m.environments[0].tracks).toEqual(['t1', 'a']);
    expect(m.environments[1].tracks).toEqual(['b', 't1']);
    expect(m.hidden.map((e) => e.id)).toEqual(['boss']);
    expect(m.tracks.a.url).toBe('https://lib.example/Jukebox/audio/a.m4a');
    expect(m.tracks.a.cors).toBe(true);
    expect(m.tracks.t1).toMatchObject({ custom: true, cors: false, artist: 'Unknown' });
  });
});
