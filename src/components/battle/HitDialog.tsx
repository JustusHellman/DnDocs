import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Dices, Flame, Heart } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { parseFormula, rollFormula } from '../../lib/dice';
import { tableChat } from '../../lib/chat/bus';
import { toChatRoll } from '../../lib/chat/rolls';
import { damageTokens, healTokens, hpNow, saveBonus } from '../../lib/battle/applyDamage';
import { applyHp, readHp } from '../../lib/hitPoints';
import { tableLive } from '../../lib/play/live';
import { abilityName } from '../../lib/play/spells';
import type { AreaHit } from '../../lib/play/ui';
import type { Entity, Scene, Token } from '../../types';
import { editionOf, massiveDamageOf } from '../../lib/play/rules';

type Outcome = 'fail' | 'save';
type Takes = 1 | 0.5 | 0 | 2;
const TAKES: { value: Takes; label: string }[] = [
  { value: 1, label: 'normal' },
  { value: 0.5, label: 'resistant (½)' },
  { value: 2, label: 'vulnerable (×2)' },
  { value: 0, label: 'immune (0)' },
];

/**
 * Damage (or healing) about to go on tokens, shown before anything changes: who, how much (typed,
 * or rolled again), saves (the monsters' rolled here from their stat blocks, the characters' as
 * their players say), resistances, and each one's hit points before → after. Nothing happens until
 * Apply; Undo puts every hit point back. `send`: a player's hit on someone they can't change — it
 * goes to the DM in the chat instead.
 */
