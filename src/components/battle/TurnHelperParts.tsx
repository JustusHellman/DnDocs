import clsx from 'clsx';
import { Crosshair, Dices, X } from 'lucide-react';
import type { PendingHit } from '../../lib/battle/aimStore';
import { attackNumbers, type Attack, type AttackTarget } from '../../lib/play/attacks';
import type { Spell } from '../../lib/play/spells';
import type { TurnOption } from '../../lib/play/turn';
import type { PlayerApi } from '../../lib/play/usePlayer';
import SpellGlyph from '../play/SpellGlyph';

/** The turn helper's pieces: an option's row, the spell and attack chips under it, the target line. */

export function Row({ o, onRun, dim, empty, open, onInfo, waiting }: { o: TurnOption; onRun: () => void; dim?: boolean; empty?: boolean; open?: boolean; onInfo?: () => void; waiting?: boolean }) {
  const attack = o.hit !== undefined;
  return (
    <div className={clsx('rounded-md ring-1 ring-transparent', open && 'bg-stone-900 ring-stone-800')}>
      <div className="flex items-start gap-1">
        <button type="button" onClick={onRun} className={clsx('min-w-0 flex-1 rounded-md px-1.5 py-1 text-left hover:bg-stone-900', (dim || empty) && 'opacity-45')} title={o.text}>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-100">
            {attack && <Dices size={12} className="shrink-0 text-amber-300" />}
            <span className="truncate">{o.name}</span>
            {o.recharge && (
              <span className={clsx('shrink-0 text-[10px] font-normal', waiting ? 'text-rose-300' : 'text-stone-500')}>{waiting ? `recharging (${o.recharge})` : `recharge ${o.recharge}`}</span>
            )}
          </span>
          {o.from && <span className="block truncate text-[10px] tracking-wide text-stone-500 uppercase">{o.from}</span>}
          {attack && (
            <span className="block text-[11px] text-stone-400">{`${o.hit! >= 0 ? '+' : ''}${o.hit} to hit${o.dmg?.length ? ` · ${o.dmg.map((d) => `${d.f} ${d.ty}`).join(' + ')}` : ''}`}</span>
          )}
        </button>
        {onInfo && (
          <button type="button" className="mt-1 shrink-0 rounded px-1 text-[11px] text-stone-500 hover:text-stone-200" aria-expanded={open} onClick={onInfo}>
            {open ? 'less' : 'what?'}
          </button>
        )}
      </div>
      {open && <p className="px-1.5 pb-1.5 text-xs leading-snug text-stone-300">{o.text}</p>}
    </div>
  );
}

export function SpellChips({ spells, tone, onCast, dim, rule }: { spells: Spell[]; tone: (s: Spell) => string; onCast: (s: Spell) => void; dim?: boolean; rule: (s: Spell) => string | null }) {
  return (
    <div className={clsx('flex flex-wrap gap-1 px-1 pb-1', dim && 'opacity-45')}>
      {spells.map((s) => {
        // Ruled out by the spells-per-turn rule: greyed, with the reason (still castable: the DM decides).
        const no = rule(s);
        return (
          <button
            key={s.i}
            type="button"
            onClick={() => onCast(s)}
            className={clsx(
              'flex items-center gap-1 rounded-full bg-stone-900 py-0.5 pr-2 pl-0.5 text-xs ring-1 ring-stone-700 hover:ring-stone-500',
              no ? 'text-stone-500 line-through opacity-60' : 'text-stone-200',
            )}
            title={no ?? `Cast ${s.n}`}
          >
            <SpellGlyph sp={s} tone={tone(s)} size={20} />
            {s.n}
          </button>
        );
      })}
    </div>
  );
}

