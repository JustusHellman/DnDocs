import clsx from 'clsx';
import { MapPin } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { usePeek } from '../../contexts/PeekContext';
import { fieldsFor, QUEST_STATUS_TONE, typeMeta } from '../../lib/entityTypes';
import { excerpt } from '../../lib/text';
import type { Entity } from '../../types';
import { useDragSource } from '../layout/drag';
import { TypeTile, VisibilityBadge } from '../ui/bits';

function useCardInfo(entity: Entity) {
  const { canViewField, entityMap, canView } = useCampaignData();
  const meta = typeMeta(entity.type);
  const summary = meta.summaryKeys
    .filter((k) => k !== 'status' && canViewField(entity, k))
    .map((k) => {
      const v = entity.attributes?.[k];
      const f = fieldsFor(entity.type).find((x) => x.key === k);
      if (v === undefined || v === null || v === '' || f?.type === 'textarea') return null;
      if (f?.type === 'entity-select') return entityMap.get(String(v))?.name ?? null;
      return String(v);
    })
    .filter(Boolean)
    .join(' · ');
  const parent = entity.locationId ? entityMap.get(entity.locationId) : undefined;
  const location = parent && canView(parent) && canViewField(entity, 'locationId') ? parent.name : null;
  const status = entity.type === 'quest' && canViewField(entity, 'status') ? (entity.attributes?.status as string | undefined) : undefined;
  const short = canViewField(entity, 'shortDescription') ? entity.attributes?.shortDescription : '';
  const text = excerpt(short || (canViewField(entity, 'content') ? entity.content : ''), 180);
  const tags = canViewField(entity, 'tags') ? entity.tags ?? [] : [];
  const thumb = canViewField(entity, 'imageUrls') ? entity.coverThumb : null;
  return { summary, location, status, text, tags, thumb };
}

/** Clickable entity summary. `layout="row"` for lists, `"card"` for grids. */
export default function EntityCard({ entity, layout = 'card', showType = true }: { entity: Entity; layout?: 'card' | 'row'; showType?: boolean }) {
  const { isDM } = useAuth();
  const { peek } = usePeek();
  const drag = useDragSource({ entryId: entity.id, label: entity.name, type: entity.type });
  const { summary, location, status, text, tags, thumb } = useCardInfo(entity);

  return (
    <button
      type="button"
      {...drag}
      onClick={(e) => peek(entity, { newSlot: e.ctrlKey || e.metaKey })}
      className={clsx(
        'group flex w-full gap-3 text-left transition-colors',
        layout === 'card' ? 'card h-full p-4 hover:border-amber-500/40' : 'rounded-xl px-3 py-3 hover:bg-stone-900/80',
      )}
    >
      {showType && <TypeTile type={entity.type} size={layout === 'card' ? 'md' : 'sm'} thumb={thumb} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate font-sans text-[15px] font-semibold text-stone-100 group-hover:text-amber-300">{entity.name}</h3>
          {status && <span className={clsx('chip shrink-0', QUEST_STATUS_TONE[status])}>{status}</span>}
          {isDM && entity.type !== 'note' && <VisibilityBadge entity={entity} compact className="shrink-0" />}
        </div>
        {(summary || location) && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-stone-400">
            {summary}
            {summary && location && <span className="text-stone-600">·</span>}
            {location && (
              <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
                <MapPin size={11} className="shrink-0" />
                {location}
              </span>
            )}
          </p>
        )}
        {text && <p className={clsx('mt-1.5 text-sm text-stone-400', layout === 'card' ? 'line-clamp-3' : 'line-clamp-1')}>{text}</p>}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 4).map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
            {tags.length > 4 && <span className="tag text-stone-500">+{tags.length - 4}</span>}
          </div>
        )}
      </div>
    </button>
  );
}
