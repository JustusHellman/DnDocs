import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, Dices, Swords } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { parseFormula, rollFormula } from '../../lib/dice';
import { toChatRoll, type ChatRoll } from '../../lib/chat/rolls';
import { setInitiatives } from '../../lib/battle/sceneService';
import { setSittingOut, useSittingOut, type InitiativeContext, type InitiativeToken } from '../../lib/battle/initiativeStore';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const bonusOf = (raw: string, fallback: number) => {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(-10, Math.min(20, n)) : fallback;
};
const rollInit = (bonus: number, adv = false, dis = false) => rollFormula(parseFormula(`1d20${bonus ? signed(bonus) : ''}`)!, { advantage: adv, disadvantage: dis });

/**
 * Rolling initiative, in the table chat while a battle map is open. Players roll for their own
 * characters (bonus filled in from DEX, adjustable; advantage / disadvantage), and the result goes
 * into the tracker and the chat. The DM rolls for every creature in one go, unticking any that
 * aren't in this fight; those stay out of the order (remembered for this map on this device).
 */
export default function InitiativePanel({
  ctx,
  open,
  onToggle,
  share,
  note,
}: {
  ctx: InitiativeContext;
  open: boolean;
  onToggle: () => void;
  /** A roll for the chat (with the dice animation). */
  share: (roll: ChatRoll) => void;
  /** A line only you see in the chat. */
  note: (text: string) => void;
}) {
  const toast = useToast();
  const out = useSittingOut(ctx.sceneId);
  const [busy, setBusy] = useState(false);
  const mine = ctx.unrolled.filter((t) => t.mine);
  const dmList = ctx.asDM ? ctx.unrolled.filter((t) => !t.mine) : [];
  const list = ctx.asDM ? dmList : mine;
  const [bonus, setBonus] = useState<Record<string, string>>({});
  const [adv, setAdv] = useState<Record<string, 'adv' | 'dis' | undefined>>({});
  // The DM's picks: creatures unless sitting out; players' characters only when ticked (they roll their own).
  const [players, setPlayers] = useState<Set<string>>(new Set());
  useEffect(() => setPlayers((p) => new Set([...p].filter((id) => dmList.some((t) => t.id === id)))), [dmList.map((t) => t.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticked = (t: InitiativeToken) => (t.player ? players.has(t.id) : !out.includes(t.id));
  const toggle = (t: InitiativeToken) => {
    if (t.player) setPlayers((p) => (p.has(t.id) ? new Set([...p].filter((x) => x !== t.id)) : new Set([...p, t.id])));
    else setSittingOut(ctx.sceneId, out.includes(t.id) ? out.filter((x) => x !== t.id) : [...out, t.id]);
  };
  if (!list.length) return null;

  const save = async (rolls: Record<string, number>) => {
    setBusy(true);
    try {
      await setInitiatives(ctx.sceneId, rolls);
      return true;
    } catch (err) {
      toast.error(err, 'Roll initiative');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const rollOne = async (t: InitiativeToken) => {
    const r = rollInit(bonusOf(bonus[t.id] ?? '', t.mod), adv[t.id] === 'adv', adv[t.id] === 'dis');
    if (!(await save({ [t.id]: r.total }))) return;
    share(toChatRoll(r, `Initiative · ${t.name}`));
    // Rolled after all (joined the fight late): no longer sitting out.
    if (out.includes(t.id)) setSittingOut(ctx.sceneId, out.filter((x) => x !== t.id));
  };
  const rollAll = async () => {
    const picks = dmList.filter(ticked);
    if (!picks.length) return;
    const results = picks.map((t) => ({ t, r: rollInit(bonusOf(bonus[t.id] ?? '', t.mod), adv[t.id] === 'adv', adv[t.id] === 'dis') }));
    if (!(await save(Object.fromEntries(results.map(({ t, r }) => [t.id, r.total]))))) return;
    const sorted = [...results].sort((a, b) => b.r.total - a.r.total);
    note(`Initiative rolled: ${sorted.map(({ t, r }) => `${t.name} ${r.total}`).join(', ')}`);
  };

  const picked = dmList.filter(ticked).length;
  return (
    <div className="border-t border-stone-800 bg-stone-900/50">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-1.5 text-left" aria-expanded={open}>
        <Swords size={14} className="text-amber-400" />
        <span className="flex-1 text-xs font-semibold text-stone-200">
          {ctx.asDM ? `Initiative · ${list.length} still to roll` : 'Roll for initiative'}
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <div className="scrollbar-thin max-h-60 space-y-1 overflow-y-auto px-3 pb-2">
          {list.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5">
              {ctx.asDM && <input type="checkbox" className="size-4 shrink-0 accent-amber-500" checked={ticked(t)} onChange={() => toggle(t)} aria-label={`${t.name} takes part`} title={t.player ? 'Roll for this player too' : 'Takes part in this fight'} />}
              <span className={clsx('min-w-0 flex-1 truncate text-sm', t.hidden ? 'text-stone-500 italic' : 'text-stone-200', ctx.asDM && !ticked(t) && (t.player ? 'opacity-60' : 'line-through opacity-50'))}>
                {t.name}
                {ctx.asDM && t.player && <span className="ml-1 text-[10px] text-stone-500 not-italic">{ticked(t) ? "you’re rolling" : "rolls their own"}</span>}
              </span>
              <label className="flex items-center gap-1 text-[10px] text-stone-500" title="Initiative bonus (DEX, plus anything else you add)">
                d20
                <input
                  className="w-10 rounded border border-stone-700 bg-stone-950 py-0.5 text-center text-xs tabular-nums text-stone-100"
                  inputMode="numeric"
                  value={bonus[t.id] ?? signed(t.mod)}
                  onChange={(e) => setBonus((b) => ({ ...b, [t.id]: e.target.value.slice(0, 4) }))}
                  aria-label={`Initiative bonus for ${t.name}`}
                />
              </label>
              {/* Advantage or disadvantage (one at most; click again to switch it off). */}
              {(['adv', 'dis'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={adv[t.id] === k}
                      onClick={() => setAdv((a) => ({ ...a, [t.id]: a[t.id] === k ? undefined : k }))}
                      className={clsx('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', adv[t.id] === k ? 'bg-amber-500 text-stone-950' : 'text-stone-400 ring-1 ring-stone-700 hover:text-stone-200')}
                      title={k === 'adv' ? 'Advantage: roll twice, keep the higher' : 'Disadvantage: roll twice, keep the lower'}
                    >
                      {k === 'adv' ? 'Adv' : 'Dis'}
                    </button>
                  ))}
              {!ctx.asDM && (
                <>
                  <button type="button" className="btn btn-primary btn-sm px-2" onClick={() => rollOne(t)} disabled={busy}>
                    <Dices size={14} /> Roll
                  </button>
                </>
              )}
              {ctx.asDM && (
                <button type="button" className="btn-icon-sm size-7" onClick={() => rollOne(t)} disabled={busy} aria-label={`Roll initiative for ${t.name}`} title="Roll just this one">
                  <Dices size={14} />
                </button>
              )}
            </div>
          ))}
          {ctx.asDM && (
            <div className="flex items-center gap-2 pt-1">
              <button type="button" className="btn btn-primary btn-sm flex-1" onClick={rollAll} disabled={busy || picked === 0}>
                <Dices size={14} /> Roll for {picked} {picked === 1 ? 'creature' : 'creatures'}
              </button>
            </div>
          )}
          {ctx.asDM && <p className="text-[10px] text-stone-500">Untick creatures that aren’t in this fight: they stay out of the order. Players roll their own unless you tick them.</p>}
        </div>
      )}
    </div>
  );
}
