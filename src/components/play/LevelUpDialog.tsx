import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowUpCircle, Dices } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useToast } from '../../contexts/ToastContext';
import { levelUpCharacter } from '../../lib/entityService';
import { CLASS_IDS, className, hitDieOf, type PlayDef } from '../../lib/play/model';
import { averageHp, bumpClassText, whatChanges } from '../../lib/play/levelUp';
import { readHp } from '../../lib/hitPoints';
import { rollDie } from '../../lib/dice';
import { tableChat } from '../../lib/chat/bus';
import type { PlayerApi } from '../../lib/play/usePlayer';

/**
 * Level up: which class gets the level (or a new one, multiclassing), the hit points (roll the
 * die or take the average, plus CON), and a list of everything that changes, so new slots,
 * features and spells to pick don't go unnoticed.
 */
export default function LevelUpDialog({ p, onClose }: { p: PlayerApi; onClose: () => void }) {
  const toast = useToast();
  const [cls, setCls] = useState(p.d.classes[0]?.cls ?? 'fighter');
  const [hpMode, setHpMode] = useState<'average' | 'roll'>('average');
  const [rolled, setRolled] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const text = String(p.entity.attributes?.classLevel ?? '');
  const input = { classLevel: text, stats: p.entity.dndStats ?? undefined, def: p.def };
  const { before, after, change } = useMemo(() => whatChanges(input, cls, p.edition), [cls, text, p.def, p.edition]); // eslint-disable-line react-hooks/exhaustive-deps
  const die = hitDieOf(cls, p.edition);
  const con = p.d.mods.con;
  const fromDie = hpMode === 'average' ? averageHp(die) : rolled;
  const gain = fromDie === null ? null : Math.max(1, fromDie + con);
  const hp = readHp(p.entity.attributes, p.entity.dndStats?.hitPoints);
  const isNew = !before.classes.some((c) => c.cls === cls);
  const nextLevel = (before.classes.find((c) => c.cls === cls)?.lvl ?? 0) + 1;

  const roll = () => {
    const r = rollDie(die);
    setRolled(r);
    setHpMode('roll');
    tableChat.roll({ l: `${p.entity.name.split(' ')[0]}: hit points for ${className(cls)} ${nextLevel}`, f: `1d${die}`, t: r, d: [{ s: die, v: [r] }], m: 0 });
  };
  const confirm = async () => {
    if (gain === null) return;
    setBusy(true);
    try {
      // The tracker's own class list (when it has one) follows; otherwise the text says it all.
      const play: PlayDef | undefined = p.def.classes?.length ? { ...p.def, classes: after.classes } : undefined;
      await levelUpCharacter(p.entity.id, {
        classLevel: bumpClassText(text, cls),
        maxHp: hp.max !== null ? String(hp.max + gain) : String(p.entity.dndStats?.hitPoints ?? ''),
        currentHp: String((hp.current ?? hp.max ?? 0) + gain),
        ...(play ? { play: play as unknown as Record<string, unknown> } : {}),
      });
      await tableChat.event({ t: 'me', text: `reaches level ${after.level} (${className(cls)} ${nextLevel}, +${gain} HP)` });
      toast.success(`${p.entity.name} is level ${after.level}`);
      onClose();
    } catch (err) {
      toast.error(err, 'Level up');
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
          <ArrowUpCircle size={18} className="text-amber-400" /> Level up · {p.entity.name}
        </span>
      }
      description={`Level ${before.level} → ${after.level}`}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || gain === null} onClick={confirm}>
            Level up{gain !== null ? ` (+${gain} HP)` : ''}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="label mb-0">The level goes to</span>
          <select className="input w-auto py-1" value={cls} onChange={(e) => (setCls(e.target.value), setRolled(null), setHpMode('average'))} aria-label="Class">
            {before.classes.map((c) => (
              <option key={c.cls} value={c.cls}>
                {className(c.cls)} {c.lvl} → {c.lvl + 1}
              </option>
            ))}
            <optgroup label="A new class (multiclass)">
              {CLASS_IDS.filter((c) => !before.classes.some((x) => x.cls === c)).map((c) => (
                <option key={c} value={c}>
                  {className(c)} 1
                </option>
              ))}
            </optgroup>
          </select>
          {isNew && <span className="text-xs text-amber-200">Multiclassing usually needs 13 in the new class's main ability.</span>}
        </div>
        <div>
          <div className="label">Hit points</div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-300">
            <button type="button" onClick={() => setHpMode('average')} className={clsx('rounded-md px-2.5 py-1 ring-1', hpMode === 'average' ? 'bg-amber-500/15 text-amber-100 ring-amber-500/60' : 'ring-stone-700')}>
              Average: {averageHp(die)}
            </button>
            <button type="button" onClick={roll} className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1 ring-1', hpMode === 'roll' ? 'bg-amber-500/15 text-amber-100 ring-amber-500/60' : 'ring-stone-700')}>
              <Dices size={13} /> {rolled === null ? `Roll a d${die}` : `Rolled ${rolled} (again?)`}
            </button>
            <span>
              {con >= 0 ? '+' : '−'} {Math.abs(con)} CON = <b className="text-lg text-emerald-300">+{gain ?? '?'}</b>
              {hp.max !== null && gain !== null && <span className="text-stone-500"> · max {hp.max} → {hp.max + gain}</span>}
            </span>
          </div>
        </div>
        <div>
          <div className="label">What changes</div>
          <ul className="space-y-1 text-sm text-stone-200">
            {change.lines.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-400">•</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
