import { useMemo } from 'react';
import { GiScrollUnfurled } from 'react-icons/gi';
import { Eye, Globe, MonitorUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData } from '../contexts/CampaignDataContext';
import { usePeek } from '../contexts/PeekContext';
import { EmptyState, Page, PageHeader, TypeTile } from '../components/ui/bits';
import { useDragSource } from '../components/layout/drag';
import type { Entity, RevealEvent } from '../types';
import { fieldLabel } from '../lib/entityTypes';

interface Item {
  entity: Entity;
  event: RevealEvent;
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/** Session log: everything the DM revealed, newest first, grouped by day. */
export default function Chronicle() {
  const { isDM, user } = useAuth();
  const { entities, canView } = useCampaignData();

  const days = useMemo(() => {
    const items: Item[] = [];
    for (const entity of entities) {
      if (!canView(entity)) continue;
      for (const event of entity.reveals ?? []) {
        if (!isDM && !(event.to.includes('*') || (user && event.to.includes(user.uid)))) continue;
        items.push({ entity, event });
      }
    }
    items.sort((a, b) => b.event.at - a.event.at);
    const groups: { day: string; items: Item[] }[] = [];
    for (const it of items) {
      const day = dayFmt.format(it.event.at);
      const last = groups[groups.length - 1];
      if (last?.day === day) last.items.push(it);
      else groups.push({ day, items: [it] });
    }
    return groups;
  }, [entities, canView, isDM, user]);

  return (
    <Page>
      <PageHeader
        icon={
          <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25">
            <GiScrollUnfurled size={28} />
          </div>
        }
        title="Chronicle"
        subtitle={isDM ? 'Everything you’ve revealed to the party, session by session.' : 'Everything the DM has revealed to you, session by session.'}
      />
      {days.length === 0 ? (
        <EmptyState icon={Eye} title="Nothing revealed yet">
          {isDM ? 'When you use “Reveal” on an entry (or share it in the editor), it’s noted here.' : 'When the DM reveals something to you, it shows up here.'}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {days.map((g) => (
            <section key={g.day}>
              <h2 className="section-title mb-3">{g.day}</h2>
              <ol className="card divide-y divide-stone-800/70 overflow-hidden">
                {g.items.map((it, i) => (
                  <Row key={`${it.entity.id}-${it.event.at}-${i}`} {...it} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}

function Row({ entity, event }: Item) {
  const { isDM } = useAuth();
  const { memberName, canViewField } = useCampaignData();
  const { peek } = usePeek();
  const drag = useDragSource({ entryId: entity.id, label: entity.name, type: entity.type });
  const everyone = event.to.includes('*');
  const who = everyone ? 'everyone' : isDM ? event.to.map((u) => memberName(u)).join(', ') : 'you';
  const fields = (event.fields ?? []).filter((k) => canViewField(entity, k)).map((k) => fieldLabel(entity.type, k));
  const what = fields.length ? `Revealed ${fields.join(', ')} to ${who}` : `Revealed to ${who}`;
  return (
    <li>
      <button type="button" {...drag} onClick={(e) => peek(entity, { newSlot: e.ctrlKey || e.metaKey })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-900/60">
        <span className="w-12 shrink-0 text-xs text-stone-500 tabular-nums">{timeFmt.format(event.at)}</span>
        <TypeTile type={entity.type} size="sm" thumb={canViewField(entity, 'imageUrls') ? entity.coverThumb : null} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-stone-100">{entity.name}</span>
          <span className="flex items-center gap-1 truncate text-xs text-stone-500">
            {event.showOnly ? <MonitorUp size={12} /> : everyone ? <Globe size={12} /> : <Eye size={12} />}
            {event.showOnly ? `Shown on screens · ${who}` : what}
          </span>
        </span>
      </button>
    </li>
  );
}
