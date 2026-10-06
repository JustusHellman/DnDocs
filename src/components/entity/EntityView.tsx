import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  Copy,
  Crown,
  Edit3,
  Eye,
  EyeOff,
  Lock,
  Map as MapIcon,
  MoreHorizontal,
  Plus,
  Skull,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useAncestors, useCampaignData } from '../../contexts/CampaignDataContext';
import { usePeek } from '../../contexts/PeekContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { baseType, fieldLabel, fieldsFor, permissionKeys, QUEST_STATUS_TONE, typeMeta, type FieldSchema } from '../../lib/entityTypes';
import { fieldState, planFieldToggle } from '../../lib/sharing';
import { applySharingUpdate, deleteEntity } from '../../lib/entityService';
import RevealButton from './RevealButton';
import { visibilityOf } from '../../lib/permissions';
import { excerpt, timeAgo } from '../../lib/text';
import type { Entity } from '../../types';
import { Avatar, EmptyState, Spinner, TypeBadge, TypeIcon, VisibilityBadge } from '../ui/bits';
import { useDragSource } from '../layout/drag';
import { MenuItem, Popover } from '../ui/Popover';
import { Markdown } from './Markdown';
import { ImageThumb, Lightbox } from './Images';
import { StatBlock } from './StatBlock';
import { LocationTree, useVisibleChildren } from './LocationTree';
import { RelationshipsSection } from './Relationships';
import QuickCreateModal from './QuickCreateModal';
import { useImageSrc } from '../../hooks/useImageSrc';

