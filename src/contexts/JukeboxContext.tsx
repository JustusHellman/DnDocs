import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { logError } from '../lib/errors';
import { durationsOf, editKey, levelTracks, loadLibrary, mergeCatalog, startsFor, type MergedCatalog } from '../lib/jukebox/catalog';
import { JukeboxEngine } from '../lib/jukebox/engine';
import { BLEND, buildSequence, positionAt, type Playhead, type SlotInfo } from '../lib/jukebox/schedule';
import * as act from '../lib/jukebox/actions';
import { applyChange, jukeboxDoc, patchConfig, removed, setFade } from '../lib/jukebox/service';
import type { JukeboxConfig, JukeboxDoc, JukeboxEnvironment, JukeboxLevel, JukeboxState, JukeboxTrack, LibraryCatalog } from '../lib/jukebox/types';

interface JukeboxApi {
  /** The library could be loaded (false while loading or when it failed). */
  ready: boolean;
  libraryError: string | null;
  catalog: MergedCatalog;
  config: JukeboxConfig;
  state: JukeboxState | null;
  environment: JukeboxEnvironment | null;
  /** Calm, Tense or Danger (environments with levels). */
  level: JukeboxLevel;
  /** What plays right now, and how far in. */
  now: (Playhead & { track: JukeboxTrack }) | null;
  upNext: (SlotInfo & { track: JukeboxTrack })[];
  /** The browser waits for a click before it plays sound. */
  blocked: boolean;
  volume: number;
  muted: boolean;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  // DM only
  playEnvironment: (envId: string, level?: JukeboxLevel) => void;
  setLevel: (level: JukeboxLevel) => void;
  playTrack: (trackId: string, envId?: string | null, level?: JukeboxLevel) => void;
  /** Fire a stinger (everyone hears it once, over the music). */
  fireSting: (stingerId: string) => void;
  /** Take the playing track out of this environment (for this campaign) and go to the next one. */
  markMisfit: () => void;
  /** The DM's changes to library environments, as a review file for the library repo. */
  libraryChanges: () => {
    version: 1;
    source: string;
    createdAt: string;
    changes: { action: 'add' | 'remove'; env: string; track: string; level?: JukeboxLevel }[];
  };
  skip: () => void;
  togglePause: () => void;
  stop: () => void;
  setFadeMs: (ms: number) => void;
  /** Save a config change; if it touched the playing environment, pick up its new tracks. */
  saveConfig: (patch: Parameters<typeof patchConfig>[2], touchesEnv?: string) => Promise<void>;
}

const Ctx = createContext<JukeboxApi | null>(null);

