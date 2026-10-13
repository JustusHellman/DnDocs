/** A track as the jukebox plays it (from the music library or added by the DM). */
export interface JukeboxTrack {
  id: string;
  title: string;
  artist: string;
  license?: string;
  licenseUrl?: string;
  sourceUrl?: string;
  /** Absolute URL of the audio file. */
  url: string;
  /** Length in seconds (0 = unknown; such tracks can't be scheduled). */
  duration: number;
  /** The file allows cross-origin reading, so it can go through Web Audio (smooth fades everywhere). */
  cors: boolean;
  /** Added by the DM in this campaign (not part of the shared library). */
  custom?: boolean;
  feel?: string;
}

export interface JukeboxEnvironment {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tracks: string[];
  custom?: boolean;
}

/** catalog.json as published by the DnDJukebox site. */
export interface LibraryCatalog {
  version: number;
  generatedAt?: string;
  environments: { id: string; name: string; emoji?: string; description?: string; tracks: string[] }[];
  tracks: Record<string, { title: string; artist: string; license?: string; licenseUrl?: string; sourceUrl?: string; feel?: string; file: string; duration: number }>;
}

/**
 * What is playing, shared through Firestore (jukebox/{campaignId}.state). Every device works out
 * the current track and position from this alone, so nothing has to be written when one track
 * ends and the next begins, and the music keeps going when the DM's device sleeps.
 */
export interface JukeboxState {
  /** null = no music. */
  envId: string | null;
  /** The environment's tracks when it was picked (later edits apply from the next pick or refresh). */
  tracks?: string[];
  /** Shuffles the environment's tracks (a new seed = a new order). */
  seed: number;
  /** Track to play first (the DM picked it), before the shuffled ones. */
  lead?: string | null;
  /** Tracks played recently in this environment; they go to the back of the first round. */
  avoid?: string[];
  playing: boolean;
  /** Wall-clock time (ms) at which the sequence was at anchorPos seconds. */
  anchorAt: number;
  anchorPos: number;
  /** Fade length for DM changes (environment, skip, pause, stop). */
  fadeMs: number;
  /** Bumped on every DM change, so devices know to use fadeMs instead of the track-to-track blend. */
  rev: number;
}

/** The DM's own environments and tracks, and changes to the library's (jukebox/{campaignId}.config). */
export interface JukeboxConfig {
  customTracks?: Record<string, { title: string; artist?: string; url: string; duration: number; license?: string; sourceUrl?: string }>;
  customEnvs?: Record<string, { name: string; emoji: string; description?: string; tracks: string[]; order?: number }>;
  /** Tracks added to / removed from the library's environments. */
  envEdits?: Record<string, { add?: string[]; remove?: string[] }>;
  hiddenEnvs?: string[];
  /** Recently played per environment (helps avoid repeats when coming back to it). */
  recent?: Record<string, string[]>;
}

export interface JukeboxDoc {
  campaignId: string;
  state?: JukeboxState;
  config?: JukeboxConfig;
  updatedAt?: number;
  updatedBy?: string;
}
