import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GiKnapsack } from 'react-icons/gi';
import { Modal } from '../ui/Modal';
import type { Entity, Token } from '../../types';
import type { CodexOpen } from '../../pages/Codex';

/** The Scavenger's Codex creature a token stands for: its own, or its monster entry's. */
export function tokenCodexRef(t: Token, entityMap: Map<string, Entity>): string | null {
  if (t.codexRef) return t.codexRef;
  const e = t.entityId ? entityMap.get(t.entityId) : undefined;
  const ref = e?.attributes?.codexRef;
  return typeof ref === 'string' && ref ? ref : null;
}

interface Row {
  id: string;
  name: string;
  onMap: number;
  down: number;
}

/** DM: send the creatures that fell in this battle to the Codex's after-the-fight harvest. */
export default function HarvestModal({ open, onClose, tokens, entityMap }: { open: boolean; onClose: () => void; tokens: Token[]; entityMap: Map<string, Entity> }) {
  const navigate = useNavigate();
  const rows = useMemo<Row[]>(() => {
    const by = new Map<string, Row>();
    for (const t of tokens) {
      const id = tokenCodexRef(t, entityMap);
      if (!id || t.controlledBy.length) continue;
      const r = by.get(id) ?? { id, name: t.name.replace(/ \d+$/, ''), onMap: 0, down: 0 };
      r.onMap++;
      if (t.health === 'down') r.down++;
      by.set(id, r);
    }
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tokens, entityMap]);
  // Start with the ones marked down; if nobody tracked HP, assume they all fell.
  const anyDown = rows.some((r) => r.down > 0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const countOf = (r: Row) => counts[r.id] ?? (anyDown ? r.down : r.onMap);
  const fight = rows.map((r) => ({ id: r.id, n: countOf(r) })).filter((x) => x.n > 0);

  const go = () => {
    onClose();
    navigate('/codex', { state: { codexOpen: { fight } satisfies CodexOpen } });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Harvest the fallen"
      description="Sends these creatures to the Scavenger's Codex. Roll the harvest there; the parts go into the party satchel."
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={go} disabled={!fight.length}>
            <GiKnapsack size={16} /> Harvest in the Codex
          </button>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-stone-400">
          No creatures here are linked to the Codex. Add them with <b>Add tokens → From the Codex</b>, or link a monster entry to its Codex creature.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-stone-200">{r.name}</span>
              <span className="text-xs text-stone-500">{r.down ? `${r.down} down of ${r.onMap}` : `${r.onMap} on the map`}</span>
              <input
                type="number"
                min={0}
                max={99}
                className="input w-20"
                aria-label={`How many ${r.name} to harvest`}
                value={countOf(r)}
                onChange={(e) => setCounts((c) => ({ ...c, [r.id]: Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)) }))}
              />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