function Section({ title, children, action, className, eye }: { title: string; children: ReactNode; action?: ReactNode; className?: string; eye?: ReactNode }) {
  return (
    <section className={clsx('card p-4 sm:p-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="section-title min-w-0 flex-1">{title}</h2>
        {eye}
        {action}
      </div>
      {children}
    </section>
  );
}

/** DM-only switch next to a field: show it to everyone who can see the entry, or hide it again. */
function FieldEye({ entity, field, compact }: { entity: Entity; field: string; compact?: boolean }) {
  const { isDM } = useAuth();
  const { players } = useCampaignData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Leftover values outside the type's fields are never shown to players, so no switch for them.
  if (!isDM || entity.type === 'note' || !permissionKeys(entity.type).includes(field)) return null;
  const state = fieldState(entity, field, players);
  const label = fieldLabel(entity.type, field);
  const cfg = {
    shown: { icon: Eye, text: 'Players', tone: 'text-emerald-400 ring-emerald-600/40', title: `${label}: players who can see this entry see it. Click to hide.` },
    some: { icon: Users, text: 'Some', tone: 'text-sky-400 ring-sky-600/40', title: `${label}: only some players know this (use Reveal to tell more). Click to hide it.` },
    hidden: { icon: EyeOff, text: 'DM', tone: 'text-stone-500 ring-stone-700', title: `${label}: hidden from players. Click to reveal it.` },
    prepared: { icon: Eye, text: 'Ready', tone: 'text-amber-500 ring-amber-600/40', title: `${label}: will be shown once you reveal the entry. Click to keep it hidden.` },
  }[state];
  const Icon = cfg.icon;
  const click = async () => {
    setBusy(true);
    try {
      const plan = planFieldToggle(entity, field, players);
      await applySharingUpdate(entity.id, plan.update);
      if (plan.newFields.length) toast.success(`Revealed “${label}”`);
      else if (state === 'hidden') toast.show(`“${label}” will be shown when you reveal the entry`);
      else toast.show(`“${label}” is hidden from players`);
    } catch (err) {
      toast.error(err, 'Change visibility');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      title={cfg.title}
      aria-label={cfg.title}
      className={clsx('inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset hover:bg-stone-800/60', cfg.tone)}
    >
      <Icon size={12} />
      {!compact && <span className="hidden @sm:inline">{cfg.text}</span>}
    </button>
  );
}

function Rating({ value }: { value: string }) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 20 || String(value).trim() === '') return <span>{value}</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-800">
        <span className="block h-full rounded-full bg-amber-500/80" style={{ width: `${(n / 20) * 100}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right tabular-nums text-stone-300">{n}/20</span>
    </span>
  );
}

function AttributeValue({ field, value }: { field: FieldSchema | undefined; value: unknown }) {
  const { entityMap, canView } = useCampaignData();
  const { peek } = usePeek();
  if (field?.type === 'entity-select') {
    const target = entityMap.get(String(value));
    if (!target || !canView(target)) return <span className="text-stone-500 italic">Unknown</span>;
    return (
      <button type="button" className="link text-left" onClick={(e) => peek(target, { newSlot: e.ctrlKey || e.metaKey })}>
        {target.name}
      </button>
    );
  }
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (field?.rating) return <Rating value={String(value)} />;
  const text = String(value);
  if (/^https?:\/\//.test(text)) {
    return (
      <a href={text} target="_blank" rel="noopener noreferrer" className="link break-all">
        {text.replace(/^https?:\/\//, '').slice(0, 40)}
      </a>
    );
  }
  return <span className="whitespace-pre-wrap">{text}</span>;
}

function useVisibleAttributes(entity: Entity) {
  const { canViewField } = useCampaignData();
  return useMemo(() => {
    const schema = fieldsFor(entity.type);
    const entries = Object.entries(entity.attributes ?? {}).filter(
      ([key, v]) => v !== undefined && v !== null && v !== '' && canViewField(entity, key),
    );
    // Keep the schema order; unknown (legacy) keys go last.
    const order = (k: string) => {
      const i = schema.findIndex((f) => f.key === k);
      return i === -1 ? 999 : i;
    };
    entries.sort((a, b) => order(a[0]) - order(b[0]));
    const short: [FieldSchema | undefined, string, unknown][] = [];
    const long: [FieldSchema | undefined, string, unknown][] = [];
    for (const [key, value] of entries) {
      const f = schema.find((s) => s.key === key);
      (f?.type === 'textarea' ? long : short).push([f, key, value]);
    }
    return { short, long };
  }, [entity, canViewField]);
}

function Banner({ imageRef }: { imageRef: string }) {
  const { src } = useImageSrc(imageRef);
  if (!src) return <div className="h-24" />;
  return (
    <div className="relative h-36 overflow-hidden @xl:h-52">
      <img src={src} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/40 to-transparent" />
    </div>
  );
}

function MentionChip({ entity }: { entity: Entity }) {
  const { peek } = usePeek();
  const drag = useDragSource({ entryId: entity.id, label: entity.name, type: entity.type });
  return (
    <button type="button" {...drag} onClick={(e) => peek(entity, { newSlot: e.ctrlKey || e.metaKey })} className="chip gap-1.5 bg-stone-900/60 py-1 text-sm text-stone-200 ring-stone-700 hover:text-amber-300">
      <TypeIcon type={entity.type} size={13} className="text-stone-500" />
      {entity.name}
    </button>
  );
}

export default function EntityView({ entityId, variant = 'page' }: { entityId: string; variant?: 'page' | 'panel' }) {
  const { user, isDM } = useAuth();
  const data = useCampaignData();
  const { entityMap, loading, canView, canViewField, canEdit, canDelete, childrenOf, entities, memberName, players, mentionedIn } = data;
  const { peek, remove: removePeek, close, activeId: peekActive } = usePeek();
  // Leaving from a quick-view pane closes that pane, unless it's pinned.
  const closePeek = () => {
    if (peekActive === entityId) close();
  };
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [expandAll, setExpandAll] = useState(false);
  const [quickCreate, setQuickCreate] = useState(false);

  const entity = entityMap.get(entityId);
  const ancestors = useAncestors(entity);
  const children = useVisibleChildren(entityId);
  const attrs = useVisibleAttributes(entity ?? ({ attributes: {}, type: 'note' } as unknown as Entity));

  const notes = useMemo(
    () => entities.filter((e) => e.type === 'note' && e.locationId === entityId && canView(e)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [entities, entityId, canView],
  );

  const mentions = useMemo(() => [...mentionedIn(entityId)].sort((a, b) => a.name.localeCompare(b.name)), [mentionedIn, entityId]);

  if (loading) return <Spinner className="py-20" label="Loading…" />;
  if (!entity || !canView(entity)) {
    return (
      <EmptyState icon={EyeOff} title="Not available" className="m-4">
        This entry doesn’t exist, was deleted, or hasn’t been shared with you.
      </EmptyState>
    );
  }

  const meta = typeMeta(entity.type);
  const images = canViewField(entity, 'imageUrls') ? entity.imageUrls ?? [] : [];
  const showContent = canViewField(entity, 'content');
  const knowledge = !isDM && user ? entity.playerKnowledge?.[user.uid] : undefined;
  const kind = baseType(entity.type);
  const hasStatBlock = (kind === 'npc' || kind === 'monster') && (entity.statBlock || entity.dndStats) && canViewField(entity, 'statBlock');
  const status = entity.type === 'quest' ? entity.attributes?.status : undefined;
  const isDead = kind === 'npc' && entity.attributes?.isAlive === false && canViewField(entity, 'isAlive');
  const isBoss = kind === 'monster' && entity.attributes?.isUnique === true && canViewField(entity, 'isUnique');
  const editable = canEdit(entity);
  const deletable = canDelete(entity);
  const hasMap = !!entity.mapConfig?.mediaId;
  const shortDescription = attrs.long.find(([, k]) => k === 'shortDescription');
  const longAttrs = attrs.long.filter(([, k]) => k !== 'shortDescription');
  const location = entity.locationId ? entityMap.get(entity.locationId) : undefined;
  const panel = variant === 'panel';

  const goEdit = () => {
    if (panel) closePeek();
    navigate(`/entity/${entity.id}/edit`);
  };

  const remove = async () => {
    setMenuOpen(false);
    const kids = childrenOf.get(entity.id) ?? [];
    const ok = await confirm({
      title: `Delete “${entity.name}”?`,
      message: (
        <>
          This can’t be undone.
          {isDM && kids.length > 0 && (
            <>
              {' '}
              The {kids.length} {kids.length === 1 ? 'entry' : 'entries'} located here will move to{' '}
              {location ? <strong>{location.name}</strong> : 'the top level'}.
            </>
          )}
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteEntity(entity, { isDM, children: kids });
      removePeek(entity.id);
      toast.success(`Deleted “${entity.name}”`);
      if (!panel) navigate(`/entities/${entity.type}`, { replace: true });
    } catch (err) {
      toast.error(err, 'Delete entity');
    }
  };

  const copyLink = async () => {
    setMenuOpen(false);
    const url = `${window.location.origin}${import.meta.env.BASE_URL}#/entity/${entity.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.show(url);
    }
  };

  const details = (className: string) =>
    attrs.short.length > 0 && (

            <Section title="Details" className={className}>
              <dl className="space-y-2.5 text-sm">
                {attrs.short.map(([f, key, value]) => (
                  <div key={key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
                    <dt className="text-stone-500">{f?.label ?? key}</dt>
                    <dd className="flex min-w-0 items-start gap-2 text-stone-200">
                      <span className="min-w-0 flex-1">
                        <AttributeValue field={f} value={value} />
                      </span>
                      <FieldEye entity={entity} field={key} compact />
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          
    );

  const withKnowledge = players.filter((p) => entity.playerKnowledge?.[p.uid]?.trim());

  return (
    <div className="@container">
      {/* Header */}
      <div className={clsx('overflow-hidden', !panel && 'card mb-4')}>
        {images[0] && !panel && <Banner imageRef={images[0]} />}
        <div className={clsx('relative', panel ? 'px-4 pt-3 pb-4' : 'p-4 sm:p-6', images[0] && !panel && '-mt-12')}>
          {ancestors.length > 0 && canViewField(entity, 'locationId') && (
            <nav aria-label="Location" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-stone-400">
              {ancestors.map((a, i) => (
                <span key={a.id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={12} className="text-stone-600" />}
                  <button type="button" className="hover:text-amber-300" onClick={(e) => peek(a, { newSlot: e.ctrlKey || e.metaKey })}>
                    {a.name}
                  </button>
                </span>
              ))}
            </nav>
          )}
          <div className="flex items-start gap-3">
            <h1 className={clsx('min-w-0 flex-1 font-display font-semibold break-words text-stone-50', panel ? 'text-xl' : 'text-2xl sm:text-3xl')}>
              {entity.name}
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              {isDM && entity.type !== 'note' && <RevealButton entity={entity} />}
              {editable && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={goEdit} aria-label="Edit">
                  <Edit3 size={14} />
                  <span className="hidden @sm:inline">Edit</span>
                </button>
              )}
              <button ref={menuAnchor} type="button" className="btn-icon-sm" aria-label="More actions" onClick={() => setMenuOpen((o) => !o)}>
                <MoreHorizontal size={18} />
              </button>
              <Popover anchorRef={menuAnchor} open={menuOpen} onClose={() => setMenuOpen(false)} width={220}>
                {hasMap && (
                  <MenuItem icon={MapIcon} onClick={() => (setMenuOpen(false), panel && closePeek(), navigate(`/map/${entity.id}`))}>
                    Open map
                  </MenuItem>
                )}
                {panel && (
                  <MenuItem icon={BookOpen} onClick={() => (setMenuOpen(false), closePeek(), navigate(`/entity/${entity.id}`))}>
                    Open full page
                  </MenuItem>
                )}
                <MenuItem icon={Copy} onClick={copyLink}>
                  Copy link
                </MenuItem>
                {deletable && (
                  <MenuItem icon={Trash2} danger onClick={remove}>
                    Delete
                  </MenuItem>
                )}
              </Popover>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TypeBadge type={entity.type} />
            {(isDM || entity.ownerId === user?.uid) && <VisibilityBadge entity={entity} />}
            {status && canViewField(entity, 'status') && <span className={clsx('chip', QUEST_STATUS_TONE[status] ?? 'text-stone-300 ring-stone-600')}>{status}</span>}
            {isDead && (
              <span className="chip text-stone-300 bg-stone-500/10 ring-stone-500/30">
                <Skull size={11} /> Deceased
              </span>
            )}
            {isBoss && (
              <span className="chip text-rose-200 bg-rose-500/10 ring-rose-500/30">
                <Crown size={11} /> Unique
              </span>
            )}
            {entity.gender && canViewField(entity, 'gender') && <span className="chip text-stone-300 ring-stone-600/60">{entity.gender}</span>}
            {canViewField(entity, 'tags') &&
              entity.tags?.map((t) => (
                <Link key={t} to={`/search?q=${encodeURIComponent('#' + t)}`} onClick={() => panel && closePeek()} className="tag hover:bg-stone-700">
                  #{t}
                </Link>
              ))}
          </div>
          {hasMap && !panel && (
            <Link to={`/map/${entity.id}`} className="btn btn-secondary btn-sm mt-3">
              <MapIcon size={14} /> Open map
            </Link>
          )}
        </div>
      </div>

      {/* Body */}
      <div className={clsx('grid gap-4', !panel && '@4xl:grid-cols-[minmax(0,1fr)_320px]', panel && 'px-3 pb-6')}>
        <div className="min-w-0 space-y-4">
          {details('@4xl:hidden')}
          {knowledge && (
            <section className="rounded-2xl border border-amber-700/40 bg-amber-950/20 p-4 sm:p-5">
              <h2 className="section-title mb-2 flex items-center gap-2">
                <Sparkles size={16} /> What you know
              </h2>
              <Markdown source={knowledge} />
            </section>
          )}

          {(shortDescription || entity.content || !showContent) && (
            <Section title="Description" eye={entity.content ? <FieldEye entity={entity} field="content" /> : undefined}>
              {shortDescription && (
                <div className="mb-3 flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-base leading-relaxed text-stone-200">{String(shortDescription[2])}</p>
                  <FieldEye entity={entity} field="shortDescription" />
                </div>
              )}
              {showContent ? (
                entity.content ? (
                  <Markdown source={entity.content} className={entity.content.length > 180 ? "dropcap" : undefined} />
                ) : null
              ) : (
                <p className="flex items-center gap-2 text-sm text-stone-500">
                  <Lock size={14} /> The details of this entry haven’t been revealed to you.
                </p>
              )}
            </Section>
          )}

          {longAttrs.length > 0 && (
            <div className="grid gap-4 @2xl:grid-cols-2">
              {longAttrs.map(([f, key, value]) => (
                <Section key={key} title={f?.label ?? key} eye={<FieldEye entity={entity} field={key} />}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-stone-300">{String(value)}</p>
                </Section>
              ))}
            </div>
          )}

          {hasStatBlock && (
            <Section title="Stat block" eye={<FieldEye entity={entity} field="statBlock" />}>
              <StatBlock stats={entity.dndStats} text={entity.statBlock} />
            </Section>
          )}

          {isDM && entity.dmNotes && (
            <section className="rounded-2xl border border-rose-900/50 bg-rose-950/15 p-4 sm:p-5">
              <h2 className="mb-2 flex items-center gap-2 font-display text-base font-semibold text-rose-300">
                <Lock size={15} /> DM secrets
              </h2>
              <Markdown source={entity.dmNotes} />
            </section>
          )}

          {(!panel || notes.length > 0) && (
          <Section
            title={`Notes${notes.length ? ` (${notes.length})` : ''}`}
            action={
              <Link
                to={`/entity/new?type=note&locationId=${encodeURIComponent(entity.id)}`}
                onClick={() => panel && closePeek()}
                className="btn btn-ghost btn-sm text-amber-400"
              >
                <Plus size={14} /> Add note
              </Link>
            }
          >
            {notes.length === 0 ? (
              <p className="text-sm text-stone-500">No notes attached yet.</p>
            ) : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={(e) => peek(n, { newSlot: e.ctrlKey || e.metaKey })} className="surface block w-full p-3 text-left hover:border-stone-700">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium text-stone-100">{n.name}</span>
                        <span className="shrink-0 text-xs text-stone-500">{memberName(n.ownerId)} · {timeAgo(n.updatedAt)}</span>
                      </div>
                      {canViewField(n, 'content') && n.content && (
                        <p className="mt-1 line-clamp-2 text-sm text-stone-400">{excerpt(n.content, 200)}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          )}

          {isDM && players.length > 0 && (!panel || withKnowledge.length > 0) && (
            <Section
              title="Player knowledge"
              action={
                editable && (
                  <button type="button" className="btn btn-ghost btn-sm text-amber-400" onClick={goEdit}>
                    <Edit3 size={14} /> Edit
                  </button>
                )
              }
            >
              {withKnowledge.length === 0 ? (
                <p className="text-sm text-stone-500">No player has specific knowledge about this yet.</p>
              ) : (
                <ul className="space-y-3">
                  {withKnowledge.map((p) => (
                    <li key={p.uid} className="flex gap-3">
                      <Avatar user={p} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-stone-200">{p.displayName}</div>
                        <p className="text-sm whitespace-pre-wrap text-stone-400">{entity.playerKnowledge?.[p.uid]}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>

        {/* Aside */}
        <div className="min-w-0 space-y-4">
          {details('hidden @4xl:block')}

          {images.length > 0 && (
            <Section title={`Images (${images.length})`} eye={<FieldEye entity={entity} field="imageUrls" />}>
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, i) => (
                  <ImageThumb key={img + i} imageRef={img} className="aspect-square" onClick={() => setLightbox(i)} alt={`${entity.name} image ${i + 1}`} />
                ))}
              </div>
            </Section>
          )}

          {(children.length > 0 || (isDM && !panel)) && entity.type !== 'note' && (
            <Section
              title={`Located here${children.length ? ` (${children.length})` : ''}`}
              action={
                <div className="flex items-center gap-1">
                  {children.some((c) => (childrenOf.get(c.id)?.length ?? 0) > 0) && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandAll((x) => !x)}>
                      {expandAll ? 'Collapse' : 'Expand'}
                    </button>
                  )}
                  {isDM && (
                    <button type="button" className="btn btn-ghost btn-sm text-amber-400" onClick={() => setQuickCreate(true)}>
                      <Plus size={14} /> Add
                    </button>
                  )}
                </div>
              }
            >
              {children.length > 0 ? (
                <LocationTree parentId={entity.id} expandAll={expandAll} />
              ) : (
                <p className="text-sm text-stone-500">Nothing is located here yet.</p>
              )}
            </Section>
          )}

          <Section title="Relationships">
            <RelationshipsSection entity={entity} />
          </Section>

          {mentions.length > 0 && (
            <Section title={`Mentioned in (${mentions.length})`}>
              <ul className="flex flex-wrap gap-1.5">
                {mentions.map((m) => (
                  <li key={m.id}>
                    <MentionChip entity={m} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <p className="px-1 text-xs text-stone-500">
            {meta.label} · created by {memberName(entity.ownerId)} · updated {timeAgo(entity.updatedAt)}
          </p>
        </div>
      </div>

      <Lightbox images={images} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
      <QuickCreateModal open={quickCreate} onClose={() => setQuickCreate(false)} initialLocationId={entity.id} source={entity} />
    </div>
  );
}
