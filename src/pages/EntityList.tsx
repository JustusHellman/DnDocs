import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { LayoutGrid, List, Plus, Search, SearchX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData, useVisibleEntities } from '../contexts/CampaignDataContext';
import { isEntityType, typeMeta } from '../lib/entityTypes';
import { visibilityOf, type Visibility } from '../lib/permissions';
import { parseQuery, scoreEntity } from '../lib/search';
import type { Entity } from '../types';
import EntityCard from '../components/entity/EntityCard';
import { EmptyState, Page, PageHeader, Segmented, Skeleton, TypeTile } from '../components/ui/bits';

type Sort = 'name' | 'updated' | 'created';
type View = 'grid' | 'list';

const QUEST_ORDER = ['Active', 'Rumored', 'On Hold', 'Completed', 'Failed', ''];

function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial;
    } catch {
      return initial;
    }
  });
  return [
    value,
    (v) => {
      setValue(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        /* ignore */
      }
    },
  ];
}

export default function EntityList() {
  const { type } = useParams<{ type: string }>();
  const { isDM, user } = useAuth();
  const { loading, canViewField } = useCampaignData();
  const visible = useVisibleEntities();
  const [term, setTerm] = useState('');
  const [sort, setSort] = usePref<Sort>('list:sort', 'name');
  const [view, setView] = usePref<View>('list:view', 'grid');
  const [vis, setVis] = useState<'all' | Visibility | 'mine'>('all');

  useEffect(() => {
    setTerm('');
    setVis('all');
  }, [type]);

  const items = useMemo(() => {
    if (!isEntityType(type)) return [];
    const q = parseQuery(term);
    return visible
      .filter((e) => e.type === type)
      .filter((e) => (vis === 'all' ? true : vis === 'mine' ? e.ownerId === user?.uid : visibilityOf(e) === vis))
      .filter((e) => !term.trim() || scoreEntity(e, q, canViewField) > 0)
      .sort((a, b) =>
        sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : a.name.localeCompare(b.name),
      );
  }, [visible, type, term, sort, vis, canViewField, user?.uid]);

  if (!isEntityType(type)) return <Navigate to="/search" replace />;
  const meta = typeMeta(type);
  const canCreate = isDM || type === 'note';

  const groups: { title: string | null; items: Entity[] }[] =
    type === 'quest'
      ? QUEST_ORDER.map((s) => ({
          title: s || 'No status',
          items: items.filter((e) => ((canViewField(e, 'status') && (e.attributes?.status as string)) || '') === s),
        })).filter((g) => g.items.length)
      : [{ title: null, items }];

  const filterOptions =
    type === 'note'
      ? [
          { value: 'all' as const, label: 'All' },
          { value: 'mine' as const, label: 'Mine' },
        ]
      : isDM
        ? [
            { value: 'all' as const, label: 'All' },
            { value: 'public' as const, label: 'Public' },
            { value: 'shared' as const, label: 'Shared' },
            { value: 'secret' as const, label: 'Secret' },
          ]
        : null;

  return (
    <Page wide>
      <PageHeader
        icon={<TypeTile type={type} size="lg" />}
        title={meta.plural}
        subtitle={loading ? 'Loading…' : `${items.length} ${items.length === 1 ? meta.label.toLowerCase() : meta.plural.toLowerCase()}`}
        actions={
          canCreate && (
            <Link to={`/entity/new?type=${type}`} className="btn btn-primary">
              <Plus size={16} /> New {meta.label.toLowerCase()}
            </Link>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-60">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" />
          <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={`Search ${meta.plural.toLowerCase()}…`} className="input pl-9" aria-label="Filter" />
        </div>
        {filterOptions && <Segmented size="sm" options={filterOptions} value={vis as never} onChange={(v) => setVis(v)} />}
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="input w-auto min-h-9 py-1 text-sm" aria-label="Sort">
          <option value="name">A → Z</option>
          <option value="updated">Recently updated</option>
          <option value="created">Newest</option>
        </select>
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'grid', label: '', icon: LayoutGrid },
            { value: 'list', label: '', icon: List },
          ]}
        />
      </div>

      {loading ? (
        <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : items.length === 0 ? (
        term || vis !== 'all' ? (
          <EmptyState icon={SearchX} title="No matches" />
        ) : (
          <EmptyState
            icon={meta.icon}
            title={`No ${meta.plural.toLowerCase()} yet`}
            action={
              canCreate && (
                <Link to={`/entity/new?type=${type}`} className="btn btn-primary">
                  <Plus size={16} /> Create one
                </Link>
              )
            }
          >
            {isDM || type === 'note' ? undefined : 'Your DM hasn’t shared any yet.'}
          </EmptyState>
        )
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.title ?? 'all'}>
              {g.title && (
                <h2 className="section-title mb-3">
                  {g.title} <span className="font-sans text-sm text-stone-500">{g.items.length}</span>
                </h2>
              )}
              {view === 'grid' ? (
                <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
                  {g.items.map((e) => (
                    <EntityCard key={e.id} entity={e} showType={false} />
                  ))}
                </div>
              ) : (
                <div className="card divide-y divide-stone-800/70 p-1.5">
                  {g.items.map((e) => (
                    <EntityCard key={e.id} entity={e} layout="row" showType={false} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
