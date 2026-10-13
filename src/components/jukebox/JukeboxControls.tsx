import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListMusic, Music, Pause, Play, SkipForward, Square, ThumbsDown, Volume1, Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useJukebox } from '../../contexts/JukeboxContext';
import { creditLine, formatTime, LEVEL_NAMES, LEVELS } from '../../lib/jukebox/catalog';
import type { EnvGroup, JukeboxEnvironment, JukeboxLevel } from '../../lib/jukebox/types';
import { Popover } from '../ui/Popover';
import { Segmented } from '../ui/bits';

export const FADES = [
  { value: '800', label: 'Quick' },
  { value: '3000', label: 'Smooth' },
  { value: '7000', label: 'Slow' },
] as const;

/** Volume + mute; every listener has their own (kept on this device). */
export function VolumeControl({ className }: { className?: string }) {
  const { volume, muted, setVolume, setMuted } = useJukebox();
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <button
        type="button"
        className="btn-icon-sm shrink-0"
        onClick={() => setMuted(!muted)}
        aria-label={muted ? 'Unmute music' : 'Mute music'}
        aria-pressed={muted}
      >
        <Icon size={18} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Music volume"
        className="h-2 w-full min-w-0 cursor-pointer accent-amber-500"
      />
    </div>
  );
}

/** Track title, credit and progress. */
export function NowPlaying({ large }: { large?: boolean }) {
  const { isDM } = useAuth();
  const { now, environment, state, ready, libraryError, level, markMisfit } = useJukebox();
  if (state?.envId && !ready) {
    return (
      <p className="text-sm text-stone-500 italic">{libraryError ? `The music library can't be reached (${libraryError}).` : 'Loading the music library…'}</p>
    );
  }
  if (!state?.envId || !now) {
    return <p className={clsx('text-stone-500 italic', large ? 'text-base' : 'text-sm')}>No music playing.</p>;
  }
  const pct = Math.min(100, (now.offset / now.duration) * 100);
  return (
    <div className="min-w-0">
      <div className={clsx('flex items-center gap-2 font-display font-semibold text-amber-300', large ? 'text-lg' : 'text-sm')}>
        <span aria-hidden>{environment?.emoji ?? '🎵'}</span>
        <span className="truncate">{environment?.name ?? 'Music'}</span>
        {level !== 'calm' && <LevelChip level={level} />}
        {!state.playing && <span className="chip text-stone-400 ring-stone-700">Paused</span>}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className={clsx('min-w-0 flex-1 truncate font-semibold text-stone-100', large ? 'text-xl' : 'text-[15px]')} title={now.track.title}>
          {now.track.title}
        </div>
        {isDM && (
          <button
            type="button"
            className="btn-icon-sm shrink-0"
            onClick={markMisfit}
            title="Doesn't fit here: take it out of this environment and play the next one"
            aria-label="Doesn't fit here"
          >
            <ThumbsDown size={15} />
          </button>
        )}
      </div>
      <div className="truncate text-xs text-stone-500" title={creditLine(now.track)}>
        {creditLine(now.track)}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] tabular-nums text-stone-500">
        <span>{formatTime(now.offset)}</span>
        <div
          className="h-1 flex-1 overflow-hidden rounded-full bg-stone-800"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Track progress"
        >
          <div className="h-full rounded-full bg-amber-500/80 transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <span>{formatTime(now.duration)}</span>
      </div>
    </div>
  );
}

/** Pause / skip / stop and the fade length (DM). */
export function TransportControls({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { state, togglePause, skip, stop, setFadeMs } = useJukebox();
  const active = !!state?.envId;
  const btn = size === 'md' ? 'btn btn-secondary' : 'btn btn-secondary btn-sm';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} disabled={!active} onClick={togglePause}>
        {state?.playing ? <Pause size={15} /> : <Play size={15} />}
        {state?.playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" className={btn} disabled={!active} onClick={skip}>
        <SkipForward size={15} /> Next
      </button>
      <button type="button" className={btn} disabled={!active} onClick={stop} aria-label="Stop the music">
        <Square size={14} /> Stop
      </button>
      <Segmented
        size="sm"
        className="ml-auto"
        options={FADES.map((f) => ({ value: f.value, label: f.label }))}
        value={(FADES.find((f) => Number(f.value) === state?.fadeMs)?.value ?? '3000') as (typeof FADES)[number]['value']}
        onChange={(v) => setFadeMs(Number(v))}
      />
    </div>
  );
}

function LevelChip({ level }: { level: JukeboxLevel }) {
  return <span className={clsx('chip', level === 'danger' ? 'text-rose-300 ring-rose-700/60' : 'text-amber-300 ring-amber-600/60')}>{LEVEL_NAMES[level]}</span>;
}

