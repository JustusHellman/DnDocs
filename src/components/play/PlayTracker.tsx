import clsx from 'clsx';
import { BookOpen, Brain, Coffee, Moon, Settings2, Sparkles, Zap } from 'lucide-react';
import type { PlayerApi } from '../../lib/play/usePlayer';
import { className as classLabel, hitDiceLeft, hitDieLeft, pactLeft, resourceLeft, slotsLeft, ordinal, type Resource } from '../../lib/play/model';
import { openPlay } from '../../lib/play/ui';
import { LEVEL_TONE } from '../../lib/play/spells';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Pips: filled = still there. Tap a filled one to use down to it; tap an empty one to get back up
 * to it. (No chat line: that's for the cast dialog and the commands.)
 */
export function Pips({ max, left, onSet, tone = '#b08a3e', label, disabled, size = 'md' }: { max: number; left: number; onSet: (left: number) => void; tone?: string; label: string; disabled?: boolean; size?: 'sm' | 'md' }) {
  const dot = size === 'sm' ? 'size-3.5' : 'size-[18px]';
  return (
    <span className="inline-flex flex-wrap items-center gap-1" role="group" aria-label={`${label}: ${left} of ${max} left`}>
      {Array.from({ length: max }, (_, i) => {
        const full = i < left;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            aria-label={full ? `Use ${label} (${left - 1} left)` : `Get back ${label} (${i + 1} left)`}
            title={full ? 'Used one' : 'Got one back'}
            onClick={() => onSet(full ? i : i + 1)}
            className={clsx(dot, 'rounded-full border-2 transition-transform enabled:hover:scale-110 disabled:cursor-default')}
            style={{ borderColor: tone, background: full ? tone : 'transparent', opacity: full ? 1 : 0.55 }}
          />
        );
      })}
    </span>
  );
}

/** Concentration and reaction: one tap each (everyone sees them; only the owner and the DM change them). */
export function TurnChips({ p }: { p: PlayerApi }) {
  const { live } = p;
  return (
  <div className="flex flex-wrap items-center gap-1.5">
    <button
      type="button"
      disabled={!p.canEdit}
      aria-pressed={!!live.conc}
      onClick={() => p.setConc(!live.conc)}
      className={clsx('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1', live.conc ? 'bg-sky-500/20 text-sky-200 ring-sky-400/60' : 'text-stone-400 ring-stone-700 hover:text-stone-200')}
      title={live.conc ? 'Concentrating: tap to stop' : 'Not concentrating: tap to start'}
    >
      <Brain size={13} /> {live.conc ? `Concentrating${live.cs ? ` · ${live.cs}` : ''}` : 'Concentration'}
    </button>
    <button
      type="button"
      disabled={!p.canEdit}
      aria-pressed={!!live.re}
      onClick={() => p.setReact(!live.re)}
      className={clsx('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1', live.re ? 'bg-rose-500/20 text-rose-200 ring-rose-400/60 line-through' : 'text-stone-400 ring-stone-700 hover:text-stone-200')}
      title={live.re ? 'Reaction used (comes back at the start of your turn)' : 'Reaction ready: tap when you use it'}
    >
      <Zap size={13} /> {live.re ? 'Reaction used' : 'Reaction ready'}
    </button>
  </div>
  );
}

export function ResourceRow({ p, r, compact }: { p: PlayerApi; r: Resource; compact?: boolean }) {
  const left = resourceLeft(r, p.live);
  const restTag = r.rest === 'short' ? 'short rest' : r.rest === 'long' ? (r.shortOne ? 'long rest (1 back on a short)' : 'long rest') : 'no rest';
  const set = (l: number) => p.setResUsed(r, Math.max(0, r.max - l));
  return (
    <div className="flex min-h-7 items-center gap-2">
      <span className={clsx('min-w-0 flex-1 truncate', compact ? 'text-xs' : 'text-sm', 'text-stone-300')} title={`${r.name} · back on a ${restTag}${r.note ? ` · ${r.note}` : ''}`}>
        {r.name}
        {r.note && <span className="ml-1 text-[11px] text-stone-500">{r.note}</span>}
        {r.spell && <Sparkles size={11} className="ml-1 inline text-violet-400" aria-label="casts a spell" />}
        {/* When it comes back, visible on touch screens too (no hovering there). */}
        <span className="ml-1.5 text-[10px] tracking-wide text-stone-500 uppercase">{r.rest === 'short' ? 'short' : r.rest === 'long' ? (r.shortOne ? 'long · 1 on short' : 'long') : ''}</span>
      </span>
      {r.pool || r.max > 10 ? (
        <span className="flex items-center gap-1">
          <button type="button" className="btn-icon-sm size-6 text-base" disabled={!p.canEdit || left <= 0} aria-label={`Use one ${r.name}`} onClick={() => set(left - 1)}>
            −
          </button>
          <span className="min-w-12 text-center text-sm font-semibold tabular-nums text-stone-100">
            {left}
            <span className="text-stone-500">/{r.max}</span>
          </span>
          <button type="button" className="btn-icon-sm size-6 text-base" disabled={!p.canEdit || left >= r.max} aria-label={`Get one ${r.name} back`} onClick={() => set(left + 1)}>
            +
          </button>
        </span>
      ) : (
        <Pips max={r.max} left={left} onSet={set} label={r.name} disabled={!p.canEdit} tone={r.custom ? '#7c5cbf' : '#b08a3e'} size={compact ? 'sm' : 'md'} />
      )}
    </div>
  );
}

