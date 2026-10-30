import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { BookOpen, ChevronDown, ChevronRight, PenLine, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Segmented, Spinner } from '../ui/bits';
import SpellCard, { ColoringPicker, SpellTags, levelLine } from './SpellCard';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { useToast } from '../../contexts/ToastContext';
import type { PlayerApi } from '../../lib/play/usePlayer';
import { className as classLabel, ordinal, pactLeft, resourceLeft, slotsLeft } from '../../lib/play/model';
import { countChosen, markOf, openPlay, readySpells, useSpellIndex, withMark, type SpellMark } from '../../lib/play/ui';
import { deleteCustomSpell, saveCustomSpell } from '../../lib/play/live';
import { cleanCustomSpell, LEVEL_TONE, SCHOOLS, type Spell } from '../../lib/play/spells';
import { spellTone, useColoring } from '../../lib/play/coloring';

type Tab = 'ready' | 'choose' | 'write';

/** Free casts a counter gives for this spell, as a short label ("Free ×2 · Fey Touched"). */
export function freeLabel(p: PlayerApi, id: string) {
  const r = p.d.resources.find((x) => x.spell === id);
  return r ? `Free ×${resourceLeft(r, p.live)} · ${r.name.split(':')[0]}` : null;
}

/**
 * A character's spells. "Ready": the hand of cards you can cast now. "Choose": prepare or learn
 * spells from your class lists (or any list), and mark some always prepared. "Write a card": a
 * spell of your own, in your own words, kept for the whole campaign.
 */
export default function SpellBook({ p, onClose, initialTab = 'ready' }: { p: PlayerApi; onClose: () => void; initialTab?: Tab }) {
  const index = useSpellIndex(p.edition);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState<Spell | null>(null);
  const { members } = useCampaignData();
  const names = useMemo(() => Object.fromEntries(members.map((m) => [m.uid, m.displayName])), [members]);
  const ready = useMemo(() => readySpells(p.def, p.d, index.byId), [p.def, p.d, index.byId]);
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <BookOpen size={18} /> {p.entity.name}’s spells
        </span>
      }
      description={
        p.d.saveDC !== null ? `Spell save DC ${p.d.saveDC} · spell attack ${p.d.attack! >= 0 ? '+' : ''}${p.d.attack} · ${p.d.ability?.toUpperCase()}` : 'No spellcasting class found (you can still add spells).'
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={(t) => (setTab(t), t !== 'write' && setEditing(null))}
          options={[
            { value: 'ready', label: `Ready (${ready.length})`, icon: Wand2 },
            { value: 'choose', label: p.d.prep === 'prepared' || p.d.prep === 'spellbook' ? 'Prepare' : 'Choose', icon: BookOpen },
            { value: 'write', label: editing ? 'Edit card' : 'Write a card', icon: PenLine },
          ]}
        />
      </div>
      {index.loading ? (
        <div className="flex justify-center py-10">
          <Spinner label="Opening the spellbook" />
        </div>
      ) : tab === 'ready' ? (
        <ReadyTab p={p} ready={ready} names={names} onChoose={() => setTab('choose')} />
      ) : tab === 'choose' ? (
        <ChooseTab p={p} all={index.all} byId={index.byId} names={names} onEdit={(sp) => (setEditing(sp), setTab('write'))} />
      ) : (
        <WriteTab p={p} editing={editing} onDone={() => (setEditing(null), setTab('choose'))} />
      )}
    </Modal>
  );
}

function SlotStrip({ p }: { p: PlayerApi }) {
  const { d, live } = p;
  if (!d.slots.length && !d.pact) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-stone-950/50 px-3 py-2 text-xs">
      {d.slots.map((max, i) =>
        max ? (
          <span key={i} className="flex items-center gap-1">
            <b style={{ color: LEVEL_TONE[i + 1] }}>{ordinal(i + 1)}</b>
            <span className="tabular-nums text-stone-300">
              {slotsLeft(d, live, i + 1)}/{max}
            </span>
          </span>
        ) : null,
      )}
      {d.pact && (
        <span className="flex items-center gap-1">
          <b className="text-violet-300">Pact {ordinal(d.pact.l)}</b>
          <span className="tabular-nums text-stone-300">
            {pactLeft(d, live)}/{d.pact.n}
          </span>
        </span>
      )}
    </div>
  );
}

