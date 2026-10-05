import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, SearchX, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData, useIsDescendant, useVisibleEntities } from '../contexts/CampaignDataContext';
import { menuTypes, ENTITY_TYPES, PLACE_TYPES, TYPE_META, TYPES_BY_SIZE } from '../lib/entityTypes';
import { parseQuery, scoreEntity } from '../lib/search';
import { isEntityType } from '../lib/entityTypes';
import type { EntityType } from '../types';
import EntityCard from '../components/entity/EntityCard';
import EntityPicker from '../components/entity/EntityPicker';
import { EmptyState, Page, Skeleton, TypeTile } from '../components/ui/bits';

export default function Home() {
  const { currentCampaign, user, isDM } = useAuth();
  const { loading, error, canViewField } = useCampaignData();
  const visible = useVisibleEntities();
  const isDescendant = useIsDescendant();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const types = (params.get('types') ?? '').split(',').filter(isEntityType) as EntityType[];
  const within = params.get('in') ?? '';

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const toggleType = (t: EntityType) => {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t];
    update({ types: next.join(',') || null });
  };

  const filtering = !!q.trim() || types.length > 0 || !!within;

  const results = useMemo(() => {
    if (!filtering) return [];
    const query = parseQuery(q);
    return visible
      .filter((e) => (types.length ? types.includes(e.type) : true))
      .filter((e) => (within ? isDescendant(e, within) : true))
      .map((e) => ({ e, s: scoreEntity(e, query, canViewField) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || TYPES_BY_SIZE.indexOf(a.e.type) - TYPES_BY_SIZE.indexOf(b.e.type) || a.e.name.localeCompare(b.e.name))
      .map((x) => x.e);
  }, [filtering, q, visible, types, within, isDescendant, canViewField]);

  const counts = useMemo(() => {
    const c: Partial<Record<EntityType, number>> = {};
    visible.forEach((e) => (c[e.type] = (c[e.type] ?? 0) + 1));
    return c;
  }, [visible]);

  const recent = useMemo(() => [...visible].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8), [visible]);
  const activeQuests = useMemo(() => visible.filter((e) => e.type === 'quest' && e.attributes?.status === 'Active' && canViewField(e, 'status')), [visible, canViewField]);
  const places = useMemo(() => visible.filter((e) => PLACE_TYPES.includes(e.type)), [visible]);

  return (
    <Page>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-stone-50 sm:text-3xl">{currentCampaign?.name}</h1>
        <p className="mt-0.5 text-sm text-stone-400">
          Welcome back, {user?.displayName?.split(' ')[0]}. {isDM ? 'Everything you’ve written, in one place.' : 'Everything your party has discovered.'}
        </p>
      </div>

      {/* Search + filters */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-500" />
          <input
            type="search"
            value={q}
            onChange={(e) => update({ q: e.target.value || null })}
            placeholder="Search names, descriptions, #tags…"
            className="input h-12 pr-10 pl-11 text-base"
            aria-label="Search"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => update({ q: null })} className="btn-icon-sm absolute top-1/2 right-2 -translate-y-1/2">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2 @2xl:flex-row @2xl:items-center">
          <div className="scrollbar-none -mx-4 flex flex-1 gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            {menuTypes().map((t) => {
              const active = types.includes(t.value);
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleType(t.value)}
                  className={clsx(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    active ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-stone-800 bg-stone-900/60 text-stone-400 hover:border-stone-700 hover:text-stone-200',
                  )}
                >
                  <Icon size={13} />
                  {t.plural}
                  {counts[t.value] ? <span className="text-stone-500">{counts[t.value]}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="w-full md:w-64">
            <EntityPicker options={places} value={within} onChange={(id) => update({ in: id || null })} placeholder="Anywhere" />
          </div>
        </div>
        {filtering && (
          <div className="flex items-center justify-between text-sm text-stone-400">
            <span>
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              <X size={14} /> Clear filters
            </button>
          </div>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : filtering ? (
        results.length === 0 ? (
          <EmptyState icon={SearchX} title="Nothing found">
            Try fewer words, another type, or search for a #tag.
          </EmptyState>
        ) : (
          <div className="card divide-y divide-stone-800/70 p-1.5">
            {results.map((e) => (
              <EntityCard key={e.id} entity={e} layout="row" />
            ))}
          </div>
        )
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={isDM ? 'An empty world, full of possibility' : 'Nothing shared yet'}
          action={
            <Link to={isDM ? '/entity/new?type=settlement' : '/entity/new?type=note'} className="btn btn-primary">
              <Plus size={16} /> {isDM ? 'Create your first place' : 'Write a note'}
            </Link>
          }
        >
          {isDM
            ? 'Start with a country or settlement, then add the NPCs, shops and quests that live there.'
            : 'When your DM shares something it shows up here. Meanwhile you can keep your own notes.'}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {/* Browse by type */}
          <section>
            <h2 className="section-title mb-3">Browse</h2>
            <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3 @4xl:grid-cols-4">
              {ENTITY_TYPES.filter((t) => counts[t.value]).map((t) => {
                const Icon = t.icon;
                return (
                  <Link key={t.value} to={`/entities/${t.value}`} className="card flex items-center gap-3 p-3 transition hover:border-amber-500/40">
                    <TypeTile type={t.value} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-100">{t.plural}</div>
                      <div className="text-xs text-stone-500">{counts[t.value]}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {activeQuests.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="section-title">Active quests</h2>
                <Link to="/entities/quest" className="text-xs text-stone-400 hover:text-amber-300">
                  All {TYPE_META.quest.plural.toLowerCase()}
                </Link>
              </div>
              <div className="grid gap-3 @2xl:grid-cols-2">
                {activeQuests.slice(0, 4).map((e) => (
                  <EntityCard key={e.id} entity={e} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="section-title mb-3">Recently updated</h2>
            <div className="card divide-y divide-stone-800/70 p-1.5">
              {recent.map((e) => (
                <EntityCard key={e.id} entity={e} layout="row" />
              ))}
            </div>
          </section>
        </div>
      )}
    </Page>
  );
}