function readNumber(key: string, fallback: number) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : Number(v);
  } catch {
    return fallback;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * The jukebox for the whole campaign: listens to jukebox/{campaignId} and plays along on this
 * device, so everyone hears the same music at (about) the same moment.
 */
export function JukeboxProvider({ children }: { children: ReactNode }) {
  const { currentCampaign, user, isDM } = useAuth();
  const toast = useToast();
  const campaignId = currentCampaign?.id;
  const [library, setLibrary] = useState<LibraryCatalog | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [docData, setDocData] = useState<JukeboxDoc | null>(null);
  const [volume, setVolumeState] = useState(() => readNumber('jukebox:volume', 0.6));
  const [muted, setMutedState] = useState(() => readNumber('jukebox:muted', 0) === 1);
  const [blocked, setBlocked] = useState(false);
  const [clock, setClock] = useState(0);
  const engineRef = useRef<JukeboxEngine | null>(null);
  const lastRev = useRef<number | null>(null);

  // Library: only once there's music to play or a DM to pick it (players who never hear music skip the download).
  const wantLibrary = isDM || !!docData?.state?.envId;
  useEffect(() => {
    if (!wantLibrary || library) return;
    let alive = true;
    loadLibrary()
      .then((cat) => alive && (setLibrary(cat), setLibraryError(null)))
      .catch((err) => {
        logError('Jukebox library', err);
        if (alive) setLibraryError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, [wantLibrary, library]);

  useEffect(() => {
    act.measureClockSkew();
  }, []);

  // The shared document.
  useEffect(() => {
    setDocData(null);
    if (!campaignId) return;
    return onSnapshot(
      jukeboxDoc(campaignId),
      (snap) => setDocData(snap.exists() ? (snap.data() as JukeboxDoc) : null),
      (err) => logError('Jukebox listener', err),
    );
  }, [campaignId]);

  const config = useMemo(() => docData?.config ?? {}, [docData?.config]);
  const catalog = useMemo(() => mergeCatalog(library, config), [library, config]);
  const durations = useMemo(() => durationsOf(catalog.tracks), [catalog.tracks]);
  const state = docData?.state?.envId !== undefined ? (docData.state as JukeboxState) : null;
  const findEnv = useCallback((envId: string) => catalog.environments.concat(catalog.hidden).find((e) => e.id === envId) ?? null, [catalog]);
  const envTracks = useCallback((envId: string, level?: JukeboxLevel) => levelTracks(findEnv(envId), level), [findEnv]);
  const starts = useCallback((envId: string) => startsFor(findEnv(envId), catalog.tracks), [findEnv, catalog.tracks]);

  const sequence = useMemo(() => {
    if (!state?.envId) return null;
    return buildSequence(state, state.tracks ?? envTracks(state.envId, state.level), durations, starts(state.envId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.envId, state?.level, state?.seed, state?.lead, state?.avoid?.join(), state?.tracks?.join(), durations, envTracks, starts]);

  // The engine lives as long as the campaign is open.
  useEffect(() => {
    const engine = new JukeboxEngine();
    engineRef.current = engine;
    const unsub = engine.subscribe(() => setBlocked(engine.blocked));
    return () => {
      unsub();
      engine.dispose();
      engineRef.current = null;
      lastRev.current = null;
    };
  }, [campaignId]);

  useEffect(() => {
    engineRef.current?.setVolume(volume, muted);
  }, [volume, muted]);

  /** Make this device play what the shared state says. */
  const sync = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const st = state;
    const changed = lastRev.current !== null && st && lastRev.current !== st.rev;
    const fade = st?.fadeMs ?? act.DEFAULT_FADE_MS;
    if (!st || !st.envId || !st.playing || !sequence || !library) {
      engine.stop(fade);
      if (st) lastRev.current = st.rev;
      return;
    }
    const head = sequence.at(positionAt(st, act.now()));
    const track = head ? catalog.tracks[head.trackId] : null;
    if (!head || !track || head.offset > head.duration - 0.3) {
      engine.stop(fade);
      lastRev.current = st.rev;
      return;
    }
    // DM changes use the DM's fade; joining fades in gently; track-to-track uses the blend.
    const fadeMs = lastRev.current === null ? 1500 : changed ? fade : BLEND * 1000;
    engine.play({ key: head.key, url: track.url, cors: track.cors, offset: head.offset, fadeMs, title: track.title, artist: track.artist });
    lastRev.current = st.rev;
    if (head.length - head.offset < 30) {
      const next = sequence.upcoming(positionAt(st, act.now()), 1)[0];
      const nt = next && catalog.tracks[next.trackId];
      if (nt) engine.preload(nt.url, nt.cors);
    }
  }, [state, sequence, library, catalog.tracks]);

  // Re-sync on every change and once a second (cheap), plus when a track nears its end.
  useEffect(() => {
    sync();
    const engine = engineRef.current;
    if (engine) engine.onTick = sync;
    const id = window.setInterval(() => {
      sync();
      if (state?.envId) setClock((c) => c + 1); // progress bars
    }, 1000);
    const onVisible = () => document.visibilityState === 'visible' && sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync, state?.envId]);

  const nowPlaying = useMemo(() => {
    if (!state?.envId || !sequence) return null;
    const head = sequence.at(positionAt(state, act.now()));
    const track = head && catalog.tracks[head.trackId];
    return head && track ? { ...head, track } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sequence, catalog.tracks, clock]);

  const upNext = useMemo(() => {
    if (!state?.envId || !sequence) return [];
    return sequence
      .upcoming(positionAt(state, act.now()), 5)
      .map((s) => ({ ...s, track: catalog.tracks[s.trackId] }))
      .filter((s) => s.track);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sequence, catalog.tracks, nowPlaying?.key]);

  // ------------------------------------------------------------------ DM actions
  const ctx = useCallback((): act.ActionContext => ({ envTracks, starts, durations, config }), [envTracks, starts, durations, config]);
  const commit = useCallback(
    (change: act.Change | null) => {
      if (!change || !campaignId || !user || !isDM) return;
      engineRef.current?.unlock();
      applyChange(campaignId, user.uid, change).catch((err) => toast.error(err, 'Jukebox'));
    },
    [campaignId, user, isDM, toast],
  );

  const api: JukeboxApi = {
    ready: !!library,
    libraryError,
    catalog,
    config,
    state,
    environment: state?.envId ? findEnv(state.envId) : null,
    level: state?.level ?? 'calm',
    now: nowPlaying,
    upNext,
    blocked: blocked && !!nowPlaying,
    volume,
    muted,
    setVolume: (v) => {
      setVolumeState(v);
      store('jukebox:volume', String(v));
      if (v > 0 && muted) {
        setMutedState(false);
        store('jukebox:muted', '0');
      }
    },
    setMuted: (m) => {
      setMutedState(m);
      store('jukebox:muted', m ? '1' : '0');
    },
    playEnvironment: (envId, level) => {
      if (!envTracks(envId, level).some((id) => durations[id] > 0)) {
        toast.show('That environment has no tracks yet.');
        return;
      }
      commit(act.playEnvironment(state ?? undefined, envId, ctx(), { level }));
    },
    setLevel: (level) => commit(act.setLevel(state ?? undefined, level, ctx())),
    playTrack: (trackId, envId, level) => {
      try {
        commit(act.playTrack(state ?? undefined, trackId, envId ?? null, ctx(), level));
      } catch (err) {
        toast.error(err);
      }
    },
    fireSting: (stingerId) => {
      const s = catalog.stingers.find((x) => x.id === stingerId);
      if (!s?.tracks.length) return;
      const track = s.tracks[Math.floor(Math.random() * s.tracks.length)];
      commit(act.sting(state ?? undefined, s.id, track, {}));
    },
    markMisfit: () => {
      const env = state?.envId ? findEnv(state.envId) : null;
      const trackId = nowPlaying?.trackId;
      if (!state || !env || !trackId || !campaignId || !user || !isDM) return;
      const level = state.level ?? 'calm';
      const remaining = (state.tracks ?? envTracks(env.id, level)).filter((id) => id !== trackId);
      const { patch, undo } = misfitPatch(env, level, trackId, config);
      // Go on with the rest right away (the removal is saved alongside).
      if (remaining.some((id) => durations[id] > 0)) {
        commit(act.playEnvironment(state, env.id, { ...ctx(), envTracks: () => remaining }, { level }));
      } else commit(act.stop(state, ctx()));
      const title = catalog.tracks[trackId]?.title ?? 'That track';
      patchConfig(campaignId, user.uid, patch)
        .then(() =>
          toast.show(`“${title}” won't play in ${env.name} any more.`, {
            action: { label: 'Undo', onClick: () => patchConfig(campaignId, user.uid, undo).catch((err) => toast.error(err, 'Jukebox')) },
          }),
        )
        .catch((err) => toast.error(err, 'Jukebox'));
    },
    libraryChanges: () => {
      const changes: ReturnType<JukeboxApi['libraryChanges']>['changes'] = [];
      const libraryIds = new Set((library?.environments ?? []).map((e) => e.id));
      for (const [key, edit] of Object.entries(config.envEdits ?? {})) {
        const [env, lv] = key.split('~') as [string, JukeboxLevel | undefined];
        if (!libraryIds.has(env)) continue;
        for (const track of edit.remove ?? []) changes.push({ action: 'remove', env, track, ...(lv ? { level: lv } : {}) });
        for (const track of edit.add ?? []) if (!catalog.tracks[track]?.custom) changes.push({ action: 'add', env, track, ...(lv ? { level: lv } : {}) });
      }
      return { version: 1, source: 'DnDocs', createdAt: new Date().toISOString(), changes };
    },
    skip: () => commit(act.skip(state ?? undefined, ctx())),
    togglePause: () => commit(state?.playing ? act.pause(state, ctx()) : act.resume(state ?? undefined, ctx())),
    stop: () => commit(act.stop(state ?? undefined, ctx())),
    setFadeMs: (ms) => {
      if (campaignId && user && isDM) setFade(campaignId, user.uid, ms).catch((err) => toast.error(err, 'Jukebox'));
    },
    saveConfig: async (patch, touchesEnv) => {
      if (!campaignId || !user || !isDM) return;
      try {
        await patchConfig(campaignId, user.uid, patch);
      } catch (err) {
        toast.error(err, 'Jukebox');
        throw err;
      }
      if (touchesEnv && state?.envId === touchesEnv) pendingRefresh.current = touchesEnv;
    },
  };

  // Stingers: play each one once, when it's fresh (not old ones found when opening the campaign).
  const lastSting = useRef<number | null>(null);
  useEffect(() => {
    const sting = state?.sting;
    if (!sting || !library) return;
    const first = lastSting.current === null;
    if (lastSting.current === sting.n) return;
    lastSting.current = sting.n;
    const age = act.now() - sting.at;
    if (age > (first ? 4000 : 10000)) return;
    const t = catalog.tracks[sting.track];
    if (t) engineRef.current?.playSting(t.url, t.cors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.sting?.n, library]);

  // After an edit to the playing environment, re-read its tracks once the new config has arrived.
  const pendingRefresh = useRef<string | null>(null);
  useEffect(() => {
    const envId = pendingRefresh.current;
    if (!envId || state?.envId !== envId) return;
    pendingRefresh.current = null;
    commit(act.refreshTracks(state, ctx()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** The config change that takes a track out of an environment's list, and the one that puts it back. */
function misfitPatch(env: JukeboxEnvironment, level: JukeboxLevel, trackId: string, config: JukeboxConfig) {
  if (env.custom) {
    const stored = config.customEnvs?.[env.id];
    if (!stored) return { patch: {}, undo: {} };
    return {
      patch: { customEnvs: { [env.id]: { ...stored, tracks: stored.tracks.filter((id) => id !== trackId) } } },
      undo: { customEnvs: { [env.id]: stored } },
    };
  }
  const key = editKey(env.id, level);
  const edit = config.envEdits?.[key];
  const wasAdded = !!edit?.add?.includes(trackId);
  // A track the DM added themselves just leaves the add list; one from the library goes on the remove list.
  const next = wasAdded
    ? { add: edit!.add!.filter((id) => id !== trackId), remove: edit?.remove ?? [] }
    : { add: edit?.add ?? [], remove: [...new Set([...(edit?.remove ?? []), trackId])] };
  return { patch: { envEdits: { [key]: next } }, undo: { envEdits: { [key]: edit ?? removed() } } };
}

export function useJukebox() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useJukebox outside JukeboxProvider');
  return v;
}
