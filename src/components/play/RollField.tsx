import { useState } from 'react';
import clsx from 'clsx';
import { Check, Dices, X } from 'lucide-react';
import { parseFormula, rollFormula } from '../../lib/dice';
import { toChatRoll, type ChatRoll } from '../../lib/chat/rolls';

export interface RollOutcome {
  total: number;
  /** Set when the roll was made here (it goes to the chat with the dice). */
  roll?: ChatRoll;
}

/**
 * One roll the game asks for, never made for you: "Roll it here", type what you rolled at the
 * table, or leave it. `formula` like "8d6" or "1d20+3" (empty: only typing).
 */
export default function RollField({
  label,
  formula,
  value,
  onChange,
  crit,
  compact,
  hint,
}: {
  label: string;
  formula?: string | null;
  value: RollOutcome | null;
  onChange: (v: RollOutcome | null) => void;
  /** Double the dice (a critical hit). */
  crit?: boolean;
  compact?: boolean;
  hint?: string;
}) {
  const [typed, setTyped] = useState('');
  const f = formula ? parseFormula(formula.replace(/\s+/g, '')) : null;
  const rollHere = () => {
    if (!f) return;
    const r = rollFormula(f, { crit });
    onChange({ total: r.total, roll: toChatRoll(r, label) });
    setTyped('');
  };
  const commitTyped = (raw: string) => {
    const n = parseInt(raw, 10);
    onChange(Number.isFinite(n) ? { total: n } : null);
  };
  return (
    <div className={clsx('flex flex-wrap items-center gap-1.5', compact ? 'text-xs' : 'text-sm')}>
      <span className="min-w-0 flex-1 basis-32 text-stone-300">
        {label}
        {formula && <span className="ml-1.5 font-mono text-xs text-stone-500">{formula.replace(/\s+/g, '')}{crit ? ' ×2 dice' : ''}</span>}
        {hint && <span className="block text-[11px] text-stone-500 italic">{hint}</span>}
      </span>
      {value ? (
        <span className="flex items-center gap-1.5">
          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-display text-lg font-bold tabular-nums text-amber-300 ring-1 ring-amber-500/30">{value.total}</span>
          <span className="text-[11px] text-stone-500">{value.roll ? 'rolled here' : 'typed'}</span>
          <button type="button" className="btn-icon-sm size-7" aria-label={`Clear ${label}`} title="Clear" onClick={() => onChange(null)}>
            <X size={13} />
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          {f && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={rollHere}>
              <Dices size={13} /> Roll it here
            </button>
          )}
          <span className="flex items-center rounded-md ring-1 ring-stone-700 focus-within:ring-amber-500/60">
            <input
              className="w-16 rounded-l-md bg-transparent px-2 py-1 text-center tabular-nums text-stone-100 outline-none placeholder:text-stone-600"
              inputMode="numeric"
              placeholder="I rolled"
              aria-label={`${label}: what you rolled`}
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/[^\d-]/g, '').slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTyped(typed);
                }
              }}
              onBlur={() => typed && commitTyped(typed)}
            />
            <button type="button" className="px-1.5 text-stone-500 hover:text-amber-300 disabled:opacity-40" disabled={!typed} aria-label="Use this number" onClick={() => commitTyped(typed)}>
              <Check size={14} />
            </button>
          </span>
        </span>
      )}
    </div>
  );
}
