import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Brain, Crosshair, Undo2, Wand2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import SpellCard from './SpellCard';
import RollField, { type RollOutcome } from './RollField';
import { tableChat } from '../../lib/chat/bus';
import type { PlayerApi } from '../../lib/play/usePlayer';
import { ordinal, pactLeft, resourceLeft, slotsLeft } from '../../lib/play/model';
import { abilityName, castSummary, dmgAt, fromSelf, healAt, type Spell } from '../../lib/play/spells';
import { spellTone, useColoring } from '../../lib/play/coloring';
import { canPlaceArea, placeCastArea } from '../../lib/play/ui';
import { colorOf, useTableColors } from '../../lib/chat/colorStore';

type Via = { k: 'slot'; level: number } | { k: 'pact' } | { k: 'res'; key: string } | { k: 'ritual' } | { k: 'free' } | { k: 'cantrip' };
const viaId = (v: Via) => (v.k === 'slot' ? `slot${v.level}` : v.k === 'res' ? `res:${v.key}` : v.k);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Casting a spell: pick how (a slot of any level it can use, a pact slot, a free use from a
 * counter, as a ritual, or with no slot at all), then cast. The slot is used straight away and the
 * card goes to the chat; then the rolls, each one "roll it here", "I rolled…" or left alone; and
 * the area can be placed on the battle map. "Undo cast" gives everything back.
 */