/** Calm / Tense / Danger for environments that have them (DM). */
export function LevelControl() {
  const { environment, level, setLevel } = useJukebox();
  if (!environment?.levels) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="label mb-0">Intensity</span>
      <Segmented
        size="sm"
        options={LEVELS.filter((l) => l === 'calm' || environment.levels?.[l]?.length).map((l) => ({ value: l, label: LEVEL_NAMES[l] }))}
        value={level}
        onChange={(v) => setLevel(v)}
      />
    </div>
  );
}

/** One-shot sounds over the music (DM). */
export function StingerButtons() {
  const { catalog, fireSting, ready } = useJukebox();
  if (!ready || !catalog.stingers.length) return null;
  return (
    <div>
      <div className="label">Stingers</div>
      <div className="flex flex-wrap gap-1.5">
        {catalog.stingers.map((s) => (
          <button
            key={s.id}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fireSting(s.id)}
            title={`Play a ${s.name.toLowerCase()} sting for everyone`}
          >
            <span aria-hidden>{s.emoji}</span> {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export const GROUP_NAMES: Record<EnvGroup, string> = { custom: 'Your environments', places: 'Places', action: 'Action', moods: 'Moods' };
export const GROUP_ORDER: EnvGroup[] = ['custom', 'places', 'action', 'moods'];

export function groupEnvironments(envs: JukeboxEnvironment[]) {
  return GROUP_ORDER.map((g) => ({ group: g, envs: envs.filter((e) => (e.group ?? 'places') === g) })).filter((x) => x.envs.length);
}

/** Environment buttons (DM: click to play). */
export function EnvironmentChips({ onPicked }: { onPicked?: () => void }) {
  const { catalog, state, playEnvironment, ready } = useJukebox();
  if (!ready) return null;
  return (
    <div className="space-y-2">
      {groupEnvironments(catalog.environments).map(({ group, envs }) => (
        <div key={group}>
          <div className="mb-1 text-[10px] font-bold tracking-[0.14em] text-stone-500 uppercase">{GROUP_NAMES[group]}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {envs.map((e) => {
              const active = state?.envId === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => (playEnvironment(e.id), onPicked?.())}
                  title={e.description}
                  className={clsx(
                    'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[13px] font-medium transition-colors',
                    active
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                      : 'border-stone-800 bg-stone-950/40 text-stone-300 hover:border-stone-600 hover:text-stone-50',
                  )}
                >
                  <span aria-hidden className="text-base leading-none">
                    {e.emoji}
                  </span>
                  <span className="truncate">{e.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Animated bars while music plays. */
function Equalizer() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] origin-bottom animate-eq rounded-sm bg-amber-400" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

/** The music button in the top bar, with a small panel. */
export function JukeboxButton() {
  const { isDM } = useAuth();
  const jb = useJukebox();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const playing = !!jb.now && !!jb.state?.playing;
  // Players only see the button once the DM has started music at some point.
  if (!isDM && !jb.state) return null;
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={clsx('btn-icon relative', playing && 'text-amber-300')}
        onClick={() => setOpen((o) => !o)}
        aria-label={playing ? `Music: ${jb.now?.track.title}` : 'Music'}
        title="Jukebox"
      >
        {playing && !jb.muted ? <Equalizer /> : jb.muted && playing ? <VolumeX size={19} /> : <Music size={19} />}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={340}>
        <div className="space-y-3 p-2">
          <NowPlaying />
          {isDM && <TransportControls />}
          {isDM && <LevelControl />}
          <VolumeControl />
          {isDM && <StingerButtons />}
          {isDM && (
            <div className="border-t border-stone-800 pt-3">
              <div className="label">Environment</div>
              <div className="max-h-64 overflow-y-auto pr-1">
                <EnvironmentChips />
              </div>
              {!jb.ready && (
                <p className="text-sm text-stone-500 italic">
                  {jb.libraryError ? `Music library unavailable: ${jb.libraryError}` : 'Loading the music library…'}
                </p>
              )}
            </div>
          )}
          <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => (setOpen(false), navigate('/music'))}>
            <ListMusic size={15} /> {isDM ? 'Open the jukebox' : 'Music & credits'}
          </button>
        </div>
      </Popover>
    </>
  );
}

/** Browsers stay silent until the user interacts with the page; this asks for that one tap. */
export function JukeboxBanner() {
  const { blocked, now } = useJukebox();
  if (!blocked || !now) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-amber-700/40 bg-amber-500/15 px-3 py-1.5 text-sm text-amber-100 sm:px-4">
      <Music size={16} className="shrink-0 text-amber-400" />
      <span className="min-w-0 flex-1 truncate">
        The DM is playing music: <strong>{now.track.title}</strong>
      </span>
      {/* Any click unlocks audio (the engine listens for it); the button is just the obvious place. */}
      <button type="button" className="btn btn-primary btn-sm">
        <Play size={14} /> Listen
      </button>
    </div>
  );
}
