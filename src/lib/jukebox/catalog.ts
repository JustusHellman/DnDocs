/**
 * The music library (the DnDJukebox site, its own repo on GitHub Pages) merged with what the
 * DM added or changed in this campaign.
 */
import type { JukeboxConfig, JukeboxEnvironment, JukeboxLevel, JukeboxStinger, JukeboxTrack, LibraryCatalog } from './types';

/** Where the music library lives. On GitHub Pages it's the same site as DnDocs (…github.io/DnDJukebox/). */
export const JUKEBOX_URL: string = (import.meta.env.VITE_JUKEBOX_URL as string | undefined) || 'https://justushellman.github.io/DnDJukebox/';

/** This page's address (a stand-in outside the browser, e.g. in tests). */
const here = () => (typeof location !== 'undefined' ? location.href : 'http://localhost/');
const base = () => new URL(JUKEBOX_URL, here());

let pending: Promise<LibraryCatalog> | null = null;

/** catalog.json from the library (fetched once per page load; falls back to the last copy offline). */
export function loadLibrary(): Promise<LibraryCatalog> {
  if (pending) return pending;
  const cacheKey = 'jukebox:catalog';
  pending = fetch(new URL('catalog.json', base()), { cache: 'no-cache' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`The music library answered ${res.status}`);
      const cat = (await res.json()) as LibraryCatalog;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cat));
      } catch {
        /* full or blocked: fine */
      }
      return cat;
    })
    .catch((err) => {
      pending = null;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached) as LibraryCatalog;
      } catch {
        /* ignore */
      }
      throw err;
    });
  return pending;
}

export function isCorsFriendly(url: string, libraryUrl = JUKEBOX_URL) {
  try {
    const u = new URL(url, here());
    return u.origin === new URL(libraryUrl, here()).origin || u.origin === new URL(here()).origin;
  } catch {
    return false;
  }
}

export interface MergedCatalog {
  tracks: Record<string, JukeboxTrack>;
  /** Environments to show (library + custom, minus hidden), in order. */
  environments: JukeboxEnvironment[];
  /** Library environments the DM hid. */
  hidden: JukeboxEnvironment[];
  stingers: JukeboxStinger[];
}

export const LEVELS: JukeboxLevel[] = ['calm', 'tense', 'danger'];
export const LEVEL_NAMES: Record<JukeboxLevel, string> = { calm: 'Calm', tense: 'Tense', danger: 'Danger' };

/** The key of an environment's track list in config.envEdits. */
export const editKey = (envId: string, level: JukeboxLevel = 'calm') => (level === 'calm' ? envId : `${envId}~${level}`);

/** The tracks of an environment at a level (falls back to Calm when it has no such list). */
export function levelTracks(env: JukeboxEnvironment | null | undefined, level: JukeboxLevel = 'calm') {
  if (!env) return [];
  return level !== 'calm' && env.levels?.[level]?.length ? env.levels[level]! : env.tracks;
}

/** Seconds to skip at the start of each track, for environments that start at the hit. */
export function startsFor(env: JukeboxEnvironment | null | undefined, tracks: Record<string, JukeboxTrack>) {
  const out: Record<string, number> = {};
  if (!env?.hitStart) return out;
  for (const id of [...env.tracks, ...Object.values(env.levels ?? {}).flat()]) {
    const t = tracks[id];
    if (t?.cue && t.cue < t.duration - 20) out[id] = t.cue;
  }
  return out;
}

