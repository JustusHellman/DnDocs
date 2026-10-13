/**
 * Plays the jukebox on this device: one <audio> element per track, faded in and out with Web
 * Audio gain nodes (or the element's own volume for links that don't allow cross-origin use).
 * Knows nothing about Firestore; the JukeboxProvider tells it what should be playing.
 */

export interface PlayTarget {
  /** Identifies this play of a track (see SlotInfo.key). */
  key: string;
  url: string;
  cors: boolean;
  /** Seconds into the track right now. */
  offset: number;
  fadeMs: number;
  title?: string;
  artist?: string;
}

interface Voice {
  key: string;
  url: string;
  el: HTMLAudioElement;
  gain: GainNode | null;
  source: MediaElementAudioSourceNode | null;
  /** Fallback fading with element.volume. */
  level: number;
  timer: ReturnType<typeof setInterval> | null;
  dying: boolean;
}

/** Seconds of drift tolerated before re-seeking (a seek is audible, so not too eager). */
const MAX_DRIFT = 1.5;

export class JukeboxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Music goes through here, so it can dip while a stinger plays. */
  private musicBus: GainNode | null = null;
  private stings = 0;
  private voices: Voice[] = [];
  private preloaded: HTMLAudioElement | null = null;
  private volume = 0.7;
  private muted = false;
  private listeners = new Set<() => void>();
  /** The browser refuses to play until the user clicks or taps somewhere. */
  blocked = false;
  /** Called when a track nears its end or ends (timers are throttled in background tabs). */
  onTick: (() => void) | null = null;

  private cleanup: () => void;

  constructor() {
    const unlock = () => this.unlock();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    this.cleanup = () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  get currentKey() {
    return this.voices.filter((v) => !v.dying).at(-1)?.key ?? null;
  }

  /** Perceived loudness → gain. */
  private get masterLevel() {
    return this.muted ? 0 : this.volume * this.volume;
  }

  setVolume(volume: number, muted: boolean) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.masterLevel, this.ctx.currentTime, 0.05);
    for (const v of this.voices) if (!v.gain) v.el.volume = Math.min(1, v.level * this.masterLevel);
  }

  private ensureContext() {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterLevel;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    return this.ctx;
  }

  /** Called on any click/tap/key: browsers only start audio after the user did something. */
  unlock() {
    if (!this.blocked && !this.voices.length) return;
    const ctx = this.ensureContext();
    const tasks: Promise<unknown>[] = [];
    if (ctx && ctx.state !== 'running') tasks.push(ctx.resume());
    for (const v of this.voices) if (!v.dying && v.el.paused && v.el.src) tasks.push(v.el.play());
    Promise.all(tasks)
      .then(() => this.setBlocked(false))
      .catch(() => undefined);
  }

  private setBlocked(b: boolean) {
    if (this.blocked === b) return;
    this.blocked = b;
    this.emit();
  }

  /** Make `target` the track that plays (crossfading from whatever played before). */
  play(target: PlayTarget) {
    const current = this.voices.filter((v) => !v.dying).at(-1);
    // Same file at about the same spot (e.g. the DM refreshed the track list): keep it going.
    if (
      current &&
      current.key !== target.key &&
      current.url === target.url &&
      !current.el.paused &&
      Math.abs(current.el.currentTime - target.offset) < MAX_DRIFT
    ) {
      current.key = target.key;
    }
    if (current && current.key === target.key) {
      this.fadeTo(current, 1, target.fadeMs);
      if (current.el.readyState >= 1 && !current.el.seeking && Math.abs(current.el.currentTime - target.offset) > MAX_DRIFT) {
        current.el.currentTime = target.offset;
      }
      if (current.el.paused) this.start(current);
      return;
    }
    for (const v of this.voices) if (!v.dying) this.retire(v, target.fadeMs);
    this.voices.push(this.createVoice(target));
    this.mediaSession(target);
    this.emit();
  }

  /** Fade everything out. */
  stop(fadeMs: number) {
    let changed = false;
    for (const v of this.voices) {
      if (!v.dying) {
        this.retire(v, fadeMs);
        changed = true;
      }
    }
    if (changed) {
      this.mediaSession(null);
      this.emit();
    }
  }

  /** Play a one-shot sound over the music (which dips while it plays). */
  playSting(url: string, cors: boolean) {
    const ctx = cors ? this.ensureContext() : null;
    const el = new Audio();
    if (cors) el.crossOrigin = 'anonymous';
    let source: MediaElementAudioSourceNode | null = null;
    if (ctx && this.master) {
      try {
        source = ctx.createMediaElementSource(el);
        source.connect(this.master);
      } catch {
        source = null;
      }
    }
    if (!source) el.volume = Math.min(1, this.masterLevel);
    const duck = (to: number, secs: number) => {
      if (!this.musicBus || !this.ctx) return;
      const g = this.musicBus.gain,
        now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(to, now + secs);
    };
    this.stings++;
    duck(0.3, 0.25);
    const done = () => {
      el.onended = el.onerror = null;
      if (--this.stings <= 0) {
        this.stings = 0;
        duck(1, 1.2);
      }
      try {
        source?.disconnect();
      } catch {
        /* gone */
      }
      el.removeAttribute('src');
    };
    el.onended = done;
    el.onerror = done;
    el.src = url;
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    el.play().catch(done);
  }

  /** Warm the browser cache for the next track. */
  preload(url: string, cors: boolean) {
    if (this.preloaded?.dataset.url === url) return;
    const a = new Audio();
    if (cors) a.crossOrigin = 'anonymous';
    a.preload = 'auto';
    a.muted = true;
    a.dataset.url = url;
    a.src = url;
    this.preloaded = a;
  }

  dispose() {
    this.cleanup();
    for (const v of [...this.voices]) this.kill(v);
    this.voices = [];
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.listeners.clear();
  }

  // ------------------------------------------------------------------ voices

  private createVoice(t: PlayTarget): Voice {
    const el = new Audio();
    el.preload = 'auto';
    if (t.cors) el.crossOrigin = 'anonymous';
    const voice: Voice = { key: t.key, url: t.url, el, gain: null, source: null, level: 0, timer: null, dying: false };
    const ctx = t.cors ? this.ensureContext() : null;
    if (ctx && this.master) {
      try {
        voice.source = ctx.createMediaElementSource(el);
        voice.gain = ctx.createGain();
        voice.gain.gain.value = 0;
        voice.source.connect(voice.gain).connect(this.musicBus ?? this.master);
      } catch {
        voice.source = null;
        voice.gain = null;
      }
    }
    if (!voice.gain) el.volume = 0;

    const requested = performance.now();
    el.addEventListener(
      'loadedmetadata',
      () => {
        const offset = t.offset + (performance.now() - requested) / 1000;
        if (offset > 0.3 && offset < el.duration - 0.5) el.currentTime = offset;
      },
      { once: true },
    );
    el.addEventListener('timeupdate', () => {
      if (!voice.dying && el.duration - el.currentTime < 5) this.onTick?.();
    });
    el.addEventListener('ended', () => {
      if (!voice.dying) this.onTick?.();
      this.kill(voice);
    });
    el.addEventListener('error', () => {
      if (!voice.dying) console.warn('[jukebox] could not play', t.url, el.error?.message);
    });
    el.src = t.url;
    this.start(voice);
    this.fadeTo(voice, 1, t.fadeMs);
    return voice;
  }

  private start(v: Voice) {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    v.el
      .play()
      .then(() => {
        if (!this.ctx || this.ctx.state === 'running' || !v.gain) this.setBlocked(false);
        else this.setBlocked(true);
      })
      .catch((err: DOMException) => {
        if (err?.name === 'NotAllowedError') this.setBlocked(true);
      });
  }

  private fadeTo(v: Voice, level: number, ms: number) {
    const secs = Math.max(0.02, ms / 1000);
    if (v.gain && this.ctx) {
      const g = v.gain.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(level, now + secs);
      v.level = level;
      return;
    }
    if (v.timer) clearInterval(v.timer);
    const from = v.level;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      v.level = from + (level - from) * k;
      try {
        v.el.volume = Math.min(1, Math.max(0, v.level * this.masterLevel));
      } catch {
        /* iOS: volume is read-only for plain elements */
      }
      if (k >= 1 && v.timer) {
        clearInterval(v.timer);
        v.timer = null;
      }
    };
    step();
    v.timer = setInterval(step, 50);
  }

  private retire(v: Voice, fadeMs: number) {
    v.dying = true;
    this.fadeTo(v, 0, fadeMs);
    setTimeout(() => this.kill(v), fadeMs + 150);
  }

  private kill(v: Voice) {
    if (v.timer) clearInterval(v.timer);
    v.timer = null;
    v.dying = true;
    v.el.pause();
    v.el.removeAttribute('src');
    v.el.load();
    try {
      v.source?.disconnect();
      v.gain?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.voices = this.voices.filter((x) => x !== v);
  }

  private mediaSession(t: PlayTarget | null) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = t ? new MediaMetadata({ title: t.title ?? 'Jukebox', artist: t.artist ?? '', album: 'DnDocs jukebox' }) : null;
    } catch {
      /* not supported */
    }
  }
}
