import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Globe, HelpCircle, Lock, Plus, Save, Users, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData, useIsDescendant, useVisibleEntities } from '../contexts/CampaignDataContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { baseType, menuTypes, ENTITY_TYPES, fieldsFor, isEntityType, permissionKeys, typeMeta, type FieldSchema } from '../lib/entityTypes';
import { upgradeSharing } from '../lib/permissions';
import { defaultAttributes, explicitShare, saveEntity, type EntityDraft, type PendingRelationship } from '../lib/entityService';
import type { Entity, EntityType, FieldPermission, User } from '../types';
import { Avatar, EmptyState, Page, Segmented, Spinner, Toggle, TypeIcon } from '../components/ui/bits';
import EntityPicker from '../components/entity/EntityPicker';
import FieldPermissionToggle from '../components/editor/FieldPermissionToggle';
import TagInput from '../components/editor/TagInput';
import MarkdownField from '../components/editor/MarkdownField';
import ImageManager from '../components/editor/ImageManager';
import StatBlockEditor from '../components/editor/StatBlockEditor';
import { RelationshipList, RelationshipModal } from '../components/entity/Relationships';
import QuickCreateModal from '../components/entity/QuickCreateModal';
import { Popover } from '../components/ui/Popover';

// ---------------------------------------------------------------------------

function draftFromEntity(e: Entity, players: User[], isDM: boolean): EntityDraft {
  const images = e.imageUrls ?? [];
  const mapRef = e.mapConfig?.mediaId ? `media:${e.mapConfig.mediaId}` : null;
  return {
    id: e.id,
    ownerId: e.ownerId,
    createdAt: e.createdAt,
    type: e.type,
    name: e.name,
    content: e.content ?? '',
    tags: e.tags ?? [],
    isPublic: !!e.isPublic,
    // In the editor this holds the explicit selection; derived access is re-added on save.
    allowedPlayers: isDM ? explicitShare(e, players) : e.allowedPlayers ?? [],
    // Older entries: make hidden-by-default fields explicit before the simpler model applies.
    fieldPermissions: isDM ? upgradeSharing(e, explicitShare(e, players), permissionKeys(e.type)) : e.fieldPermissions ?? {},
    playerKnowledge: e.playerKnowledge ?? {},
    locationId: e.locationId ?? '',
    gender: e.gender ?? '',
    imageUrls: images,
    attributes: e.attributes ?? {},
    statBlock: e.statBlock ?? '',
    dndStats: e.dndStats ?? null,
    dmNotes: e.dmNotes ?? '',
    mapConfig: e.mapConfig ?? null,
    mapImage: mapRef,
  };
}

function newDraft(type: EntityType, locationId: string, dmId: string, isDM: boolean): EntityDraft {
  return {
    type,
    name: '',
    content: '',
    tags: [],
    isPublic: false,
    // Players' notes are shared with the DM by default.
    allowedPlayers: !isDM && type === 'note' ? [dmId] : [],
    fieldPermissions: {},
    playerKnowledge: {},
    locationId,
    gender: '',
    imageUrls: [],
    attributes: defaultAttributes(type),
    statBlock: '',
    dndStats: null,
    dmNotes: '',
    mapConfig: null,
    mapImage: null,
  };
}

// ---------------------------------------------------------------------------

function Card({ title, description, children, className, id }: { title: string; description?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={clsx('card p-4 sm:p-5', className)}>
      <h2 className="section-title">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} type="button" aria-label="Help" onClick={() => setOpen((o) => !o)} className="text-stone-500 hover:text-stone-300">
        <HelpCircle size={13} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} align="start" width={240}>
        <p className="p-2 text-xs text-stone-300">{text}</p>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------

