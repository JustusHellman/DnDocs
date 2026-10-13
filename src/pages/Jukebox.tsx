import { useMemo, useState } from 'react';
import { ExternalLink, EyeOff, Link2, Pencil, Play, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { GiMusicalNotes } from 'react-icons/gi';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useJukebox } from '../contexts/JukeboxContext';
import { useToast } from '../contexts/ToastContext';
import { JUKEBOX_URL, formatTime, measureDuration } from '../lib/jukebox/catalog';
import { newId, removed } from '../lib/jukebox/service';
import type { JukeboxEnvironment, JukeboxTrack } from '../lib/jukebox/types';
import { NowPlaying, TransportControls, VolumeControl } from '../components/jukebox/JukeboxControls';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Page, PageHeader } from '../components/ui/bits';

const EMOJIS = ['🎵', '🏰', '🌲', '🍺', '⚔️', '🐉', '🌊', '🏜️', '❄️', '🔥', '💀', '🕯️', '🔮', '👑', '🛕', '⛵', '🏙️', '🏡', '🌋', '🌙', '🕸️', '🎪', '⚓', '🗻', '🌧️', '🥀', '🏆', '🤡', '🧙', '🐺'];

export default function Jukebox() {
  const { isDM } = useAuth();
  const jb = useJukebox();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Page>
      <PageHeader
        icon={
          <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25">
            <GiMusicalNotes size={28} />
          </div>
        }
        title="Jukebox"
        subtitle={isDM ? 'Pick an environment and everyone hears the music, in sync.' : 'The DM picks the music; you choose how loud it is.'}
        actions={
          isDM && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> New environment
            </button>
          )
        }
      />

      <section className="card mb-8 space-y-4 p-4 sm:p-5">
        <NowPlaying large />
        {isDM && <TransportControls size="md" />}
        <VolumeControl className="max-w-sm" />
        {isDM && jb.upNext.length > 0 && (
          <div>
            <div className="label">Up next</div>
            <ol className="space-y-1 text-sm">
              {jb.upNext.map((s, i) => (
                <li key={s.key} className="flex items-center gap-2 text-stone-400">
                  <span className="w-4 text-right text-xs text-stone-600 tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-300">{s.track.title}</span>
                  <span className="text-xs tabular-nums">{formatTime(s.duration)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {isDM && (
        <>
          <h2 className="section-title mb-3">Environments</h2>
          {!jb.ready ? (
            <p className="text-sm text-stone-500 italic">{jb.libraryError ? `The music library can't be reached: ${jb.libraryError}` : 'Loading the music library…'}</p>
          ) : jb.catalog.environments.length === 0 ? (
            <EmptyState icon={GiMusicalNotes} title="No environments">
              Make one with “New environment”.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {jb.catalog.environments.map((e) => (
                <EnvironmentCard key={e.id} env={e} onEdit={() => setEditing(e.id)} />
              ))}
            </div>
          )}
          {jb.catalog.hidden.length > 0 && <HiddenEnvironments />}
        </>
      )}

      <p className="mt-10 text-xs text-stone-500">
        Music from the{' '}
        <a className="link" href={JUKEBOX_URL} target="_blank" rel="noreferrer">
          DnDocs Jukebox library <ExternalLink size={11} className="inline" />
        </a>
        , mostly by Kevin MacLeod (incompetech.com), licensed under{' '}
        <a className="link" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          Creative Commons: By Attribution 4.0
        </a>
        . The full credits are on the library page.
      </p>

      {editing && <EnvironmentEditor envId={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function EnvironmentCard({ env, onEdit }: { env: JukeboxEnvironment; onEdit: () => void }) {
  const jb = useJukebox();
  const active = jb.state?.envId === env.id;
  const minutes = Math.round(env.tracks.reduce((a, id) => a + (jb.catalog.tracks[id]?.duration ?? 0), 0) / 60);
  return (
    <div className={clsx('card flex items-stretch overflow-hidden transition-colors', active && 'ring-2 ring-amber-500/60')}>
      <button type="button" onClick={() => jb.playEnvironment(env.id)} className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left hover:bg-stone-800/40">
        <span className="text-3xl leading-none" aria-hidden>
          {env.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-display font-semibold text-stone-100">
            <span className="truncate">{env.name}</span>
            {active && <span className="chip text-amber-300 ring-amber-500/40">{jb.state?.playing ? 'Playing' : 'Paused'}</span>}
          </span>
          <span className="line-clamp-2 text-xs text-stone-500">{env.description || (env.custom ? 'Your environment' : '')}</span>
          <span className="mt-1 block text-[11px] text-stone-600">
            {env.tracks.length} tracks · {minutes} min
          </span>
        </span>
      </button>
      <button type="button" className="btn-icon h-auto shrink-0 rounded-none border-l border-stone-800" onClick={onEdit} aria-label={`Edit ${env.name}`}>
        <Pencil size={16} />
      </button>
    </div>
  );
}

function HiddenEnvironments() {
  const jb = useJukebox();
  const hidden = jb.config.hiddenEnvs ?? [];
  return (
    <div className="mt-6">
      <div className="label">Hidden environments</div>
      <div className="flex flex-wrap gap-2">
        {jb.catalog.hidden.map((e) => (
          <button key={e.id} type="button" className="tag" onClick={() => jb.saveConfig({ hiddenEnvs: hidden.filter((id) => id !== e.id) })} title="Show again">
            {e.emoji} {e.name} <RotateCcw size={11} />
          </button>
        ))}
      </div>
    </div>
  );
}

function EnvironmentEditor({ envId, onClose }: { envId: string | null; onClose: () => void }) {
  const jb = useJukebox();
  const confirm = useConfirm();
  const toast = useToast();
  const [id] = useState(() => envId ?? newId('env'));
  const env = jb.catalog.environments.find((e) => e.id === id) ?? null;
  const custom = !env || !!env.custom;
  const stored = jb.config.customEnvs?.[id];
  const [name, setName] = useState(env?.name ?? '');
  const [emoji, setEmoji] = useState(env?.emoji ?? '🎵');
  const [description, setDescription] = useState(env?.description ?? '');
  const [adding, setAdding] = useState<'library' | 'link' | null>(null);
  const tracks = env?.tracks ?? stored?.tracks ?? [];

  /** Write the environment's track list. */
  const saveTracks = async (next: string[], extra: Record<string, unknown> = {}) => {
    if (custom) {
      await jb.saveConfig({ ...extra, customEnvs: { [id]: { name: name.trim() || 'New environment', emoji, description, tracks: next } } }, id);
      return;
    }
    // Library environment: store the difference from the library's list.
    const original = new Set(libraryTracks(jb, id));
    const add = next.filter((t) => !original.has(t));
    const remove = [...original].filter((t) => !next.includes(t));
    await jb.saveConfig({ ...extra, envEdits: { [id]: { add, remove } } }, id);
  };

  const saveDetails = async () => {
    if (!custom) return onClose();
    if (!name.trim()) return toast.show('Give the environment a name.');
    await jb.saveConfig({ customEnvs: { [id]: { name: name.trim(), emoji, description: description.trim(), tracks } } }, id);
    onClose();
  };

  const removeTrack = async (trackId: string) => {
    const t = jb.catalog.tracks[trackId];
    const next = tracks.filter((x) => x !== trackId);
    // A link the DM added and nothing else uses: forget it too.
    const usedElsewhere = jb.catalog.environments.some((e) => e.id !== id && e.tracks.includes(trackId));
    await saveTracks(next, t?.custom && !usedElsewhere ? { customTracks: { [trackId]: removed() } } : {});
  };

  const libraryEdited = !custom && !!(jb.config.envEdits?.[id]?.add?.length || jb.config.envEdits?.[id]?.remove?.length);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={env ? `${env.emoji} ${env.name}` : 'New environment'}
      description={custom ? 'Your own environment.' : 'From the music library. Your changes only apply to this campaign.'}
      footer={
        <>
          {env && custom && (
            <button
              type="button"
              className="btn btn-danger mr-auto"
              onClick={async () => {
                if (!(await confirm({ title: `Delete “${env.name}”?`, message: 'The tracks you added by link stay available.', confirmLabel: 'Delete', danger: true }))) return;
                if (jb.state?.envId === id) jb.stop();
                await jb.saveConfig({ customEnvs: { [id]: removed() } });
                onClose();
              }}
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
          {env && !custom && (
            <button
              type="button"
              className="btn btn-ghost mr-auto"
              onClick={async () => {
                await jb.saveConfig({ hiddenEnvs: [...new Set([...(jb.config.hiddenEnvs ?? []), id])] });
                onClose();
              }}
            >
              <EyeOff size={15} /> Hide
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={saveDetails}>
            Done
          </button>
        </>
      }
    >
      {custom && (
        <div className="mb-5 space-y-3">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div>
              <label className="label">Icon</label>
              <select className="input w-20 text-center text-lg" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Icon">
                {EMOJIS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="env-name">
                Name
              </label>
              <input id="env-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Goblin warrens" maxLength={60} autoFocus={!env} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="env-desc">
              Description
            </label>
            <input id="env-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When it's used (optional)" maxLength={200} />
          </div>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="label mb-0 flex-1">{tracks.length} tracks</div>
        {libraryEdited && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => jb.saveConfig({ envEdits: { [id]: removed() } }, id)}>
            <RotateCcw size={14} /> Reset
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding('library')}>
          <Search size={14} /> Add from library
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding('link')}>
          <Link2 size={14} /> Add by link
        </button>
      </div>
      {custom && !env && !stored && <p className="hint mb-2">Name it, then add tracks; it's saved as you go.</p>}
      {jb.state?.envId === id && <p className="hint mb-2">Changes reach the music that's playing right away.</p>}

      <ul className="divide-y divide-stone-800/70 rounded-md border border-stone-800">
        {tracks.length === 0 && <li className="p-3 text-sm text-stone-500 italic">No tracks yet.</li>}
        {tracks.map((tid) => {
          const t = jb.catalog.tracks[tid];
          if (!t) return null;
          const playing = jb.now?.trackId === tid;
          return (
            <li key={tid} className={clsx('flex items-center gap-2 px-2 py-1.5', playing && 'bg-amber-500/10')}>
              <button type="button" className="btn-icon-sm shrink-0" onClick={() => jb.playTrack(tid, id)} aria-label={`Play ${t.title} now`} title="Play now for everyone">
                <Play size={15} />
              </button>
              <TrackLabel track={t} />
              <span className="text-xs text-stone-500 tabular-nums">{formatTime(t.duration)}</span>
              <button type="button" className="btn-icon-sm shrink-0" onClick={() => removeTrack(tid)} aria-label={`Remove ${t.title}`}>
                <X size={15} />
              </button>
            </li>
          );
        })}
      </ul>

      {adding === 'library' && <LibraryPicker exclude={tracks} onClose={() => setAdding(null)} onAdd={(ids) => saveTracks([...tracks, ...ids])} />}
      {adding === 'link' && (
        <LinkTrackForm
          onClose={() => setAdding(null)}
          onAdd={async (track) => {
            const tid = newId('t');
            await saveTracks([...tracks, tid], { customTracks: { [tid]: track } });
          }}
        />
      )}
    </Modal>
  );
}

function libraryTracks(jb: ReturnType<typeof useJukebox>, envId: string) {
  const env = jb.catalog.environments.concat(jb.catalog.hidden).find((e) => e.id === envId);
  if (!env) return [];
  const edit = jb.config.envEdits?.[envId];
  const add = new Set(edit?.add ?? []);
  return [...env.tracks.filter((t) => !add.has(t)), ...(edit?.remove ?? [])];
}

function TrackLabel({ track }: { track: JukeboxTrack }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm text-stone-200">{track.title}</div>
      <div className="truncate text-[11px] text-stone-500">
        {track.artist}
        {track.feel ? ` · ${track.feel}` : ''}
        {track.custom ? ' · your link' : ''}
      </div>
    </div>
  );
}

function LibraryPicker({ exclude, onAdd, onClose }: { exclude: string[]; onAdd: (ids: string[]) => Promise<void>; onClose: () => void }) {
  const jb = useJukebox();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /** Environments each track is in (helps finding "something like X"). */
  const where = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of jb.catalog.environments.concat(jb.catalog.hidden)) for (const t of e.tracks) m.set(t, [...(m.get(t) ?? []), e.name]);
    return m;
  }, [jb.catalog]);

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return Object.values(jb.catalog.tracks)
      .filter((t) => !exclude.includes(t.id) && t.duration > 0)
      .filter((t) => {
        const hay = `${t.title} ${t.artist} ${t.feel ?? ''} ${(where.get(t.id) ?? []).join(' ')}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 200);
  }, [q, jb.catalog.tracks, exclude, where]);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Add from the library"
      description="Search by title, mood (dark, calming, epic…) or environment."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!picked.length || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAdd(picked);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Add {picked.length || ''}
          </button>
        </>
      }
    >
      <input className="input mb-3" placeholder="e.g. dark, celtic, Combat…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search the library" />
      <ul className="divide-y divide-stone-800/70 rounded-md border border-stone-800">
        {results.map((t) => {
          const on = picked.includes(t.id);
          return (
            <li key={t.id}>
              <label className={clsx('flex cursor-pointer items-center gap-3 px-3 py-2', on && 'bg-amber-500/10')}>
                <input type="checkbox" className="size-4 accent-amber-500" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-stone-200">{t.title}</div>
                  <div className="truncate text-[11px] text-stone-500">{[t.feel, ...(where.get(t.id) ?? [])].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="text-xs text-stone-500 tabular-nums">{formatTime(t.duration)}</span>
              </label>
            </li>
          );
        })}
        {results.length === 0 && <li className="p-3 text-sm text-stone-500 italic">Nothing found.</li>}
      </ul>
    </Modal>
  );
}

function LinkTrackForm({ onAdd, onClose }: { onAdd: (t: { title: string; artist: string; url: string; duration: number; license: string; sourceUrl?: string }) => Promise<void>; onClose: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [license, setLicense] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    let u: URL;
    try {
      u = new URL(url.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      return toast.show('Paste a direct link to an audio file (https://…/song.mp3).');
    }
    if (!title.trim()) return toast.show('Give the track a title.');
    setBusy(true);
    try {
      const duration = await measureDuration(u.toString());
      await onAdd({ title: title.trim(), artist: artist.trim() || 'Unknown', url: u.toString(), duration, license: license.trim() });
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a track by link"
      description="A direct link to an audio file (mp3, ogg, m4a…) that anyone can open, e.g. from your own site or a Creative Commons archive. Spotify and YouTube links don't work."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'Checking the link…' : 'Add'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="tr-url">
            Link
          </label>
          <input id="tr-url" className="input" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/music/dragon.mp3" autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="tr-title">
              Title
            </label>
            <input id="tr-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="tr-artist">
              Artist
            </label>
            <input id="tr-artist" className="input" value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={120} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="tr-license">
            Licence (for the credits)
          </label>
          <input id="tr-license" className="input" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="CC BY 4.0" maxLength={120} />
        </div>
        <p className="hint">
          Tip: tracks that should be part of every campaign belong in the music library repo instead (see its README); they also get even loudness and smooth fades on
          iPhones.
        </p>
      </div>
    </Modal>
  );
}