/** A character's attacks as one-tap chips: to hit and damage, rolled in the chat. */
export function AttackChips({ p, list, dim, progress, onAttack }: { p: PlayerApi; list: Attack[]; dim?: boolean; progress: { made: number; of: number } | null; onAttack: (a: Attack) => void }) {
  if (!list.length) return null;
  return (
    <div className={clsx('px-1 pb-1', dim && 'opacity-45')}>
      {progress && progress.of > 1 && (
        <div className="px-0.5 pb-0.5 text-[11px] text-amber-300">
          Attack {progress.made} of {progress.of} made
          {progress.made < progress.of ? ` — ${progress.of - progress.made} more ${progress.of - progress.made === 1 ? 'is' : 'are'} part of the same action` : ''}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {list.map((a) => {
          const n = attackNumbers(a, p.d);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onAttack(a)}
              className="flex items-center gap-1 rounded-full bg-stone-900 px-2 py-0.5 text-xs text-stone-200 ring-1 ring-stone-700 hover:ring-stone-500"
              title={`${a.name}: ${n.hit >= 0 ? '+' : ''}${n.hit} to hit, ${n.dmg} ${a.ty ?? ''}${a.note ? ` (${a.note})` : ''}`}
            >
              <Dices size={11} className="text-amber-300" /> {a.name}{' '}
              <span className="text-stone-400 tabular-nums">
                {n.hit >= 0 ? '+' : ''}
                {n.hit}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Who the attacks go at: picked on purpose (never by just clicking a token), with how far away it
 * is, and after an attack its damage offered to apply — shown first, applied only on a press.
 */
export function TargetRow({
  target,
  picking,
  canWrite,
  onPick,
  onClear,
  pending,
  onApply,
  onDismiss,
}: {
  target: (AttackTarget & { id: string; feet: number }) | null | undefined;
  picking: boolean;
  canWrite: boolean;
  onPick: () => void;
  onClear: () => void;
  pending: PendingHit | null;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="space-y-1 border-b border-stone-800 px-3 py-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <Crosshair size={13} className={target ? 'text-rose-300' : 'text-stone-500'} />
        {target ? (
          <span className="min-w-0 flex-1 truncate text-stone-300">
            Target <b className="text-stone-100">{target.name}</b>
            <span className="text-stone-500">
              {' '}
              · {target.feet} ft away{target.ac !== null ? ` · AC ${target.ac}` : ''}
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-stone-500">{picking ? 'Click a token on the map…' : 'No target: attacks just roll.'}</span>
        )}
        {canWrite && (
          <button type="button" className="rounded px-1.5 py-0.5 font-semibold text-amber-300 hover:bg-stone-800" onClick={onPick} disabled={picking}>
            {target ? 'Change' : 'Pick target'}
          </button>
        )}
        {target && (
          <button type="button" className="btn-icon-sm size-6" aria-label="No target" title="No target" onClick={onClear}>
            <X size={12} />
          </button>
        )}
      </div>
      {pending && target && (
        <div className={clsx('flex flex-wrap items-center gap-1.5 rounded-md px-2 py-1', pending.verdict === 'miss' ? 'bg-stone-900' : 'bg-amber-500/10 ring-1 ring-amber-500/30')}>
          <span className="min-w-0 flex-1 text-stone-300">
            {pending.title} {pending.verdict === 'crit' ? 'critical hit on' : pending.verdict === 'hit' ? 'hits' : pending.verdict === 'miss' ? 'misses' : 'at'}{' '}
            <b className="text-stone-100">{target.name}</b>
            {pending.total !== null && pending.verdict !== 'miss' && (
              <span className="text-stone-400">
                {' '}
                · {pending.total}
                {pending.ty ? ` ${pending.ty}` : ''}
              </span>
            )}
            {pending.verdict === null && <span className="text-stone-500"> (the DM says if it hits)</span>}
          </span>
          {canWrite && (
            <button
              type="button"
              className={clsx('rounded px-2 py-0.5 font-semibold', pending.verdict === 'miss' ? 'text-stone-400 hover:text-stone-200' : 'bg-amber-500 text-stone-950')}
              onClick={onApply}
            >
              {pending.verdict === 'miss' ? 'Apply anyway…' : 'Apply damage…'}
            </button>
          )}
          <button type="button" className="btn-icon-sm size-6" aria-label="Dismiss" onClick={onDismiss}>
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
