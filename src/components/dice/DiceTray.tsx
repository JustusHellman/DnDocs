import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Bookmark, Dices, Minus, Plus, Trash2, X } from 'lucide-react';
import { addDie, addModifier, DICE_SIDES, formatFormula, parseFormula, rollFormula, type RollResult } from '../../lib/dice';
import type { DndStats } from '../../types';

interface Saved {
  name: string;
  formula: string;
}

/** Saved rolls and recent results: this device only (never in the database). */
const savedKey = (uid: string) => `dndocs-dice-saved:${uid}`;
const historyKey = (uid: string) => `dndocs-dice-history:${uid}`;
function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: kept for this visit only */
  }
}

const ABILITIES = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['con', 'CON'],
  ['int', 'INT'],
  ['wis', 'WIS'],
  ['cha', 'CHA'],
] as const;
const modOf = (score: unknown) => Math.floor(((Number(score) || 10) - 10) / 2);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * A dice tray: tap dice to build a roll (or type "1d20+5"), advantage / disadvantage / crit, saved
 * rolls and a short history. Everything stays on this device; other people don't see these rolls.
 */
export default function DiceTray({
  uid,
  stats,
  onClose,
  onRoll,
  variant = 'panel',
}: {
  uid: string;
  stats?: DndStats | null;
  onClose?: () => void;
  /** Every roll, e.g. to share it in the table chat. */
  onRoll?: (r: RollResult, label?: string) => void;
  /** chat: inside the table chat (which shows the results), so no result box or history here. */
  variant?: 'panel' | 'card' | 'chat';
}) {
  const [text, setText] = useState('1d20');
  const [adv, setAdv] = useState(false);
  const [dis, setDis] = useState(false);
  const [crit, setCrit] = useState(false);
  const [saved, setSaved] = useState<Saved[]>(() => read(savedKey(uid), []));
  const [history, setHistory] = useState<RollResult[]>(() => read(historyKey(uid), []));
  const [naming, setNaming] = useState<string | null>(null);
  /** Just rolled: the next die tapped starts a new roll instead of adding to this one. */
  const [fresh, setFresh] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => write(savedKey(uid), saved), [uid, saved]);
  useEffect(() => write(historyKey(uid), history.slice(0, 12)), [uid, history]);

  const formula = useMemo(() => parseFormula(text), [text]);
  const last = history[0];

  const roll = (f = formula, label?: string) => {
    if (!f) return;
    const r = rollFormula(f, { advantage: adv, disadvantage: dis, crit });
    setHistory((h) => [{ ...r, formula: label ? `${label}: ${r.formula}` : r.formula }, ...h].slice(0, 12));
    onRoll?.(r, label);
    setCrit(false); // a crit is for one damage roll
    setFresh(true);
  };
  const set = (f: ReturnType<typeof parseFormula>) => {
    if (f) setText(formatFormula(f));
    setFresh(false);
  };
  const tapDie = (sides: number) => set(addDie(fresh ? null : formula, sides));

  const saveCurrent = () => {
    const name = (naming ?? '').trim();
    if (!formula || !name) return setNaming(null);
    setSaved((s) => [...s.filter((x) => x.name !== name), { name, formula: formatFormula(formula) }].slice(-24));
    setNaming(null);
  };

  const abilities = stats ? ABILITIES.map(([k, label]) => ({ k, label, mod: modOf(stats[k]) })) : [];

  return (
    <div
      className={clsx(
        'text-sm',
        variant === 'panel'
          ? 'scrollbar-thin max-h-[min(75vh,40rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-stone-700/80 bg-stone-950/95 p-3 shadow-2xl backdrop-blur'
          : '',
      )}
    >
      {variant === 'panel' && (
        <div className="mb-2 flex items-center gap-2">
          <Dices size={16} className="text-amber-400" />
          <span className="flex-1 font-semibold text-stone-100">Dice</span>
          <span className="text-xs text-stone-500">only you see these</span>
          {onClose && (
            <button type="button" className="btn-icon-sm" aria-label="Close dice" onClick={onClose}>
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {/* The result (in the chat, the chat shows it) */}
      {variant !== 'chat' && (
      <div className="surface mb-3 flex min-h-24 flex-col items-center justify-center p-3 text-center" aria-live="polite">
        {last ? (
          <>
            <div className="max-w-full truncate text-xs text-stone-500">
              {last.formula}
              {last.advantage && ' · advantage'}
              {last.disadvantage && ' · disadvantage'}
              {last.crit && ' · crit'}
            </div>
            <div
              key={history.length + ':' + last.total}
              className={clsx(
                'animate-pop-in font-display text-5xl font-bold tabular-nums',
                last.natural === 20 ? 'text-emerald-300' : last.natural === 1 ? 'text-rose-400' : 'text-amber-300',
              )}
            >
              {last.total}
            </div>
            {last.natural === 20 && <div className="text-xs font-semibold text-emerald-300">Natural 20!</div>}
            {last.natural === 1 && <div className="text-xs font-semibold text-rose-400">Natural 1</div>}
            <Breakdown r={last} />
          </>
        ) : (
          <div className="text-stone-500">Tap dice, then Roll.</div>
        )}
      </div>

      )}

      {/* Building a roll */}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          roll();
        }}
      >
        <input
          ref={input}
          className={clsx('input min-w-0 flex-1 font-mono', text && !formula && 'border-rose-500/60')}
          value={text}
          onChange={(e) => {
            setFresh(false);
            setText(e.target.value);
          }}
          placeholder="e.g. 1d20+5 or 2d6+3"
          aria-label="Dice formula"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Clear" onClick={() => (setText(''), setFresh(false), input.current?.focus())}>
          <X size={14} />
        </button>
      </form>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {DICE_SIDES.map((s) => (
          <button key={s} type="button" className="btn btn-secondary h-9 px-0 text-xs font-semibold" onClick={() => tapDie(s)} title={`Add a d${s}`}>
            d{s}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Modifier minus one" onClick={() => set(addModifier(formula, -1))}>
          <Minus size={13} />
        </button>
        <span className="text-xs text-stone-500">mod</span>
        <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Modifier plus one" onClick={() => set(addModifier(formula, 1))}>
          <Plus size={13} />
        </button>
        <span className="mx-1 h-5 w-px bg-stone-700" />
        <Toggle on={adv} onClick={() => (setAdv(!adv), setDis(false))} title="Roll each d20 twice, keep the higher">
          Adv
        </Toggle>
        <Toggle on={dis} onClick={() => (setDis(!dis), setAdv(false))} title="Roll each d20 twice, keep the lower">
          Dis
        </Toggle>
        <Toggle on={crit} onClick={() => setCrit(!crit)} title="Critical hit: double the dice (for the next roll)">
          Crit
        </Toggle>
      </div>
      <button type="button" className="btn btn-primary mt-2 w-full" disabled={!formula} onClick={() => roll()}>
        <Dices size={15} /> Roll {formula ? formatFormula(formula) : ''}
      </button>

      {/* Quick rolls */}
      {abilities.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-stone-500">Ability checks (your character)</div>
          <div className="grid grid-cols-6 gap-1">
            {abilities.map((a) => (
              <button
                key={a.k}
                type="button"
                className="btn btn-ghost btn-sm flex-col gap-0 px-0 py-1 text-[11px] leading-tight"
                title={`${a.label} check: 1d20${signed(a.mod)}`}
                onClick={() => roll(parseFormula(`1d20${signed(a.mod)}`), a.label)}
              >
                <span className="text-stone-400">{a.label}</span>
                <span className="font-semibold text-stone-100">{signed(a.mod)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 flex items-center gap-2 text-xs text-stone-500">
          <span className="flex-1">Saved rolls</span>
          {naming === null ? (
            <button type="button" className="inline-flex items-center gap-1 hover:text-amber-300 disabled:opacity-40" disabled={!formula} onClick={() => setNaming('')}>
              <Bookmark size={12} /> Save this roll
            </button>
          ) : null}
        </div>
        {naming !== null && (
          <form
            className="mb-2 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              saveCurrent();
            }}
          >
            <input autoFocus className="input min-w-0 flex-1 py-1 text-sm" placeholder={`Name, e.g. Longsword attack`} value={naming} onChange={(e) => setNaming(e.target.value.slice(0, 40))} />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={!naming.trim()}>
              Save
            </button>
            <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Cancel" onClick={() => setNaming(null)}>
              <X size={13} />
            </button>
          </form>
        )}
        {saved.length ? (
          <div className="flex flex-wrap gap-1">
            {saved.map((s) => (
              <span key={s.name} className="inline-flex items-center rounded-full border border-stone-700 bg-stone-900/70 text-xs">
                <button type="button" className="py-1 pr-1 pl-2.5 text-stone-200 hover:text-amber-300" title={`Roll ${s.formula}`} onClick={() => (setText(s.formula), roll(parseFormula(s.formula), s.name))}>
                  {s.name} <span className="font-mono text-stone-500">{s.formula}</span>
                </button>
                <button type="button" className="rounded-full p-1 text-stone-500 hover:text-rose-300" aria-label={`Forget ${s.name}`} onClick={() => setSaved((all) => all.filter((x) => x.name !== s.name))}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          naming === null && <p className="text-xs text-stone-600">Your attacks and damage, one tap away (saved on this device).</p>
        )}
      </div>

      {variant !== 'chat' && history.length > 1 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center text-xs text-stone-500">
            <span className="flex-1">Earlier</span>
            <button type="button" className="btn-icon-sm" aria-label="Clear history" onClick={() => setHistory([])}>
              <Trash2 size={12} />
            </button>
          </div>
          <ul className="space-y-0.5 text-xs">
            {history.slice(1, 8).map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate text-stone-400">{r.formula}</span>
                <span className={clsx('font-semibold tabular-nums', r.natural === 20 ? 'text-emerald-300' : r.natural === 1 ? 'text-rose-400' : 'text-stone-200')}>{r.total}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={clsx('rounded-full border px-2.5 py-0.5 text-xs', on ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-stone-700 text-stone-400 hover:text-stone-200')}
    >
      {children}
    </button>
  );
}

/** "2d6 [3, 5] + 1d4 [2] + 3"; d20s set aside by advantage are shown struck through. */
function Breakdown({ r }: { r: RollResult }) {
  const parts = r.terms.map((t, i) => (
    <span key={i}>
      {i > 0 || t.sign < 0 ? (t.sign < 0 ? ' − ' : ' + ') : ''}
      {t.count}d{t.sides} [
      {t.rolls.map((v, j) => (
        <span key={j}>
          {j > 0 && ', '}
          <span className={clsx(t.sides === 20 && v === 20 && 'text-emerald-300', t.sides === 20 && v === 1 && 'text-rose-400')}>{v}</span>
          {t.dropped && (
            <>
              {' '}
              <span className="text-stone-600 line-through" title="set aside">
                {t.dropped[j]}
              </span>
            </>
          )}
        </span>
      ))}
      ]
    </span>
  ));
  if (r.terms.length === 1 && r.terms[0].rolls.length === 1 && !r.mod && !r.terms[0].dropped) return null;
  return (
    <div className="mt-1 max-w-full text-xs break-words text-stone-500">
      {parts}
      {r.mod ? ` ${r.mod < 0 ? '−' : '+'} ${Math.abs(r.mod)}` : ''}
    </div>
  );
}
