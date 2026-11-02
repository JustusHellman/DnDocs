import { Dices, Plus } from 'lucide-react';
import { openPlay } from '../../lib/play/ui';
import { useToast } from '../../contexts/ToastContext';
import { attack, attackNumbers } from '../../lib/play/attacks';
import type { PlayerApi } from '../../lib/play/usePlayer';

/** A character's attacks with a Roll button each (to hit and damage in the chat; in a fight it also marks the action). */
export default function AttackList({ p, hint }: { p: PlayerApi; hint?: boolean }) {
  const toast = useToast();
  const list = p.def.attacks ?? [];
  if (!list.length)
    return hint && p.canEdit ? (
      <button type="button" className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300" onClick={() => openPlay({ kind: 'settings', entityId: p.entity.id })}>
        <Plus size={12} /> Add your weapons (they roll to hit and damage in one tap)
      </button>
    ) : null;
  return (
    <div className="space-y-0.5">
      <div className="label mb-0.5">Attacks</div>
      {list.map((a) => {
        const n = attackNumbers(a, p.d);
        return (
          <button
            key={a.id}
            type="button"
            disabled={!p.canEdit}
            onClick={() => attack(p, a).then((warn) => warn && toast.show(warn))}
            className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-stone-900 disabled:cursor-default"
          >
            <Dices size={15} className="shrink-0 text-amber-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-stone-100">{a.name}</span>
              <span className="block truncate text-[11px] text-stone-500">
                {n.hit >= 0 ? '+' : ''}
                {n.hit} to hit · {n.dmg} {a.ty ?? ''}
                {a.cost === 'bonus' ? ' · bonus action' : ''}
                {a.note ? ` · ${a.note}` : ''}
              </span>
            </span>
            {p.canEdit && <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-semibold text-stone-950 opacity-90 group-hover:opacity-100">Roll</span>}
          </button>
        );
      })}
    </div>
  );
}