export default function EntityEdit() {
  const { id: routeId } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, isDM, currentCampaign } = useAuth();
  const { entityMap, loading, players, canEdit, canViewField } = useCampaignData();
  const visible = useVisibleEntities();
  const isDescendant = useIsDescendant();
  const toast = useToast();
  const confirm = useConfirm();

  const isNew = !routeId;
  const existing = routeId ? entityMap.get(routeId) : undefined;

  const [draft, setDraft] = useState<EntityDraft | null>(null);
  const initialJson = useRef('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingRels, setPendingRels] = useState<PendingRelationship[]>([]);
  const [relOpen, setRelOpen] = useState(false);
  const [quickLocation, setQuickLocation] = useState<string | null>(null);
  const [customSelect, setCustomSelect] = useState<Set<string>>(new Set());

  // Initialise the form once (later remote updates don't clobber local edits).
  useEffect(() => {
    if (draft || !currentCampaign) return;
    if (isNew) {
      const t = params.get('type');
      const type: EntityType = isDM ? (isEntityType(t) ? t : 'npc') : 'note';
      const d = newDraft(type, params.get('locationId') ?? '', currentCampaign.dmId, isDM);
      setDraft(d);
      initialJson.current = JSON.stringify(d);
    } else if (existing) {
      // DMs need the member list to tell explicit sharing apart from derived access.
      if (isDM && currentCampaign.players.length > 0 && players.length === 0) return;
      const d = draftFromEntity(existing, players, isDM);
      setDraft(d);
      initialJson.current = JSON.stringify(d);
      // Show custom values of select fields in "Other…" mode.
      const custom = new Set<string>();
      for (const f of fieldsFor(existing.type)) {
        const v = existing.attributes?.[f.key];
        if (f.type === 'select' && v && !f.options?.includes(v)) custom.add(f.key);
      }
      setCustomSelect(custom);
    }
  }, [isNew, existing, draft, currentCampaign, params, isDM, players]);

  const dirty = !!draft && (JSON.stringify(draft) !== initialJson.current || pendingRels.length > 0);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const set = useCallback(<K extends keyof EntityDraft>(key: K, value: EntityDraft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d)), []);
  const setAttr = (key: string, value: unknown) => setDraft((d) => (d ? { ...d, attributes: { ...d.attributes, [key]: value } } : d));
  const setFieldPerm = (key: string, perm: FieldPermission) => setDraft((d) => (d ? { ...d, fieldPermissions: { ...d.fieldPermissions, [key]: perm } } : d));

  const locationOptions = useMemo(() => {
    if (!draft) return [];
    const parents = typeMeta(draft.type).parents;
    return visible.filter((e) => parents.includes(e.type) && e.id !== routeId && !(routeId && isDescendant(e, routeId)));
  }, [draft?.type, visible, routeId, isDescendant]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = useMemo(() => {
    const byKey = new Map<string, Set<string>>();
    const tags = new Set<string>();
    for (const e of visible) {
      if (canViewField(e, 'tags')) e.tags?.forEach((t) => tags.add(t));
      for (const [k, v] of Object.entries(e.attributes ?? {})) {
        if (typeof v !== 'string' || !v || v.length > 60 || !canViewField(e, k)) continue;
        if (!byKey.has(k)) byKey.set(k, new Set());
        byKey.get(k)!.add(v);
      }
    }
    return { byKey, tags: [...tags].sort() };
  }, [visible, canViewField]);

  const leave = async (force = false) => {
    if (!force && dirty) {
      const ok = await confirm({ title: 'Discard changes?', message: 'Your unsaved changes will be lost.', confirmLabel: 'Discard', danger: true });
      if (!ok) return;
    }
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else if (routeId) navigate(`/entity/${routeId}`, { replace: true });
    else navigate(`/entities/${draft?.type ?? 'npc'}`, { replace: true });
  };

  const save = async () => {
    if (!draft || !user || !currentCampaign || saving) return;
    if (!draft.name.trim()) {
      setError('Give it a name first.');
      document.getElementById('f-name')?.focus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      // If sharing was changed elsewhere (e.g. "Reveal" in the side panel) while this form was
      // open and the DM didn't touch it here, keep the newer sharing instead of undoing it.
      let toSave = draft;
      if (existing && initialJson.current) {
        const initial = JSON.parse(initialJson.current) as EntityDraft;
        const same = (k: 'isPublic' | 'allowedPlayers' | 'fieldPermissions') => JSON.stringify(initial[k]) === JSON.stringify(draft[k]);
        const live = draftFromEntity(existing, players, isDM);
        if (same('isPublic') && same('allowedPlayers')) toSave = { ...toSave, isPublic: live.isPublic, allowedPlayers: live.allowedPlayers };
        if (same('fieldPermissions')) toSave = { ...toSave, fieldPermissions: live.fieldPermissions };
      }
      const saved = await saveEntity(toSave, {
        campaign: currentCampaign,
        user,
        isDM,
        players,
        previous: existing ?? null,
        pendingRelationships: pendingRels,
      });
      initialJson.current = JSON.stringify(draft);
      setPendingRels([]);
      toast.success(isNew ? `Created “${saved.name}”` : 'Saved');
      if (isNew) navigate(`/entity/${saved.id}`, { replace: true });
      else leave(true);
    } catch (err) {
      setError((err as Error)?.message ?? 'Save failed');
      toast.error(err, 'Save entity');
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd + S
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- guards --------------------------------------------------------------
  if (!isNew && loading) return <Spinner className="py-24" />;
  if (!isNew && !existing) {
    return (
      <Page>
        <EmptyState title="Entry not found" action={<button className="btn btn-secondary" onClick={() => navigate('/search')}>Go home</button>}>
          It may have been deleted.
        </EmptyState>
      </Page>
    );
  }
  if (existing && !canEdit(existing)) {
    return (
      <Page>
        <EmptyState icon={Lock} title="You can’t edit this" action={<button className="btn btn-secondary" onClick={() => navigate(-1)}>Go back</button>}>
          {existing.type === 'note' ? 'Only the author of a note can edit it.' : 'Only the DM can edit this entry.'}
        </EmptyState>
      </Page>
    );
  }
  if (!draft) return <Spinner className="py-24" />;

  const meta = typeMeta(draft.type);
  const schema = fieldsFor(draft.type);
  const showFieldPerms = isDM && draft.type !== 'note';
  // Fields without their own setting follow the entry: visible to whoever can see it.
  const inheritsPublic = !!draft.isPublic || (draft.type !== 'note' && (draft.allowedPlayers?.length ?? 0) > 0);

  // Plain function (not a component) so popovers inside keep their state across renders.
  const fieldLabel = ({ field, label, htmlFor, help }: { field: string; label: string; htmlFor?: string; help?: string }) => (
    <div className="mb-1.5 flex items-center gap-1.5">
      <label className="label mb-0" htmlFor={htmlFor}>
        {label}
      </label>
      {help && <Help text={help} />}
      {showFieldPerms && (
        <span className="ml-auto">
          <FieldPermissionToggle permission={draft.fieldPermissions?.[field]} onChange={(p) => setFieldPerm(field, p)} players={players} inheritsPublic={inheritsPublic} fieldLabel={label} />
        </span>
      )}
    </div>
  );

  const renderField = (f: FieldSchema) => {
    const id = `f-attr-${f.key}`;
    const value = draft.attributes?.[f.key];
    let control: ReactNode;
    if (f.type === 'boolean') {
      return (
        <div key={f.key} className="surface flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-sm text-stone-200">{f.label}</span>
          <div className="flex items-center gap-2">
            {showFieldPerms && (
              <FieldPermissionToggle permission={draft.fieldPermissions?.[f.key]} onChange={(p) => setFieldPerm(f.key, p)} players={players} inheritsPublic={inheritsPublic} fieldLabel={f.label} />
            )}
            <Toggle checked={Boolean(value ?? f.defaultValue)} onChange={(v) => setAttr(f.key, v)} label={f.label} />
          </div>
        </div>
      );
    }
    if (f.type === 'textarea') {
      control = <textarea id={id} className="input" rows={3} value={String(value ?? '')} onChange={(e) => setAttr(f.key, e.target.value)} placeholder={f.description} />;
    } else if (f.type === 'select') {
      const custom = customSelect.has(f.key);
      control = (
        <div className="space-y-2">
          <select
            id={id}
            className="input"
            value={custom ? '__other' : String(value ?? '')}
            onChange={(e) => {
              if (e.target.value === '__other') {
                setCustomSelect((s) => new Set(s).add(f.key));
                setAttr(f.key, '');
              } else {
                setCustomSelect((s) => {
                  const n = new Set(s);
                  n.delete(f.key);
                  return n;
                });
                setAttr(f.key, e.target.value);
              }
            }}
          >
            <option value="">—</option>
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            <option value="__other">Other…</option>
          </select>
          {custom && <input autoFocus className="input" placeholder="Custom value" value={String(value ?? '')} onChange={(e) => setAttr(f.key, e.target.value)} />}
        </div>
      );
    } else if (f.type === 'entity-select') {
      control = (
        <EntityPicker
          id={id}
          options={visible.filter((e) => !f.targetType || e.type === f.targetType)}
          value={String(value ?? '')}
          onChange={(v) => setAttr(f.key, v)}
          placeholder={`Choose ${f.targetType ? typeMeta(f.targetType).label.toLowerCase() : 'entry'}…`}
        />
      );
    } else if (f.rating) {
      const n = Number(value);
      const numeric = value === undefined || value === '' || Number.isFinite(n);
      control = numeric ? (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={20}
            value={Number.isFinite(n) && value !== '' && value !== undefined ? n : 0}
            onChange={(e) => setAttr(f.key, e.target.value === '0' ? '' : e.target.value)}
            className="h-2 flex-1 cursor-pointer accent-amber-500"
            aria-label={f.label}
          />
          <input id={id} inputMode="numeric" className="input w-16 text-center" value={String(value ?? '')} placeholder="–" onChange={(e) => setAttr(f.key, e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} />
        </div>
      ) : (
        <input id={id} className="input" value={String(value ?? '')} onChange={(e) => setAttr(f.key, e.target.value)} />
      );
    } else {
      const listId = `dl-${f.key}`;
      const opts = [...(suggestions.byKey.get(f.key) ?? [])].slice(0, 40);
      control = (
        <>
          <input id={id} list={opts.length ? listId : undefined} className="input" value={String(value ?? '')} onChange={(e) => setAttr(f.key, e.target.value)} placeholder={f.description?.startsWith('e.g.') ? f.description : undefined} />
          {opts.length > 0 && (
            <datalist id={listId}>
              {opts.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}
        </>
      );
    }
    return (
      <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
        {fieldLabel({ field: f.key, label: f.label, htmlFor: id, help: f.description && !f.description.startsWith('e.g.') ? f.description : undefined })}
        {control}
      </div>
    );
  };

  // Player note sharing presets
  const dmId = currentCampaign!.dmId;
  const playerIds = players.map((p) => p.uid);
  const shareMode = (() => {
    if (draft.isPublic) return 'all';
    const a = draft.allowedPlayers ?? [];
    const hasDM = a.includes(dmId);
    const hasPlayers = playerIds.some((p) => p !== user?.uid && a.includes(p));
    if (hasPlayers && hasDM) return 'party_dm';
    if (hasPlayers) return 'party';
    if (hasDM) return 'dm';
    return 'private';
  })();
  const setShare = (mode: string) => {
    const others = playerIds.filter((p) => p !== user?.uid);
    const map: Record<string, { isPublic: boolean; allowedPlayers: string[] }> = {
      private: { isPublic: false, allowedPlayers: [] },
      dm: { isPublic: false, allowedPlayers: [dmId] },
      party: { isPublic: false, allowedPlayers: others },
      party_dm: { isPublic: false, allowedPlayers: [...others, dmId] },
      all: { isPublic: true, allowedPlayers: [] },
    };
    setDraft((d) => (d ? { ...d, ...map[mode] } : d));
  };

  const dmVisibility = draft.isPublic ? 'public' : (draft.allowedPlayers?.length ?? 0) > 0 ? 'shared' : 'secret';
  const hiddenCount = permissionKeys(draft.type).filter((k) => {
    const p = draft.fieldPermissions?.[k];
    return p && !p.isPublic && !p.allowedPlayers?.length;
  }).length;
  const setAllFields = (show: boolean) => {
    const perms: Record<string, FieldPermission> = {};
    // "Show" clears the per-field settings so every field follows the entry's visibility.
    if (!show) permissionKeys(draft.type).forEach((k) => (perms[k] = { isPublic: false, allowedPlayers: [] }));
    setDraft((d) => (d ? { ...d, fieldPermissions: perms } : d));
    toast.show(show ? 'Every field follows the entry’s visibility' : 'All fields hidden — only the name is shown');
  };

  return (
    <div className="pb-24 md:pb-10">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-20 border-b border-stone-800/70 bg-stone-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-6">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => leave()}>
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Cancel</span>
          </button>
          <div className="min-w-0 flex-1 truncate text-center text-sm text-stone-400 sm:text-left">
            {isNew ? `New ${meta.label.toLowerCase()}` : `Editing ${existing?.name}`}
            {dirty && <span className="ml-2 text-xs text-amber-400">• unsaved</span>}
          </div>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <div className="size-4 animate-spin rounded-full border-2 border-stone-900/30 border-t-stone-900" /> : <Save size={16} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <form
        className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_340px]"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {error && <div className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-300 lg:col-span-2">{error}</div>}

        {/* Main column */}
        <div className="min-w-0 space-y-4">
          <section className="card p-4 sm:p-5">
            <label className="label" htmlFor="f-name">
              Name
            </label>
            <input
              id="f-name"
              autoFocus={isNew}
              className="input h-12 font-display text-xl font-semibold"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={`Name this ${meta.label.toLowerCase()}`}
              maxLength={190}
            />
            {isDM && (
              <div className="mt-4">
                <span className="label">Type</span>
                <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap">
                  {ENTITY_TYPES.filter((t) => !t.hidden || t.value === draft.type).map((t) => {
                    const Icon = t.icon;
                    const active = t.value === draft.type;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => set('type', t.value)}
                        className={clsx(
                          'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          active ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200',
                        )}
                      >
                        <Icon size={13} /> {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <Card title="Description">
            {fieldLabel({ field: "content", label: "Main text" })}
            <MarkdownField value={draft.content} onChange={(v) => set('content', v)} height={360} source={draft.id ? { id: draft.id, name: draft.name } : undefined} placeholder="Write freely. Type @ to link another entry." />
          </Card>

          {(schema.length > 0 || baseType(draft.type) === 'npc') && (
            <Card title={`${meta.label} details`}>
              <div className="grid gap-4 sm:grid-cols-2">
                {baseType(draft.type) === 'npc' && (
                  <div>
                    {fieldLabel({ field: "gender", label: "Gender", htmlFor: "f-gender" })}
                    <select id="f-gender" className="input" value={draft.gender ?? ''} onChange={(e) => set('gender', e.target.value)}>
                      <option value="">Not specified</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </div>
                )}
                {schema.map(renderField)}
              </div>
            </Card>
          )}

          {(baseType(draft.type) === 'npc' || baseType(draft.type) === 'monster') && (
            <Card title="Stat block" description="Optional combat stats, shown as a D&D-style block.">
              {showFieldPerms && (
                <div className="-mt-2 mb-3 flex justify-end">
                  <FieldPermissionToggle permission={draft.fieldPermissions?.statBlock} onChange={(p) => setFieldPerm('statBlock', p)} players={players} inheritsPublic={inheritsPublic} fieldLabel="Stat block" />
                </div>
              )}
              <StatBlockEditor stats={draft.dndStats} text={draft.statBlock ?? ''} onStats={(s) => set('dndStats', s)} onText={(t) => set('statBlock', t)} />
            </Card>
          )}

          {isDM && (
            <Card title="DM secrets" description="Only DMs ever see this — even when the entry is public." className="border-rose-900/40">
              <MarkdownField value={draft.dmNotes ?? ''} onChange={(v) => set('dmNotes', v)} height={220} source={draft.id ? { id: draft.id, name: draft.name } : undefined} placeholder="Hidden motives, twists, what they really know…" />
            </Card>
          )}

          {isDM && draft.type !== 'note' && (
            <Card title="Player knowledge" description="Private notes per player. A player who has knowledge can see this entry.">
              {players.length === 0 ? (
                <p className="text-sm text-stone-500">No players have joined yet.</p>
              ) : (
                <div className="space-y-3">
                  {players.map((p) => (
                    <div key={p.uid} className="flex gap-3">
                      <Avatar user={p} size={32} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <label className="mb-1 block text-sm font-medium text-stone-200" htmlFor={`pk-${p.uid}`}>
                          {p.displayName}
                        </label>
                        <textarea
                          id={`pk-${p.uid}`}
                          rows={2}
                          className="input min-h-16"
                          placeholder={`What does ${p.displayName} know?`}
                          value={draft.playerKnowledge?.[p.uid] ?? ''}
                          onChange={(e) => set('playerKnowledge', { ...draft.playerKnowledge, [p.uid]: e.target.value })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {isDM && (
            <Card title="Relationships">
              {existing ? <RelationshipList entity={existing} /> : null}
              {pendingRels.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {pendingRels.map((r, i) => (
                    <li key={i} className="surface flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="flex-1 truncate">
                        <span className="text-stone-100">{r.targetName}</span> <span className="text-stone-500">· {r.label}</span>
                      </span>
                      <span className="text-xs text-amber-400">added on save</span>
                      <button type="button" aria-label="Remove" className="btn-icon-sm" onClick={() => setPendingRels((p) => p.filter((_, j) => j !== i))}>
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!existing && pendingRels.length === 0 && <p className="text-sm text-stone-500">Link this entry to others — family, employers, rivals…</p>}
              <button type="button" className="btn btn-ghost btn-sm mt-2 -ml-2 text-amber-400" onClick={() => setRelOpen(true)}>
                <Plus size={14} /> Add relationship
              </button>
            </Card>
          )}
        </div>

        {/* Side column */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-18 lg:self-start">
          {isDM ? (
            <Card title="Visibility" description="Who can find this entry.">
              <Segmented
                className="w-full"
                value={dmVisibility}
                onChange={(v) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          isPublic: v === 'public',
                          allowedPlayers: v === 'shared' ? (d.allowedPlayers?.length ? d.allowedPlayers : playerIds) : [],
                        }
                      : d,
                  )
                }
                options={[
                  { value: 'secret', label: 'Secret', icon: Lock },
                  { value: 'shared', label: 'Some', icon: Users },
                  { value: 'public', label: 'Public', icon: Globe },
                ]}
              />
              {dmVisibility === 'shared' && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {players.map((p) => {
                    const on = draft.allowedPlayers?.includes(p.uid);
                    return (
                      <button
                        key={p.uid}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set('allowedPlayers', on ? draft.allowedPlayers.filter((x) => x !== p.uid) : [...(draft.allowedPlayers ?? []), p.uid])}
                        className={clsx(
                          'flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-xs',
                          on ? 'border-sky-500/60 bg-sky-500/10 text-sky-200' : 'border-stone-800 text-stone-400',
                        )}
                      >
                        <Avatar user={p} size={20} />
                        {p.displayName}
                        {on && <Check size={12} />}
                      </button>
                    );
                  })}
                  {players.length === 0 && <p className="text-xs text-stone-500">No players have joined yet.</p>}
                </div>
              )}
              {draft.type !== 'note' && (
                <>
                  <p className="mt-3 text-xs text-stone-500">
                    {dmVisibility === 'secret'
                      ? 'Only you can see it. Use “Reveal” on the entry when the party discovers it.'
                      : `${dmVisibility === 'public' ? 'Everyone' : 'The chosen players'} see${dmVisibility === 'public' ? 's' : ''} every field, except the ones you lock with the small toggle next to each field.`}
                    {hiddenCount > 0 && dmVisibility !== 'secret' && <span className="text-amber-500"> {hiddenCount} hidden.</span>}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => setAllFields(true)} disabled={hiddenCount === 0}>
                      <Globe size={13} /> Show all fields
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => setAllFields(false)}>
                      <Lock size={13} /> Hide all fields
                    </button>
                  </div>
                </>
              )}
            </Card>
          ) : (
            <Card title="Sharing" description="Who can read this note.">
              <div className="space-y-1.5">
                {[
                  { v: 'private', label: 'Only me', icon: Lock },
                  { v: 'dm', label: 'Me and the DM', icon: Users },
                  { v: 'party', label: 'The party (not the DM)', icon: Users },
                  { v: 'party_dm', label: 'The party and the DM', icon: Users },
                  { v: 'all', label: 'Everyone in the campaign', icon: Globe },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={shareMode === o.v}
                    onClick={() => setShare(o.v)}
                    className={clsx(
                      'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                      shareMode === o.v ? 'border-amber-500/60 bg-amber-500/10 text-amber-100' : 'border-stone-800 text-stone-300 hover:border-stone-700',
                    )}
                  >
                    <o.icon size={15} className="shrink-0" />
                    <span className="flex-1">{o.label}</span>
                    {shareMode === o.v && <Check size={14} />}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card title={draft.type === 'note' ? 'Attached to' : 'Location'}>
            {fieldLabel({ field: "locationId", label: draft.type === 'note' ? 'About' : 'Located in' })}
            <EntityPicker
              options={locationOptions}
              value={draft.locationId ?? ''}
              onChange={(v) => set('locationId', v)}
              placeholder={draft.type === 'note' ? 'Not attached' : 'Top level'}
              onCreateNew={isDM ? (name) => setQuickLocation(name) : undefined}
            />
            {draft.type !== 'note' && (
              <p className="hint">
                A {meta.label.toLowerCase()} can be inside: {meta.parents.map((p) => typeMeta(p).label.toLowerCase()).join(', ')}.
              </p>
            )}
          </Card>

          <Card title="Tags">
            {fieldLabel({ field: "tags", label: "Tags", htmlFor: "f-tags" })}
            <TagInput id="f-tags" value={draft.tags} onChange={(t) => set('tags', t)} suggestions={suggestions.tags} />
            <p className="hint">Press Enter or comma to add. Search with #tag.</p>
          </Card>

          <Card title="Images & map">
            {fieldLabel({ field: "imageUrls", label: "Gallery" })}
            <ImageManager images={draft.imageUrls ?? []} onChange={(imgs) => set('imageUrls', imgs)} mapImage={draft.mapImage} onMapChange={(m) => set('mapImage', m)} />
          </Card>

          {existing && (
            <p className="flex items-center gap-2 px-1 text-xs text-stone-500">
              <TypeIcon type={existing.type} size={12} /> id: <code className="text-stone-400">{existing.id}</code>
            </p>
          )}
        </div>
      </form>

      {isDM && (
        <RelationshipModal
          open={relOpen}
          onClose={() => setRelOpen(false)}
          source={{ id: draft.id ?? '', name: draft.name || 'This entry' }}
          onSubmit={(rel) => {
            if (rel.targetId === draft.id) return;
            setPendingRels((p) => [...p, rel]);
          }}
        />
      )}
      <QuickCreateModal
        open={quickLocation !== null}
        onClose={() => setQuickLocation(null)}
        initialName={quickLocation ?? ''}
        initialType={meta.parents.find((p) => p !== 'note' && p !== draft.type) ?? meta.parents[0]}
        onCreated={(e) => set('locationId', e.id)}
      />
    </div>
  );
}
