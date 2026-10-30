import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { BookOpen, Coffee, Moon, Search, Settings2, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { CLASS_IDS, className } from '../../lib/play/model';
import { spellTone, useColoring } from '../../lib/play/coloring';
import { useIsPhone } from '../../hooks/useMediaQuery';
import { usePlayer, type PlayerApi } from '../../lib/play/usePlayer';
import { hitDiceLeft, hitDieLeft, ordinal, pactLeft, slotsLeft } from '../../lib/play/model';
import { openCreatureCast, openPlay, readySpells, useSpellIndex } from '../../lib/play/ui';
import { dmgAt, healAt, LEVEL_TONE, type Spell } from '../../lib/play/spells';
import { openTableChat, useChatOpen } from '../chat/ChatDock';
import { useActingCharacter } from './useActingCharacter';
import { Pips, ResourceRow, TurnChips } from './PlayTracker';
import SpellCard, { SpellTags } from './SpellCard';
import { freeLabel } from './SpellBook';

/** Open (or close) the spellbook panel, optionally for one character. */
export function openQuickBook(opts: { entityId?: string; toggle?: boolean; close?: boolean } = {}) {
  window.dispatchEvent(new CustomEvent('dndocs:book', { detail: opts }));
}

/**
 * Your character's spells and abilities, one tap away: the button sits next to the chat (and on the
 * battle map's toolbar), the panel opens over whatever page you're on. Ready spells grouped by
 * level with the slots for that level, free uses, resources, hit dice, concentration and reaction,
 * and the rests. Cast opens the spell's cast dialog. Shown only to people with a character.
 */
export function QuickBookButton() {
  const { entity, choices, setId } = useActingCharacter();
  const [open, setOpen] = useState(false);
  const phone = useIsPhone();
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ entityId?: string; toggle?: boolean; close?: boolean }>).detail ?? {};
      if (d.close) return setOpen(false);
      if (d.entityId && choices.some((c) => c.id === d.entityId)) setId(d.entityId);
      setOpen((o) => (d.toggle ? !o : true));
    };
    // Out of the way while a spell's area is placed on the map.
    const away = () => setOpen(false);
    window.addEventListener('dndocs:book', on);
    window.addEventListener('dndocs:cast-area', away);
    return () => {
      window.removeEventListener('dndocs:book', on);
      window.removeEventListener('dndocs:cast-area', away);
    };
  }, [choices, setId]);
  // B opens and closes it (not while typing).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== 'b' || e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  // On a phone there's room for one panel.
  useEffect(() => {
    if (open && phone) openTableChat({ close: true });
  }, [open, phone]);
  const p = usePlayer(entity);
  const { isDM } = useAuth();
  // Players with a character, and the DM (the library, and helping a player).
  if (!choices.length && !isDM) return null;
  const caster = !!p && (p.d.slots.length > 0 || !!p.d.pact || p.d.casterClasses.length > 0 || (p.def.spells?.always?.length ?? 0) > 0);
  const label = caster ? 'Spells and abilities' : 'Abilities and rests';
  return (
    <>
      <button type="button" className={clsx('btn-icon relative', open && 'bg-stone-800/60 text-stone-50')} aria-label={label} title={`${label} (B)`} aria-pressed={open} onClick={() => setOpen((o) => !o)}>
        <BookOpen size={20} />
        {p?.live.conc && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-sky-400 ring-2 ring-stone-950" aria-label="concentrating" />}
      </button>
      {open && <Panel p={p} choices={choices} setId={setId} onClose={() => setOpen(false)} phone={phone} />}
    </>
  );
}

function Panel({ p, choices, setId, onClose, phone }: { p: PlayerApi | null; choices: { id: string; name: string }[]; setId: (id: string) => void; onClose: () => void; phone: boolean }) {
  const chatOpen = useChatOpen();
  // Everyone can browse every spell ("All spells"): the DM to help a player, read up, or cast for
  // a creature. The DM starts there until picking a character.
  const [lib, setLib] = useState(!p);
  const showLib = lib || !p;
  return (
    <div
      // Escape closes it while you're in it (on the map, Escape belongs to the map's tools).
      onKeyDown={(e) => e.key === 'Escape' && !(e.target as HTMLElement).closest('[aria-modal="true"]') && (e.stopPropagation(), onClose())}
      className={clsx(
        'fixed z-[110] flex flex-col overflow-hidden rounded-xl border border-stone-700/80 bg-stone-950/97 shadow-2xl backdrop-blur',
        phone ? 'inset-x-2 top-16 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]' : 'top-[4.5rem] max-h-[min(80vh,46rem)] w-[min(22rem,calc(100vw-1rem))]',
        // Next to the chat when both are open.
        !phone && (chatOpen ? 'right-[calc(min(26rem,100vw-1rem)+1rem)]' : 'right-2'),
      )}
      role="complementary"
      aria-label="Spells and abilities"
    >
      <div className="flex items-center gap-2 border-b border-stone-800 px-3 py-2">
        <BookOpen size={16} className="shrink-0 text-amber-400" />
        <select
          className="min-w-0 flex-1 rounded border border-stone-700 bg-stone-950 px-1 py-0.5 text-sm font-semibold text-stone-100"
          value={showLib ? '__all' : p?.entity.id ?? '__all'}
          onChange={(e) => (e.target.value === '__all' ? setLib(true) : (setLib(false), setId(e.target.value)))}
          aria-label="Whose spells"
        >
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__all">All spells (the library)</option>
        </select>
        {!showLib && p?.d.saveDC !== null && p && (
          <span className="shrink-0 text-xs text-stone-400">
            DC <b className="text-stone-100">{p.d.saveDC}</b> · <b className="text-stone-100">{(p.d.attack ?? 0) >= 0 ? '+' : ''}{p.d.attack}</b>
          </span>
        )}
        <button type="button" className="btn-icon-sm" aria-label="Close" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      {showLib || !p ? <Library /> : <Body p={p} />}
    </div>
  );
}

