import { useState } from 'react';
import { Coffee, Moon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import RollField, { type RollOutcome } from './RollField';
import type { PlayerApi } from '../../lib/play/usePlayer';
import { hitDiceLeft, hitDieLeft, pactLeft, resourceLeft, slotsLeft } from '../../lib/play/model';
import { readHp } from '../../lib/hitPoints';
import { tableChat } from '../../lib/chat/bus';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Short rest: spend hit dice (roll them here or type what you rolled), then short-rest things come
 * back. Long rest: hit points, slots and resources back, and hit dice as the campaign's rules say.
 */
export default function RestDialog({ p, kind, onClose }: { p: PlayerApi; kind: 'short' | 'long'; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [die, setDie] = useState<RollOutcome | null>(null);
  const { d, live, edition } = p;
  const hp = readHp(p.entity.attributes, p.entity.dndStats?.hitPoints);
  const hdLeft = hitDiceLeft(d, live);
  const con = d.mods.con;
  // Multiclassed: pick which size of die to spend.
  const [picked, setDieSize] = useState<number | null>(null);
  // The die picked, or the biggest one still there.
  const dieSize = picked ?? d.hitDice.find((h) => hitDieLeft(d, live, h.die) > 0)?.die ?? d.hitDice[0]?.die ?? 8;
  const run = async (f: () => Promise<void>, close = true) => {
    setBusy(true);
    try {
      await f();
      if (close) onClose();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  };
  const backShort = d.resources.filter((r) => (r.rest === 'short' || r.shortOne) && resourceLeft(r, live) < r.max);
  const usedSlots = d.slots.reduce((a, max, i) => a + (max - slotsLeft(d, live, i + 1)), 0);
  const hdBack = edition === '2024' ? d.hitDiceMax : Math.max(1, Math.floor(d.hitDiceMax / 2));

  if (kind === 'short')
    return (
      <Modal
        open
        onClose={onClose}
        size="md"
        title={
          <span className="flex items-center gap-2">
            <Coffee size={18} /> Short rest · {p.entity.name}
          </span>
        }
        description="At least an hour of rest. Spend hit dice to heal, as many as you like, one at a time."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(p.shortRest)}>
              Finish short rest
            </button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between rounded-md bg-stone-950/50 px-3 py-2">
            <span className="text-stone-400">Hit points</span>
            <span className="font-display text-xl font-bold tabular-nums text-stone-100">
              {hp.current ?? '—'}
              <span className="text-sm text-stone-500">/{hp.max ?? '—'}</span>
            </span>
            <span className="text-stone-400">Hit dice</span>
            <span className="font-display text-xl font-bold tabular-nums text-stone-100">
              {hdLeft}
              <span className="text-sm text-stone-500">/{d.hitDiceMax}</span>
            </span>
          </div>
          {hdLeft > 0 ? (
            <div className="surface space-y-2 p-3">
              {d.hitDice.length > 1 && (
                <div className="flex items-center gap-2 text-xs text-stone-400">
                  Die
                  {d.hitDice.map((h) => (
                    <button key={h.die} type="button" disabled={!hitDieLeft(d, live, h.die)} onClick={() => (setDieSize(h.die), setDie(null))} className={(dieSize === h.die ? 'rounded-md bg-amber-500 px-2 py-0.5 font-semibold text-stone-950' : 'rounded-md px-2 py-0.5 ring-1 ring-stone-700') + ' disabled:opacity-40'}>
                      d{h.die} <span className="font-normal opacity-75">({hitDieLeft(d, live, h.die)} left)</span>
                    </button>
                  ))}
                </div>
              )}
              <RollField label={`Hit die (d${dieSize} ${signed(con)} CON)`} formula={`1d${dieSize}${con ? signed(con) : ''}`} value={die} onChange={setDie} hint="Type the total if you rolled at the table (die + CON)." />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!die || busy || !hitDieLeft(d, live, dieSize)}
                  onClick={() =>
                    run(async () => {
                      if (!die) return;
                      if (die.roll) tableChat.roll(die.roll);
                      await p.spendHitDie(dieSize, die.total);
                      setDie(null);
                    }, false)
                  }
                >
                  Heal {die ? Math.max(0, die.total) : ''} and spend the die
                </button>
              </div>
            </div>
          ) : (
            <p className="text-stone-500 italic">No hit dice left (they come back on a long rest).</p>
          )}
          <div>
            <div className="label">Comes back when you finish</div>
            <ul className="list-inside list-disc text-stone-300">
              {d.pact && pactLeft(d, live) < d.pact.n && <li>Pact slots</li>}
              {backShort.map((r) => (
                <li key={r.key}>
                  {r.name}
                  {r.shortOne && r.rest === 'long' ? ' (one use)' : ''}
                </li>
              ))}
              {!backShort.length && !(d.pact && pactLeft(d, live) < d.pact.n) && <li className="text-stone-500 italic">Nothing else is used up</li>}
            </ul>
            {d.resources.some((r) => r.key === 'arcanerecovery') && <p className="hint">Arcane Recovery: tick the slots back yourself on the tracker, then use it there.</p>}
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Moon size={18} /> Long rest · {p.entity.name}
        </span>
      }
      description="At least eight hours, mostly sleep."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => p.longRest())}>
            Take the long rest
          </button>
        </>
      }
    >
      <ul className="list-inside list-disc space-y-1 text-sm text-stone-300">
        <li>
          Hit points back to full{hp.max ? ` (${hp.max})` : ''}, temporary hit points gone, death saves cleared
        </li>
        {usedSlots > 0 && <li>All spell slots ({usedSlots} used)</li>}
        {d.pact && <li>Pact slots</li>}
        {d.resources.filter((r) => r.rest !== 'none').length > 0 && <li>{d.resources.filter((r) => r.rest !== 'none').map((r) => r.name).join(', ')}</li>}
        {d.hitDiceMax > 0 && (
          <li>
            Hit dice: {edition === '2024' ? 'all of them' : `up to half your total (${hdBack})`} · {Math.min(d.hitDiceMax, hdLeft + hdBack)}/{d.hitDiceMax} after
          </li>
        )}
        {(live.conc || live.re) && <li>Concentration and reaction end</li>}
      </ul>
      <p className="hint">{edition} rules (the DM can change this on the Members page).</p>
    </Modal>
  );
}