const VIEW_KEY = 'dndocs-spell-view';
function ReadyTab({ p, ready: all, names, onChoose }: { p: PlayerApi; ready: Spell[]; names: Record<string, string>; onChoose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  // Small cards, or the whole text of every spell (remembered on this device).
  const [view, setView] = useState<'cards' | 'text'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'text' ? 'text' : 'cards';
    } catch {
      return 'cards';
    }
  });
  const pickView = (v: 'cards' | 'text') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const ready = q ? all.filter((s) => s.n.toLowerCase().includes(q.toLowerCase())) : all;
  // The picked card opens above the hand: bring it into view (on a phone it's often off screen).
  const shownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) shownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [open]);
  const always = new Set(p.def.spells?.always ?? []);
  const levels = [...new Set(ready.map((s) => s.l))];
  const shown = open ? ready.find((s) => s.i === open) : null;
  if (!all.length)
    return (
      <div className="py-8 text-center">
        <p className="mb-3 text-stone-400">No spells ready yet.</p>
        <button type="button" className="btn btn-primary" onClick={onChoose}>
          <BookOpen size={15} /> {p.d.prep === 'prepared' || p.d.prep === 'spellbook' ? 'Prepare spells' : 'Choose your spells'}
        </button>
      </div>
    );
  const cast = (sp: Spell) => openPlay({ kind: 'cast', entityId: p.entity.id, spellId: sp.i });
  return (
    <div>
      <SlotStrip p={p} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-40 flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-500" />
          <input className="input min-h-9 py-1 pl-8" placeholder="Search your spells" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your spells" />
        </label>
        <Segmented
          size="sm"
          value={view}
          onChange={pickView}
          options={[
            { value: 'cards', label: 'Cards' },
            { value: 'text', label: 'With text' },
          ]}
        />
        <ColoringPicker />
      </div>
      {!ready.length && <p className="py-4 text-center text-sm text-stone-500">No spell called “{q}”.</p>}
      {shown && (
        <div ref={shownRef} className="mb-4 grid scroll-mt-2 gap-3 sm:grid-cols-[minmax(0,22rem)_1fr]">
          <SpellCard sp={shown} charLevel={p.d.level} edition={p.edition} mod={p.d.ability ? p.d.mods[p.d.ability] : undefined} always={always.has(shown.i)} free={freeLabel(p, shown.i)} names={names} />
          <div className="flex flex-col gap-2">
            <button type="button" className="btn btn-primary" onClick={() => cast(shown)}>
              <Wand2 size={15} /> Cast {shown.n}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
              Back to all cards
            </button>
          </div>
        </div>
      )}
      {levels.map((l) => (
        <section key={l} className="mb-4">
          <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase" style={{ color: LEVEL_TONE[l] }}>
            {l === 0 ? 'Cantrips' : `${ordinal(l)} level`}
            {l > 0 && p.d.slots[l - 1] ? <span className="font-normal text-stone-500 normal-case">{slotsLeft(p.d, p.live, l)} of {p.d.slots[l - 1]} slots left</span> : null}
          </h3>
          <div className={clsx('grid gap-2', view === 'text' ? 'sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}>
            {ready
              .filter((s) => s.l === l)
              .map((sp) => (
                <SpellCard
                  key={sp.i}
                  sp={sp}
                  mini={view === 'cards'}
                  charLevel={p.d.level}
                  mod={p.d.ability ? p.d.mods[p.d.ability] : undefined}
                  edition={p.edition}
                  always={always.has(sp.i)}
                  free={freeLabel(p, sp.i)}
                  names={names}
                  selected={open === sp.i}
                  onClick={view === 'cards' ? () => setOpen(open === sp.i ? null : sp.i) : undefined}
                  actions={
                    <button
                      type="button"
                      className="btn btn-primary btn-sm min-h-7 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        cast(sp);
                      }}
                    >
                      Cast
                    </button>
                  }
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ChooseTab({ p, all, byId, names, onEdit }: { p: PlayerApi; all: Spell[]; byId: Map<string, Spell>; names: Record<string, string>; onEdit: (sp: Spell) => void }) {
  const { user, isDM, currentCampaign } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  // The highest spell level this character can cast (slots or pact slots): the list starts there.
  const maxLevel = Math.max(p.d.slots.length, p.d.pact?.l ?? 0);
  const [level, setLevel] = useState<number | 'all' | 'can'>(maxLevel > 0 ? 'can' : 'all');
  const [books, setBooks] = useState(true);
  const myLists = p.d.casterClasses;
  const [scope, setScope] = useState<'mine' | 'all' | 'chosen' | 'cards'>(myLists.length ? 'mine' : 'all');
  const [open, setOpen] = useState<string | null>(null);
  const coloring = useColoring();
  const counts = countChosen(p.def, p.d, byId);
  const prep = p.d.prep;
  const list = all.filter((s) => {
    if (level === 'can' ? s.l > maxLevel : level !== 'all' && s.l !== level) return false;
    if (!books && s.xs) return false;
    if (q && !s.n.toLowerCase().includes(q.toLowerCase())) return false;
    if (scope === 'mine') return s.by !== undefined || s.c.some((c) => myLists.includes(c)) || markOf(p.def, s.i) !== 'none';
    if (scope === 'chosen') return markOf(p.def, s.i) !== 'none';
    if (scope === 'cards') return s.by !== undefined;
    return true;
  });
  const setMark = (sp: Spell, mark: SpellMark) => p.saveDef(withMark(p.def, sp.i, mark, p.d)).catch(() => undefined);
  const options = (sp: Spell): { value: SpellMark; label: string }[] => {
    const none = { value: 'none' as const, label: '—' };
    const alw = { value: 'always' as const, label: 'Always' };
    if (sp.l === 0) return [none, { value: 'known', label: 'Known' }, alw];
    if (prep === 'prepared') return [none, { value: 'prepared', label: 'Prepared' }, alw];
    if (prep === 'spellbook') return [none, { value: 'known', label: 'In book' }, { value: 'prepared', label: 'Prepared' }, alw];
    return [none, { value: 'known', label: 'Known' }, alw];
  };
  const limit = p.d.preparedMax;
  const word = prep === 'prepared' || prep === 'spellbook' ? 'Prepared' : 'Known';
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className={clsx('rounded-md px-2 py-1 font-semibold', limit !== null && counts.spells > limit ? 'bg-rose-500/15 text-rose-300' : 'bg-stone-950/60 text-stone-200')}>
          {word} {counts.spells}
          {limit !== null ? ` of ${limit}` : ''}
        </span>
        {p.d.cantripsMax !== null && (
          <span className={clsx('rounded-md px-2 py-1 font-semibold', counts.cantrips > p.d.cantripsMax ? 'bg-rose-500/15 text-rose-300' : 'bg-stone-950/60 text-stone-200')}>
            Cantrips {counts.cantrips} of {p.d.cantripsMax}
          </span>
        )}
        <span className="text-xs text-stone-500">Always-prepared spells don’t count. The numbers are a guide: pick what your sheet says.</span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="relative min-w-40 flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-500" />
          <input className="input pl-8" placeholder="Search spells" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search spells" />
        </label>
        <select className="input w-auto" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} aria-label="Which spells">
          {myLists.length > 0 && <option value="mine">{myLists.map(classLabel).join(' & ')} list</option>}
          <option value="all">Every class list</option>
          <option value="chosen">Only my spells</option>
          <option value="cards">Campaign cards</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-stone-400" title="Spells from Xanathar's, Tasha's and the other books: their numbers only, the text is in the book">
          <input type="checkbox" className="accent-amber-500" checked={books} onChange={(e) => setBooks(e.target.checked)} /> Other books
        </label>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {([...(maxLevel > 0 ? (['can'] as const) : []), 'all', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLevel(l)}
            className={clsx('rounded-md px-2 py-0.5 text-xs font-semibold ring-1', level === l ? 'bg-amber-500 text-stone-950 ring-amber-500' : 'text-stone-400 ring-stone-700 hover:text-stone-200')}
          >
            {l === 'can' ? `What I can cast (up to ${ordinal(maxLevel)})` : l === 'all' ? 'All' : l === 0 ? 'Cantrips' : ordinal(l)}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-stone-800 rounded-md border border-stone-800">
        {list.slice(0, 200).map((sp) => {
          const mark = markOf(p.def, sp.i);
          const mine = sp.by !== undefined && (sp.by === user?.uid || isDM);
          return (
            <li key={sp.i} className={clsx(mark !== 'none' && 'bg-amber-500/5')}>
              <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                <button type="button" className="flex min-w-0 flex-1 basis-48 items-center gap-1.5 text-left" onClick={() => setOpen(open === sp.i ? null : sp.i)} aria-expanded={open === sp.i}>
                  {open === sp.i ? <ChevronDown size={14} className="shrink-0 text-stone-500" /> : <ChevronRight size={14} className="shrink-0 text-stone-500" />}
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: spellTone(sp, coloring) }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-stone-100">{sp.n}</span>
                    <span className="block truncate text-[11px] text-stone-500">
                      {levelLine(sp)}
                      {scope !== 'mine' && sp.c.length ? ` · ${sp.c.map(classLabel).join(', ')}` : ''}
                      {sp.by !== undefined ? ' · campaign card' : ''}
                      {sp.xs ? ` · ${sp.ref}` : ''}
                    </span>
                  </span>
                </button>
                <SpellTags sp={sp} />
                <Segmented size="sm" value={mark} onChange={(m) => setMark(sp, m)} options={options(sp)} />
              </div>
              {open === sp.i && (
                <div className="px-2 pb-3">
                  <div className="max-w-xl">
                    <SpellCard sp={sp} charLevel={p.d.level} edition={p.edition} mod={p.d.ability ? p.d.mods[p.d.ability] : undefined} names={names} />
                  </div>
                  {mine && (
                    <div className="mt-2 flex gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(sp)}>
                        <PenLine size={13} /> Edit card
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => currentCampaign && confirm(`Delete the card “${sp.n}” for everyone?`) && deleteCustomSpell(currentCampaign.id, sp.i).catch((err) => toast.error(err, 'Delete card'))}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!list.length && <li className="p-4 text-center text-sm text-stone-500">No spells match.</li>}
      </ul>
      {list.length > 200 && <p className="hint">Showing 200 of {list.length}: search or pick a level to narrow it down.</p>}
    </div>
  );
}

/** "3d6" plus "1d6" per level above: the dice at each slot level. */
function scaleDice(base: string, per: string, from: number) {
  const out: Record<string, string> = { [String(from)]: base.replace(/\s+/g, '') };
  const b = base.match(/^(\d+)d(\d+)(.*)$/);
  const pm = per.match(/^(\d+)d(\d+)$/);
  for (let l = from + 1; l <= 9; l++) {
    if (b && pm && pm[2] === b[2]) out[String(l)] = `${Number(b[1]) + Number(pm[1]) * (l - from)}d${b[2]}${b[3]}`;
    else if (pm && b) out[String(l)] = `${base.replace(/\s+/g, '')}+${Number(pm[1]) * (l - from)}d${pm[2]}`;
  }
  return out;
}

function WriteTab({ p, editing, onDone }: { p: PlayerApi; editing: Spell | null; onDone: () => void }) {
  const { user, currentCampaign } = useAuth();
  const toast = useToast();
  const e = editing;
  const [f, setF] = useState(() => ({
    n: e?.n ?? '',
    l: e?.l ?? 1,
    s: e?.s ?? 'Evocation',
    t: e?.t ?? '1 action',
    r: e?.r ?? '60 feet',
    v: e?.v ?? 'VS',
    m: e?.m ?? '',
    d: e?.d ?? 'Instantaneous',
    k: !!e?.k,
    ri: !!e?.ri,
    x: e?.x ?? '',
    h: e?.h ?? '',
    ref: e?.ref ?? '',
    ak: e?.a?.k ?? '',
    af: e?.a?.f ?? 20,
    dmg: e?.dm?.at?.[String(e.l || 1)] ?? '',
    per: '',
    ty: e?.dm?.ty ?? '',
    sv: e?.sv ?? '',
    at: e?.at ?? '',
    add: !e,
  }));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const save = async () => {
    if (!currentCampaign || !user || !f.n.trim()) return;
    setBusy(true);
    try {
      const from = Math.max(1, f.l);
      const sp = cleanCustomSpell(
        {
          i: e?.i,
          n: f.n,
          l: f.l,
          s: f.s,
          c: p.d.casterClasses,
          t: f.t,
          r: f.r,
          v: f.v,
          m: f.m || undefined,
          d: f.d,
          k: f.k ? 1 : undefined,
          ri: f.ri ? 1 : undefined,
          x: f.x,
          h: f.h || undefined,
          ref: f.ref || undefined,
          a: f.ak ? { k: f.ak as NonNullable<Spell['a']>['k'], f: Number(f.af) || 5 } : undefined,
          dm: f.dmg.trim() ? { ty: f.ty || 'damage', at: f.per.trim() ? scaleDice(f.dmg, f.per.trim(), from) : e?.dm?.at && f.dmg === e.dm.at[String(from)] ? e.dm.at : { [String(from)]: f.dmg.replace(/\s+/g, '') } } : undefined,
          sv: f.sv || undefined,
          at: (f.at || undefined) as Spell['at'],
        },
        e?.by ?? user.uid,
      );
      await saveCustomSpell(currentCampaign.id, sp);
      if (f.add && markOf(p.def, sp.i) === 'none') await p.saveDef(withMark(p.def, sp.i, sp.l === 0 || p.d.prep === 'known' || !p.d.prep ? 'known' : 'prepared', p.d));
      toast.success(e ? 'Card saved' : `“${sp.n}” added to the campaign’s cards`);
      onDone();
    } catch (err) {
      toast.error(err, 'Save card');
    } finally {
      setBusy(false);
    }
  };
  const field = 'block text-sm';
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-400">
        A spell that isn’t in the free rules (SRD)? Write it up in your own words: the cards are kept for this campaign only, and everyone at the table can see them. Add the book and page if you like.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={clsx(field, 'sm:col-span-2')}>
          <span className="label">Name</span>
          <input className="input" value={f.n} onChange={(ev) => set({ n: ev.target.value.slice(0, 80) })} placeholder="e.g. Starry Wisp" />
        </label>
        <label className={field}>
          <span className="label">Level</span>
          <select className="input" value={f.l} onChange={(ev) => set({ l: Number(ev.target.value) })}>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? 'Cantrip' : ordinal(i)}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className="label">School</span>
          <select className="input" value={f.s} onChange={(ev) => set({ s: ev.target.value })}>
            {SCHOOLS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className="label">Casting time</span>
          <input className="input" value={f.t} onChange={(ev) => set({ t: ev.target.value })} />
        </label>
        <label className={field}>
          <span className="label">Range</span>
          <input className="input" value={f.r} onChange={(ev) => set({ r: ev.target.value })} placeholder="60 feet, Self, Touch" />
        </label>
        <label className={field}>
          <span className="label">Components</span>
          <input className="input" value={f.v} onChange={(ev) => set({ v: ev.target.value.toUpperCase().replace(/[^VSM]/g, '').slice(0, 3) })} placeholder="VSM" />
        </label>
        <label className={clsx(field, 'sm:col-span-2')}>
          <span className="label">Material</span>
          <input className="input" value={f.m} onChange={(ev) => set({ m: ev.target.value })} placeholder="(optional)" />
        </label>
        <label className={field}>
          <span className="label">Duration</span>
          <input className="input" value={f.d} onChange={(ev) => set({ d: ev.target.value })} />
        </label>
        <div className="flex items-end gap-4 pb-2 text-sm text-stone-300 sm:col-span-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-amber-500" checked={f.k} onChange={(ev) => set({ k: ev.target.checked })} /> Concentration
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-amber-500" checked={f.ri} onChange={(ev) => set({ ri: ev.target.checked })} /> Ritual
          </label>
        </div>
      </div>
      <div className="surface grid gap-3 p-3 sm:grid-cols-4">
        <label className={field}>
          <span className="label">Damage dice</span>
          <input className="input" value={f.dmg} onChange={(ev) => set({ dmg: ev.target.value })} placeholder="e.g. 2d8" />
        </label>
        <label className={field}>
          <span className="label">Type</span>
          <input className="input" value={f.ty} onChange={(ev) => set({ ty: ev.target.value })} placeholder="radiant" />
        </label>
        <label className={field}>
          <span className="label">+ per slot above</span>
          <input className="input" value={f.per} onChange={(ev) => set({ per: ev.target.value })} placeholder="1d8" />
        </label>
        <label className={field}>
          <span className="label">Save or attack</span>
          <select className="input" value={f.at ? `at:${f.at}` : f.sv} onChange={(ev) => (ev.target.value.startsWith('at:') ? set({ at: ev.target.value.slice(3), sv: '' }) : set({ sv: ev.target.value, at: '' }))}>
            <option value="">Neither</option>
            <option value="at:ranged">Ranged spell attack</option>
            <option value="at:melee">Melee spell attack</option>
            {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => (
              <option key={a} value={a}>
                {a.toUpperCase()} save
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className="label">Area</span>
          <select className="input" value={f.ak} onChange={(ev) => set({ ak: ev.target.value })}>
            <option value="">None</option>
            <option value="sphere">Sphere / radius</option>
            <option value="cube">Cube</option>
            <option value="cone">Cone</option>
            <option value="line">Line</option>
            <option value="cylinder">Cylinder</option>
          </select>
        </label>
        {f.ak && (
          <label className={field}>
            <span className="label">Size (feet)</span>
            <input className="input" inputMode="numeric" value={f.af} onChange={(ev) => set({ af: Number(ev.target.value.replace(/\D/g, '')) || 0 })} />
          </label>
        )}
      </div>
      <label className="block">
        <span className="label">What it does (your own words)</span>
        <textarea className="input" rows={5} value={f.x} onChange={(ev) => set({ x: ev.target.value.slice(0, 2500) })} />
      </label>
      <label className="block">
        <span className="label">At higher levels</span>
        <input className="input" value={f.h} onChange={(ev) => set({ h: ev.target.value.slice(0, 600) })} placeholder="(optional)" />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block flex-1">
          <span className="label">Book reference</span>
          <input className="input" value={f.ref} onChange={(ev) => set({ ref: ev.target.value.slice(0, 60) })} placeholder="e.g. Xanathar’s p. 152" />
        </label>
        {!e && (
          <label className="flex items-center gap-1.5 pb-2 text-sm text-stone-300">
            <input type="checkbox" className="accent-amber-500" checked={f.add} onChange={(ev) => set({ add: ev.target.checked })} /> Add to {p.entity.name.split(' ')[0]}’s spells
          </label>
        )}
        <button type="button" className="btn btn-primary" disabled={busy || !f.n.trim()} onClick={save}>
          <Sparkles size={15} /> {e ? 'Save card' : 'Save card'}
        </button>
      </div>
    </div>
  );
}