export function mergeCatalog(library: LibraryCatalog | null, config: JukeboxConfig | undefined, libraryUrl = JUKEBOX_URL): MergedCatalog {
  const tracks: Record<string, JukeboxTrack> = {};
  const root = new URL(libraryUrl, here());
  for (const [id, t] of Object.entries(library?.tracks ?? {})) {
    tracks[id] = {
      id,
      title: t.title,
      artist: t.artist,
      license: t.license,
      licenseUrl: t.licenseUrl,
      sourceUrl: t.sourceUrl,
      feel: t.feel,
      url: new URL(t.file, root).toString(),
      duration: t.duration,
      cors: true,
      intensity: t.intensity,
      cue: t.cue,
    };
  }
  for (const [id, t] of Object.entries(config?.customTracks ?? {})) {
    tracks[id] = {
      id,
      title: t.title,
      artist: t.artist || 'Unknown',
      license: t.license,
      sourceUrl: t.sourceUrl,
      url: t.url,
      duration: t.duration,
      cors: isCorsFriendly(t.url, libraryUrl),
      custom: true,
    };
  }

  const hiddenIds = new Set(config?.hiddenEnvs ?? []);
  const known = (ids: string[]) => [...new Set(ids)].filter((id) => tracks[id]);
  const edited = (key: string, list: string[]) => {
    const edit = config?.envEdits?.[key];
    const removed = new Set(edit?.remove ?? []);
    return known([...list.filter((id) => !removed.has(id)), ...(edit?.add ?? [])]);
  };
  const fromLibrary: JukeboxEnvironment[] = (library?.environments ?? []).map((e) => {
    const levels: JukeboxEnvironment['levels'] = {};
    for (const l of ['tense', 'danger'] as const) {
      const list = edited(editKey(e.id, l), e.levels?.[l] ?? []);
      if (list.length) levels[l] = list;
    }
    return {
      id: e.id,
      name: e.name,
      emoji: e.emoji || '🎵',
      description: e.description ?? '',
      group: e.group ?? 'places',
      hitStart: e.hitStart || undefined,
      tracks: edited(e.id, e.tracks),
      ...(Object.keys(levels).length ? { levels } : {}),
    };
  });
  const custom: JukeboxEnvironment[] = Object.entries(config?.customEnvs ?? {})
    .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
    .map(([id, e]) => ({
      id,
      name: e.name,
      emoji: e.emoji || '🎵',
      description: e.description ?? '',
      group: 'custom' as const,
      hitStart: e.hitStart || undefined,
      tracks: known(e.tracks),
      custom: true,
    }));

  return {
    tracks,
    environments: [...custom, ...fromLibrary.filter((e) => !hiddenIds.has(e.id))],
    hidden: fromLibrary.filter((e) => hiddenIds.has(e.id)),
    stingers: (library?.stingers ?? [])
      .map((s) => ({ id: s.id, name: s.name, emoji: s.emoji || '🔔', tracks: known(s.tracks) }))
      .filter((s) => s.tracks.length),
  };
}

export function durationsOf(tracks: Record<string, JukeboxTrack>) {
  const out: Record<string, number> = {};
  for (const [id, t] of Object.entries(tracks)) out[id] = t.duration;
  return out;
}

/** "“Title” by Kevin MacLeod (incompetech.com) · CC BY 4.0" */
export function creditLine(t: Pick<JukeboxTrack, 'title' | 'artist' | 'license'>) {
  const by = t.artist === 'Kevin MacLeod' ? 'Kevin MacLeod (incompetech.com)' : t.artist;
  return `“${t.title}” by ${by}${t.license ? ` · ${t.license}` : ''}`;
}

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Reads a remote audio file's length (for tracks the DM adds by link). */
export function measureDuration(url: string, timeoutMs = 15000): Promise<number> {
  return new Promise((resolve, reject) => {
    const a = new Audio();
    a.preload = 'metadata';
    const done = (fn: () => void) => {
      clearTimeout(timer);
      a.onloadedmetadata = a.onerror = null;
      a.removeAttribute('src');
      a.load();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('The link took too long to answer'))), timeoutMs);
    a.onloadedmetadata = () =>
      Number.isFinite(a.duration) && a.duration > 0
        ? done(() => resolve(Math.round(a.duration * 100) / 100))
        : done(() => reject(new Error('Could not read the length of that file')));
    a.onerror = () => done(() => reject(new Error('That link is not an audio file the browser can play')));
    a.src = url;
  });
}