export default function HitDialog({
  scene,
  spell,
  hit,
  caught,
  entityOf,
  statTextOf,
  secretHp,
  onUndoable,
  onClose,
  kind = 'damage',
  onSend,
}: {
  scene: Scene;
  spell: string;
  hit: AreaHit;
  kind?: 'damage' | 'heal';
  /** Instead of applying: send it (with the chosen amounts) to the DM. */
  onSend?: (rows: { token: Token; entity?: Entity; amount: number }[], total: number) => Promise<unknown>;
  caught: Token[];
  entityOf: (t: Token) => Entity | undefined;
  statTextOf: (t: Token) => string | null;
  secretHp: Record<string, { cur: number; max: number }>;
  onUndoable: (label: string, run: () => Promise<unknown>, announce?: boolean) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const { currentCampaign } = useAuth();
  const [total, setTotal] = useState(hit.total !== undefined ? String(hit.total) : '');
  const [dc, setDc] = useState(hit.dc !== undefined ? String(hit.dc) : '');
  const [busy, setBusy] = useState(false);
  const isChar = (t: Token) => entityOf(t)?.type === 'character';
  // Monsters' saves are rolled straight away (the DM sees them); characters' are their players' to roll.
  const heal = kind === 'heal';
  const saves = !heal && !!hit.save;
  const [rows, setRows] = useState(() =>
    caught.map((t) => {
      const bonus = saves ? saveBonus(hit.save!, entityOf(t), statTextOf(t)) : 0;
      const roll = saves && !isChar(t) && !onSend ? rollFormula(parseFormula(`1d20${bonus >= 0 ? '+' : ''}${bonus}`)!) : null;
      return { id: t.id, on: true, bonus, roll: roll?.total ?? null, nat: roll?.natural ?? null, outcome: null as Outcome | null, takes: 1 as Takes };
    }),
  );
  const dcNum = Number(dc) || null;
  const outcomeOf = (r: (typeof rows)[number]): Outcome => r.outcome ?? (r.roll !== null && dcNum !== null ? (r.roll >= dcNum ? 'save' : 'fail') : 'fail');
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const amountOf = (r: (typeof rows)[number]) => {
    if (heal) return n;
    const base = saves && outcomeOf(r) === 'save' ? (hit.half ? Math.floor(n / 2) : 0) : n;
    return Math.floor(base * r.takes);
  };
  const set = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const byId = useMemo(() => new Map(caught.map((t) => [t.id, t])), [caught]);

  const rollDamage = () => {
    const f = hit.dmg ? parseFormula(hit.dmg) : null;
    if (!f) return;
    const r = rollFormula(f);
    tableChat.roll(toChatRoll(r, `${spell} ${heal ? 'healing' : 'damage'}`));
    setTotal(String(r.total));
  };
  const apply = async () => {
    if (!currentCampaign) return;
    setBusy(true);
    try {
      const items = rows.filter((r) => r.on).map((r) => ({ token: byId.get(r.id)!, entity: entityOf(byId.get(r.id)!), amount: amountOf(r) }));
      if (onSend) {
        await onSend(items, n);
        toast.show(heal ? 'Sent: their player or the DM applies it from the chat.' : 'Sent: the DM applies it from the chat.');
        onClose();
        return;
      }
      const { undo, notes } = heal
        ? await healTokens({ scene, items, secretHp })
        : await damageTokens({ scene, items, secretHp, edition: editionOf(currentCampaign), massiveRule: massiveDamageOf(currentCampaign), table: tableLive(), dmId: currentCampaign.dmId });
      onUndoable(`${spell}: ${heal ? 'healing' : 'damage'} to ${items.map((i) => i.token.name).join(', ')}`, undo, true);
      notes.forEach((m) => toast.show(m));
      onClose();
    } catch (err) {
      toast.error(err, spell);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          {heal ? <Heart size={18} className="text-emerald-400" /> : <Flame size={18} className="text-amber-400" />} {spell} · {caught.length === 1 ? caught[0].name : `${caught.length} creatures`}
        </span>
      }
      description={
        onSend
          ? `From ${hit.by}. ${heal ? 'Their player or the DM' : 'The DM'} applies it from the chat (and can still change it).`
          : `From ${hit.by}. Nothing changes until you press Apply${caught.length > 1 ? '; untick anyone it shouldn’t touch' : ''}.`
      }
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Not now
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !n || !rows.some((r) => r.on)} onClick={apply}>
            {onSend ? (heal ? 'Send it to them' : 'Send to the DM') : heal ? 'Apply the healing' : 'Apply the damage'}
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="label">{heal ? 'Healing' : `Damage${hit.ty ? ` (${hit.ty})` : ''}`}</span>
          <span className="flex items-center gap-1.5">
            <input className="input w-20 text-center text-lg font-semibold" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="—" aria-label={heal ? 'Healing total' : 'Damage total'} />
            {hit.dmg && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={rollDamage}>
                <Dices size={13} /> {total ? 'Roll again' : 'Roll'} {hit.dmg}
              </button>
            )}
          </span>
        </label>
        {saves && (
          <label className="block text-sm">
            <span className="label">{abilityName(hit.save)} save DC</span>
            <input className="input w-20 text-center" inputMode="numeric" value={dc} onChange={(e) => setDc(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
        )}
        <p className="min-w-40 flex-1 text-xs text-stone-400">
          {heal ? 'Type another number, or roll again, any time before applying.' : saves ? `${hit.half ? 'Half damage on a successful save.' : 'No damage on a successful save.'} Characters roll their own saves: set what they got.` : 'Type another number, or roll again, any time before applying.'}
        </p>
      </div>
      <ul className="divide-y divide-stone-800 rounded-md border border-stone-800">
        {rows.map((r) => {
          const t = byId.get(r.id)!;
          const out = outcomeOf(r);
          return (
            <li key={r.id} className={clsx('flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm', !r.on && 'opacity-45')}>
              <input type="checkbox" className="accent-amber-500" checked={r.on} onChange={(e) => set(r.id, { on: e.target.checked })} aria-label={`Include ${t.name}`} />
              <span className="min-w-28 flex-1 font-semibold text-stone-100">
                {t.name}
                {saves && isChar(t) && <span className="ml-1 text-[11px] font-normal text-stone-500">(their player rolls)</span>}
                {!isChar(t) && !secretHp[t.id] && !onSend && <span className="ml-1 text-[11px] font-normal text-rose-300">(no HP set)</span>}
              </span>
              {saves && (
                <>
                  {r.roll !== null && (
                    <span className={clsx('text-xs tabular-nums', r.nat === 20 ? 'text-emerald-300' : r.nat === 1 ? 'text-rose-300' : 'text-stone-400')} title={`d20 ${r.nat} ${r.bonus >= 0 ? '+' : ''}${r.bonus}`}>
                      rolled {r.roll}
                    </span>
                  )}
                  <span className="flex overflow-hidden rounded-md ring-1 ring-stone-700">
                    {(['fail', 'save'] as const).map((o) => (
                      <button key={o} type="button" onClick={() => set(r.id, { outcome: o })} className={clsx('px-2 py-0.5 text-xs font-semibold', out === o ? (o === 'save' ? 'bg-emerald-600 text-white' : 'bg-rose-700 text-white') : 'text-stone-400 hover:text-stone-200')}>
                        {o === 'save' ? 'Saved' : 'Failed'}
                      </button>
                    ))}
                  </span>
                </>
              )}
              {!heal && <select className="input w-auto py-0.5 text-xs" value={r.takes} onChange={(e) => set(r.id, { takes: Number(e.target.value) as Takes })} aria-label={`${t.name} takes`}>
                {TAKES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>}
              <b className={clsx('w-10 text-right tabular-nums', heal ? 'text-emerald-300' : 'text-amber-300')}>{r.on ? `${heal ? '+' : ''}${amountOf(r)}` : '—'}</b>
              {/* A player sending it sees only characters' numbers (a monster's hit points are the DM's). */}
              <HpAfter t={t} e={entityOf(t)} secretHp={onSend ? {} : secretHp} amount={r.on ? amountOf(r) : 0} heal={heal} />
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** "31 → 24 HP" (what this screen knows: a player sees only the characters' numbers). */
function HpAfter({ t, e, secretHp, amount, heal }: { t: Token; e: Entity | undefined; secretHp: Record<string, { cur: number; max: number }>; amount: number; heal: boolean }) {
  const now = hpNow(t, e, secretHp);
  if (!now) return <span className="w-24 text-right text-[11px] text-stone-500">{t.health}</span>;
  let after: number;
  if (e?.type === 'character') after = applyHp(readHp(e.attributes, e.dndStats?.hitPoints), heal ? 'heal' : 'damage', amount).current ?? now.cur;
  else after = heal ? Math.min(now.max ?? Infinity, now.cur + amount) : Math.max(0, now.cur - amount);
  return (
    <span className="w-24 text-right text-xs text-stone-400 tabular-nums" title="Hit points before → after">
      {now.cur} → <b className={clsx(after <= 0 ? 'text-rose-300' : 'text-stone-100')}>{after}</b>
      {now.max !== null && <span className="text-stone-500">/{now.max}</span>}
    </span>
  );
}