/**
 * A character's trackers: spell slots, pact slots, class resources and the player's own counters,
 * hit dice, concentration and reaction, with the rest and spell buttons. The same on the
 * character page, the token card and in the chat.
 */
export default function PlayTracker({ p, compact, hideHeader }: { p: PlayerApi; compact?: boolean; hideHeader?: boolean }) {
  const { d, live } = p;
  const caster = d.slots.length > 0 || !!d.pact || d.casterClasses.length > 0 || (p.def.spells?.always?.length ?? 0) > 0;
  const hdLeft = hitDiceLeft(d, live);
  const classes = d.classes.map((c) => `${classLabel(c.cls)} ${c.lvl}`).join(' / ');
  const ed = p.edition;
  // Spells and rests: first thing on the token card and in the chat (small spaces), last on the page.
  const actions = p.canEdit ? (
    <div className={clsx('flex items-center pt-1', compact ? 'gap-1' : 'flex-wrap gap-1.5')}>
          {caster && (
            <button type="button" className={clsx('btn btn-primary btn-sm', compact && 'px-2')} onClick={() => openPlay({ kind: 'spells', entityId: p.entity.id })}>
              <BookOpen size={13} /> Spells
            </button>
          )}
          <button type="button" className={clsx('btn btn-secondary btn-sm', compact && 'px-2')} title="Short rest" onClick={() => openPlay({ kind: 'rest', entityId: p.entity.id, rest: 'short' })}>
            <Coffee size={13} /> {compact ? 'Short' : 'Short rest'}
          </button>
          <button type="button" className={clsx('btn btn-secondary btn-sm', compact && 'px-2')} title="Long rest" onClick={() => openPlay({ kind: 'rest', entityId: p.entity.id, rest: 'long' })}>
            <Moon size={13} /> {compact ? 'Long' : 'Long rest'}
          </button>
          <span className="flex-1" />
          <button type="button" className="btn-icon-sm" aria-label="Set up trackers" title="Set up: classes, slots, resources, your own counters" onClick={() => openPlay({ kind: 'settings', entityId: p.entity.id })}>
            <Settings2 size={15} />
          </button>
        </div>
  ) : null;
  return (
    <div className={clsx('space-y-2', compact ? 'text-xs' : 'text-sm')}>
      {!hideHeader && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-400">
          <span className="font-semibold text-stone-200">{classes || 'No class found'}</span>
          {d.saveDC !== null && (
            <span>
              Spell DC <b className="text-stone-100">{d.saveDC}</b> · attack <b className="text-stone-100">{signed(d.attack ?? 0)}</b>
            </span>
          )}
          <span className="text-stone-500">{ed} rules</span>
        </div>
      )}
      {!d.classes.length && p.canEdit && (
        <p className="text-xs text-stone-500 italic">
          Put the class and level in “Class &amp; Level” (e.g. “Druid 5”), or set it up with the gear button.
        </p>
      )}

      <TurnChips p={p} />
      {compact && actions}

      {d.slots.length > 0 && (
        <div className="space-y-1">
          <div className="label mb-0.5">Spell slots</div>
          {d.slots.map((max, i) =>
            max > 0 ? (
              <div key={i} className="flex min-h-7 items-center gap-2">
                <span className="w-8 shrink-0 text-xs font-semibold" style={{ color: LEVEL_TONE[i + 1] }}>
                  {ordinal(i + 1)}
                </span>
                <Pips max={max} left={slotsLeft(d, live, i + 1)} onSet={(l) => p.setSlotUsed(i + 1, max - l)} label={`${ordinal(i + 1)}-level slot`} tone={LEVEL_TONE[i + 1]} disabled={!p.canEdit} size={compact ? 'sm' : 'md'} />
              </div>
            ) : null,
          )}
        </div>
      )}
      {d.pact && (
        <div className="flex min-h-7 items-center gap-2">
          <span className="flex-1 text-xs font-semibold text-violet-300">Pact slots ({ordinal(d.pact.l)})</span>
          <Pips max={d.pact.n} left={pactLeft(d, live)} onSet={(l) => p.setPactUsed(d.pact!.n - l)} label="pact slot" tone="#7c5cbf" disabled={!p.canEdit} size={compact ? 'sm' : 'md'} />
        </div>
      )}
      {d.resources.length > 0 && (
        <div className="space-y-0.5">
          <div className="label mb-0.5">Resources</div>
          {d.resources.map((r) => (
            <ResourceRow key={r.key} p={p} r={r} compact={compact} />
          ))}
        </div>
      )}
      {d.hitDiceMax > 0 && (
        <div className="flex min-h-7 items-center gap-2">
          <span className="flex-1 text-xs text-stone-300">
            Hit dice{' '}
            <span className="text-stone-500">{d.hitDice.length > 1 ? d.hitDice.map((h) => `d${h.die} ${hitDieLeft(d, live, h.die)}/${h.max}`).join(' · ') : `${d.hitDice[0].max}d${d.hitDice[0].die}`}</span>
          </span>
          <span className="text-sm font-semibold tabular-nums text-stone-100">
            {hdLeft}
            <span className="text-stone-500">/{d.hitDiceMax}</span>
          </span>
        </div>
      )}

      {!compact && actions}
    </div>
  );
}
