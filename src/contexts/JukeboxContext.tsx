import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { logError } from '../lib/errors';
import { durationsOf, loadLibrary, mergeCatalog, type MergedCatalog } from '../lib/jukebox/catalog';
import { JukeboxEngine } from '../lib/jukebox/engine';
import { BLEND, buildSequence, positionAt, type Playhead, type SlotInfo } from '../lib/jukebox/schedule';
import * as act from '../lib/jukebox/actions';
import { applyChange, jukeboxDoc, patchConfig, setFade } from '../lib/jukebox/service';
import type { JukeboxConfig, JukeboxDoc, JukeboxEnvironment, JukeboxState, JukeboxTrack, LibraryCatalog } from '../lib/jukebox/types';

interface JukeboxApi {
  /** The library could be loaded (false while loading or when it failed). */
  ready: boolean;
  libraryError: string | null;
  catalog: MergedCatalog;
  config: JukeboxConfig;
  state: JukeboxState | null;
  environment: JukeboxEnvironment | null;
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
  playEnvironment: (envId: string) => void;
  playTrack: (trackId: string, envId?: string | null) => void;
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
  const envTracks = useCallback((envId: string) => catalog.environments.concat(catalog.hidden).find((e) => e.id === envId)?.tracks ?? [], [catalog]);

  const sequence = useMemo(() => {
    if (!state?.envId) return null;
    return buildSequence(state, state.tracks ?? envTracks(state.envId), durations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.envId, state?.seed, state?.lead, state?.avoid?.join(), state?.tracks?.join(), durations, envTracks]);

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
  const ctx = useCallback((): act.ActionContext => ({ envTracks, durations, config }), [envTracks, durations, config]);
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
    environment: state?.envId ? (catalog.environments.concat(catalog.hidden).find((e) => e.id === state.envId) ?? null) : null,
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
    playEnvironment: (envId) => {
      if (!envTracks(envId).some((id) => durations[id] > 0)) {
        toast.show('That environment has no tracks yet.');
        return;
      }
      commit(act.playEnvironment(state ?? undefined, envId, ctx()));
    },
    playTrack: (trackId, envId) => {
      try {
        commit(act.playTrack(state ?? undefined, trackId, envId ?? null, ctx()));
      } catch (err) {
        toast.error(err);
      }
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

export function useJukebox() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useJukebox outside JukeboxProvider');
  return v;
}