export default function CastDialog({ p, sp, level, onClose }: { p: PlayerApi; sp: Spell; level?: number; onClose: () => void }) {
  const { d, live } = p;
  const colors = useTableColors();
  const options = useMemo(() => {
    const out: { via: Via; label: string; left: number | null; slot: number }[] = [];
    if (sp.l === 0) return [{ via: { k: 'cantrip' } as Via, label: 'Cantrip (no slot)', left: null, slot: 0 }];
    // Free uses tied to this spell (own counters), and a warlock's Mystic Arcanum for its level.
    for (const r of d.resources.filter((x) => x.spell === sp.i || x.key === `arcanum${sp.l}`)) out.push({ via: { k: 'res', key: r.key }, label: r.name, left: resourceLeft(r, live), slot: sp.l });
    d.slots.forEach((max, i) => i + 1 >= sp.l && max > 0 && out.push({ via: { k: 'slot', level: i + 1 }, label: `${ordinal(i + 1)}-level slot`, left: slotsLeft(d, live, i + 1), slot: i + 1 }));
    if (d.pact && d.pact.l >= sp.l) out.push({ via: { k: 'pact' }, label: `Pact slot (${ordinal(d.pact.l)})`, left: pactLeft(d, live), slot: d.pact.l });
    if (sp.ri) out.push({ via: { k: 'ritual' }, label: 'As a ritual (no slot, 10 minutes longer)', left: null, slot: sp.l });
    out.push({ via: { k: 'free' }, label: 'Without a slot (a scroll, an item, a feature…)', left: null, slot: sp.l });
    return out;
  }, [sp, d, live]);
  const first = (level ? options.find((o) => o.via.k === 'slot' && o.slot === level && (o.left ?? 1) > 0) : null) ?? options.find((o) => o.left === null ? o.via.k === 'cantrip' : o.left > 0) ?? options[options.length - 1];
  const [pick, setPick] = useState(() => viaId(first.via));
  const [phase, setPhase] = useState<'choose' | 'cast'>('choose');
  const [busy, setBusy] = useState(false);
  const [msgId, setMsgId] = useState<string | null>(null);
  const [prevConc, setPrevConc] = useState<{ on: boolean; cs?: string } | null>(null);
  const [rolls, setRolls] = useState<Record<string, RollOutcome | null>>({});
  const [crit, setCrit] = useState(false);
  const chosen = options.find((o) => viaId(o.via) === pick) ?? first;
  const slot = Math.max(sp.l, chosen.slot);
  const mod = d.ability ? d.mods[d.ability] : 0;
  const who = p.entity.name.split(' ')[0];

  const spend = async (v: Via) => {
    if (v.k === 'slot') return p.spendSlot(v.level, 'quiet');
    if (v.k === 'pact') return p.spendPact('quiet');
    if (v.k === 'res') {
      const r = d.resources.find((x) => x.key === v.key);
      return r ? p.spendRes(r, 1, 'quiet') : false;
    }
    return true;
  };
  const refund = async (v: Via) => {
    if (v.k === 'slot') await p.setSlotUsed(v.level, Math.max(0, (p.live.s?.[String(v.level)] ?? 0) - 1));
    else if (v.k === 'pact') await p.setPactUsed(Math.max(0, (p.live.p ?? 0) - 1));
    else if (v.k === 'res') {
      const r = d.resources.find((x) => x.key === v.key);
      if (r) await p.setResUsed(r, Math.max(0, (p.live.r?.[r.key] ?? 0) - 1));
    }
  };

  const cast = async () => {
    setBusy(true);
    try {
      if (!(await spend(chosen.via))) return;
      if (sp.k) {
        setPrevConc({ on: !!live.conc, cs: live.cs });
        await p.setConc(true, sp.n, true);
      }
      const via = chosen.via.k === 'slot' ? `${ordinal(slot)}-level slot` : chosen.via.k === 'pact' ? 'pact slot' : chosen.via.k === 'res' ? chosen.label.split(':')[0] : chosen.via.k === 'ritual' ? 'ritual' : chosen.via.k === 'cantrip' ? 'cantrip' : 'no slot';
      const dc = sp.sv && d.saveDC !== null ? ` · DC ${d.saveDC}` : '';
      const id = await tableChat.event({ t: 'cast', who, key: p.key, spell: sp.n, id: sp.i, lvl: sp.l, slot, via, sum: castSummary(sp, slot) + dc, ...(sp.k ? { conc: 1 as const } : {}) });
      setMsgId(id);
      setPhase('cast');
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    setBusy(true);
    try {
      await refund(chosen.via);
      if (prevConc) await p.setConc(prevConc.on, prevConc.cs, true);
      if (msgId) await tableChat.remove(msgId);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const done = async () => {
    const typed = Object.entries(rolls).filter(([, v]) => v && !v.roll) as [string, RollOutcome][];
    if (typed.length) await tableChat.event({ t: 'castres', who, spell: sp.n, parts: typed.map(([l, v]) => ({ l, v: v.total })) });
    onClose();
  };
  const setRoll = (label: string) => (v: RollOutcome | null) => {
    setRolls((r) => ({ ...r, [label]: v }));
    if (v?.roll) tableChat.roll(v.roll);
  };

  const dmg = dmgAt(sp, slot, d.level);
  const heal = healAt(sp, slot)?.replace(/\s*\+\s*MOD/i, mod ? signed(mod) : '');
  const tone = spellTone(sp, useColoring());

  return (
    <Modal
      open
      onClose={phase === 'cast' ? done : onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Wand2 size={18} style={{ color: tone }} /> {phase === 'choose' ? `Cast ${sp.n}` : `${sp.n} is cast`}
        </span>
      }
      description={phase === 'choose' ? `${p.entity.name}${d.saveDC !== null ? ` · spell DC ${d.saveDC} · attack ${signed(d.attack ?? 0)}` : ''}` : castSummary(sp, slot)}
      footer={
        phase === 'choose' ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={cast} disabled={busy || (chosen.left !== null && chosen.left <= 0)}>
              <Wand2 size={15} /> Cast{chosen.via.k === 'slot' ? ` at ${ordinal(slot)} level` : ''}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={undo} disabled={busy} title="Gives the slot back and takes the card out of the chat">
              <Undo2 size={15} /> Undo cast
            </button>
            <button type="button" className="btn btn-primary" onClick={done}>
              Done
            </button>
          </>
        )
      }
    >
      {phase === 'choose' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SpellCard sp={sp} charLevel={d.level} edition={p.edition} mod={mod} />
          <div className="space-y-2">
            <div className="label">Cast using</div>
            {options.map((o) => {
              const id = viaId(o.via);
              const none = o.left !== null && o.left <= 0;
              return (
                <label key={id} className={clsx('flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 ring-1', pick === id ? 'bg-amber-500/10 ring-amber-500/60' : 'ring-stone-800 hover:ring-stone-600', none && 'opacity-50')}>
                  <input type="radio" name="via" className="accent-amber-500" checked={pick === id} onChange={() => setPick(id)} disabled={none} />
                  <span className="flex-1 text-sm text-stone-200">{o.label}</span>
                  {o.left !== null && <span className={clsx('text-xs tabular-nums', none ? 'text-rose-400' : 'text-stone-400')}>{o.left} left</span>}
                </label>
              );
            })}
            {sp.k && live.conc && (
              <p className="flex items-start gap-1.5 rounded-md bg-sky-500/10 p-2 text-xs text-sky-200">
                <Brain size={14} className="mt-0.5 shrink-0" /> You’re concentrating{live.cs ? ` on ${live.cs}` : ''}: casting this ends it.
              </p>
            )}
            {slot > sp.l && sp.h && <p className="hint not-italic">{sp.h}</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sp.at && (
            <div className="surface space-y-2 p-3">
              <RollField label="Spell attack" formula={`1d20${signed(d.attack ?? 0)}`} value={rolls['Spell attack'] ?? null} onChange={setRoll('Spell attack')} />
              {dmg && (
                <label className="flex items-center gap-1.5 text-xs text-stone-400">
                  <input type="checkbox" className="accent-amber-500" checked={crit} onChange={(e) => setCrit(e.target.checked)} /> Critical hit (damage dice twice)
                </label>
              )}
            </div>
          )}
          {sp.sv && (
            <p className="flex items-center gap-2 rounded-md bg-stone-950/50 px-3 py-2 text-sm text-stone-300">
              <Crosshair size={15} className="text-amber-400" />
              Targets make a <b className="text-stone-100">{abilityName(sp.sv)}</b> save against <b className="text-stone-100">DC {d.saveDC ?? '?'}</b>
              {sp.sh === 'half' ? ' (half damage on a success)' : ''}.
            </p>
          )}
          {dmg && (
            <div className="surface p-3">
              <RollField label={`Damage${sp.dm?.ty ? ` (${sp.dm.ty.toLowerCase()})` : ''}`} formula={dmg} crit={crit} value={rolls.Damage ?? null} onChange={setRoll('Damage')} />
              {sp.sh === 'half' && rolls.Damage && <p className="hint not-italic">Half on a save: {Math.floor(rolls.Damage.total / 2)}</p>}
            </div>
          )}
          {heal && (
            <div className="surface p-3">
              <RollField label="Healing" formula={heal} value={rolls.Healing ?? null} onChange={setRoll('Healing')} />
            </div>
          )}
          {!dmg && !heal && !sp.at && !sp.sv && <p className="text-sm text-stone-400">Nothing to roll. The card is in the chat for everyone.</p>}
          {sp.a && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-stone-950/50 px-3 py-2 text-sm text-stone-300">
              <span className="flex-1">
                Area: <b className="text-stone-100">{sp.a.f}-ft {sp.a.k}</b>
                {fromSelf(sp) ? ', from you' : ''}
              </span>
              {canPlaceArea() ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    placeCastArea({ spell: sp.n, area: sp.a!, fromEntity: fromSelf(sp) ? p.entity.id : undefined, color: colorOf(colors, p.owner) });
                    done();
                  }}
                >
                  Place it on the map
                </button>
              ) : (
                <span className="text-xs text-stone-500">Open the battle map to place it.</span>
              )}
            </div>
          )}
          {sp.k && (
            <p className="flex items-center gap-1.5 text-xs text-sky-300">
              <Brain size={13} /> Concentrating on {sp.n} now.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
