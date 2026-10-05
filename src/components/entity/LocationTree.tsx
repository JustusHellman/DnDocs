import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { usePeek } from '../../contexts/PeekContext';
import { TypeIcon } from '../ui/bits';
import { TYPES_BY_SIZE, typeMeta } from '../../lib/entityTypes';
import type { Entity } from '../../types';

export function useVisibleChildren(parentId: string, excludeNotes = true) {
  const { childrenOf, canView } = useCampaignData();
  return (childrenOf.get(parentId) ?? [])
    .filter((e) => canView(e) && (!excludeNotes || e.type !== 'note'))
    .sort((a, b) => TYPES_BY_SIZE.indexOf(a.type) - TYPES_BY_SIZE.indexOf(b.type) || a.name.localeCompare(b.name));
}

function Node({ entity, depth, ancestors, expandAll }: { entity: Entity; depth: number; ancestors: Set<string>; expandAll: boolean }) {
  const { peek } = usePeek();
  const children = useVisibleChildren(entity.id).filter((c) => !ancestors.has(c.id));
  const [open, setOpen] = useState(false);
  const isOpen = open || expandAll;
  const nextAncestors = new Set(ancestors).add(entity.id);

  return (
    <li>
      <div className="flex items-center gap-1" style={{ paddingLeft: depth * 16 }}>
        {children.length > 0 ? (
          <button
            type="button"
            className="btn-icon-sm size-7"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            aria-expanded={isOpen}
            onClick={() => setOpen(!isOpen)}
          >
            <ChevronRight size={14} className={clsx('transition-transform', isOpen && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
        <button
          type="button"
          onClick={(e) => peek(entity, { newSlot: e.ctrlKey || e.metaKey })}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-stone-200 hover:bg-stone-800/70"
        >
          <TypeIcon type={entity.type} className="shrink-0 text-stone-500" />
          <span className="truncate">{entity.name}</span>
          {children.length > 0 && <span className="ml-auto shrink-0 text-xs text-stone-500">{children.length}</span>}
        </button>
      </div>
      {isOpen && children.length > 0 && (
        <ul>
          {children.map((c) => (
            <Node key={c.id} entity={c} depth={depth + 1} ancestors={nextAncestors} expandAll={expandAll} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function LocationTree({ parentId, expandAll = false }: { parentId: string; expandAll?: boolean }) {
  const children = useVisibleChildren(parentId);
  if (children.length === 0) return null;
  return (
    <ul className="-mx-1">
      {children.map((c) => (
        <Node key={c.id} entity={c} depth={0} ancestors={new Set([parentId])} expandAll={expandAll} />
      ))}
    </ul>
  );
}

export function childSummary(children: Entity[]) {
  const counts = new Map<string, number>();
  children.forEach((c) => counts.set(c.type, (counts.get(c.type) ?? 0) + 1));
  return [...counts.entries()].map(([t, n]) => `${n} ${n === 1 ? typeMeta(t).label : typeMeta(t).plural}`).join(' · ');
}