function Body({ p }: { p: PlayerApi }) {
  const { d, live } = p;
  const index = useSpellIndex(p.edition);
  const allReady = useMemo(() => readySpells(p.def, d, index.byId), [p.def, d, index.byId]);
  const [q, setQ] = useState('');
  const ready = q ? allReady.filter((s) => s.n.toLowerCase().includes(q.toLowerCase())) : allReady;
  const cast = (sp: Spell) => openPlay({ kind: 'cast', entityId: p.entity.id, spellId: sp.i });
  // Levels to show: any with spells ready, or with slots (only matches while searching).
  const levels = [...new Set([...ready.map((s) => s.l), ...(q ? [] : d.slots.map((n, i) => (n ? i + 1 : -1)).filter((l) => l > 0))])].sort((a, b) => a - b);
  const mod = d.ability ? d.mods[d.ability] : undefined;
  return (
    <>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
        <TurnChips p={p} />
        {allReady.length > 6 && <SearchBox value={q} onChange={setQ} placeholder="Search your spells" />}
        {d.pact && (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs font-semibold text-violet-300">Pact slots ({ordinal(d.pact.l)})</span>
            <Pips max={d.pact.n} left={pactLeft(d, live)} onSet={(l) => p.setPactUsed(d.pact!.n - l)} label="pact slot" tone="#7c3aed" disabled={!p.canEdit} size="sm" />
          </div>
        )}
        {index.loading && ready.length === 0 && (p.def.spells?.known?.length || p.def.spells?.prepared?.length) ? <p className="text-xs text-stone-500">Opening the spellbook…</p> : null}
        {!index.loading && allReady.length === 0 && (d.casterClasses.length > 0 || d.slots.length > 0 || !!d.pact) && (
          <div className="rounded-md bg-stone-900 p-3 text-center text-sm text-stone-300">
            <p className="mb-2">No spells ready yet.</p>
            {p.canEdit && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openPlay({ kind: 'spells', entityId: p.entity.id, tab: 'choose' })}>
                <BookOpen size={13} /> {d.prep === 'prepared' || d.prep === 'spellbook' ? 'Prepare spells' : 'Choose your spells'}
              </button>
            )}
          </div>
        )}
        {levels.map((l) => {
          const max = l > 0 ? d.slots[l - 1] ?? 0 : 0;
          const list = ready.filter((s) => s.l === l);
          return (
            <section key={l}>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: LEVEL_TONE[l] }}>
                  {l === 0 ? 'Cantrips' : `${ordinal(l)} level`}
                </span>
                {max > 0 && <Pips max={max} left={slotsLeft(d, live, l)} onSet={(left) => p.setSlotUsed(l, max - left)} label={`${ordinal(l)}-level slot`} tone={LEVEL_TONE[l]} disabled={!p.canEdit} size="sm" />}
              </div>
              {list.length ? (
                <ul className="space-y-0.5">
                  {list.map((sp) => {
                    const free = freeLabel(p, sp.i);
                    return (
                      <li key={sp.i}>
                        <button type="button" disabled={!p.canEdit} onClick={() => cast(sp)} className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-stone-900 disabled:cursor-default">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-stone-100">{sp.n}</span>
                            <span className="block truncate text-[11px] text-stone-500">
                              {sp.t}
                              {dmgAt(sp, sp.l || 1, d.level) ? ` · ${dmgAt(sp, sp.l || 1, d.level)} ${sp.dm?.ty?.toLowerCase() ?? ''}` : ''}
                              {healAt(sp, sp.l || 1) ? ` · heals ${healAt(sp, sp.l || 1)!.replace(/\s*\+\s*MOD/, mod ? ` + ${mod}` : '')}` : ''}
                              {sp.sv ? ` · ${sp.sv.toUpperCase()} save` : ''}
                            </span>
                          </span>
                          <SpellTags sp={sp} free={free} />
                          {p.canEdit && <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-semibold text-stone-950 opacity-90 group-hover:opacity-100">Cast</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                l > 0 && <p className="px-1.5 text-[11px] text-stone-500 italic">No {ordinal(l)}-level spells ready (higher spells can use these slots)</p>
              )}
            </section>
          );
        })}
        {d.resources.length > 0 && (
          <section>
            <div className="mb-0.5 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Resources</div>
            {d.resources.map((r) => (
              <ResourceRow key={r.key} p={p} r={r} compact />
            ))}
          </section>
        )}
        {d.hitDiceMax > 0 && (
          <div className="flex items-center gap-2 text-xs text-stone-300">
            <span className="flex-1">
              Hit dice{' '}
              <span className="text-stone-500">{d.hitDice.length > 1 ? d.hitDice.map((h) => `d${h.die} ${hitDieLeft(d, live, h.die)}/${h.max}`).join(' · ') : `d${d.hitDice[0].die}`}</span>
            </span>
            <b className="tabular-nums text-stone-100">
              {hitDiceLeft(d, live)}
              <span className="font-normal text-stone-500">/{d.hitDiceMax}</span>
            </b>
          </div>
        )}
      </div>
      {p.canEdit && (
        <div className="flex items-center gap-1 border-t border-stone-800 px-3 py-2">
          <button type="button" className="btn btn-secondary btn-sm px-2" onClick={() => openPlay({ kind: 'spells', entityId: p.entity.id })} title="All cards, preparing spells, writing your own">
            <Sparkles size={13} /> Spellbook
          </button>
          <button type="button" className="btn btn-ghost btn-sm px-2" onClick={() => openPlay({ kind: 'rest', entityId: p.entity.id, rest: 'short' })}>
            <Coffee size={13} /> Short
          </button>
          <button type="button" className="btn btn-ghost btn-sm px-2" onClick={() => openPlay({ kind: 'rest', entityId: p.entity.id, rest: 'long' })}>
            <Moon size={13} /> Long
          </button>
          <span className="flex-1" />
          <button type="button" className="btn-icon-sm" aria-label="Set up trackers" title="Set up: classes, slots, resources, your own counters" onClick={() => openPlay({ kind: 'settings', entityId: p.entity.id })}>
            <Settings2 size={15} />
          </button>
        </div>
      )}
    </>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-500" />
      <input className="input min-h-8 py-1 pl-8 text-sm" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </label>
  );
}

/**
 * Every spell for the campaign's rules (and its own cards): search, filter by level and class list,
 * open one to read it. The DM can cast one for a creature.
 */
function Library() {
  const { isDM, currentCampaign } = useAuth();
  const edition = currentCampaign?.houseRules?.edition === '2024' ? '2024' : '2014';
  const index = useSpellIndex(edition);
  const coloring = useColoring();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<number | 'all'>('all');
  const [cls, setCls] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = index.all.filter((s) => (level === 'all' || s.l === level) && (!cls || s.c.includes(cls)) && (!q || s.n.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
      <SearchBox value={q} onChange={setQ} placeholder="Search every spell" />
      <div className="flex flex-wrap items-center gap-1">
        <select className="rounded border border-stone-700 bg-stone-950 px-1 py-0.5 text-xs text-stone-200" value={level} onChange={(e) => setLevel(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Level">
          <option value="all">Any level</option>
          {Array.from({ length: 10 }, (_, l) => (
            <option key={l} value={l}>
              {l === 0 ? 'Cantrips' : ordinal(l)}
            </option>
          ))}
        </select>
        <select className="rounded border border-stone-700 bg-stone-950 px-1 py-0.5 text-xs text-stone-200" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class list">
          <option value="">Any class</option>
          {[...CLASS_IDS, 'artificer'].filter((c, i, a) => a.indexOf(c) === i).map((c) => (
            <option key={c} value={c}>
              {className(c)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[11px] text-stone-500">{index.loading ? 'Opening…' : `${list.length} spells`}</span>
      </div>
      <ul className="space-y-0.5">
        {list.slice(0, 120).map((sp) => (
          <li key={sp.i}>
            <button type="button" onClick={() => setOpen(open === sp.i ? null : sp.i)} aria-expanded={open === sp.i} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-stone-900">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: spellTone(sp, coloring) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-stone-100">{sp.n}</span>
                <span className="block truncate text-[11px] text-stone-500">
                  {sp.l === 0 ? 'cantrip' : `${ordinal(sp.l)} level`} · {sp.s.toLowerCase()} · {sp.t}
                  {sp.xs ? ` · ${sp.ref}` : ''}
                </span>
              </span>
              <SpellTags sp={sp} />
            </button>
            {open === sp.i && (
              <div className="px-1 pt-1 pb-2">
                <SpellCard sp={sp} edition={edition} charLevel={5} actions={isDM ? <button type="button" className="btn btn-primary btn-sm min-h-7 px-2" onClick={() => openCreatureCast(sp.i)}>Cast for a creature</button> : undefined} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {list.length > 120 && <p className="hint">Showing 120 of {list.length}: search or pick a level.</p>}
    </div>
  );
}
