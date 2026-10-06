import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { GiStack } from 'react-icons/gi';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData } from '../contexts/CampaignDataContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { Modal } from '../components/ui/Modal';
import { EmptyState, Page, PageHeader, Toggle } from '../components/ui/bits';
import { BUILTIN_TYPES, builtinMeta, builtinRevealDefault, ENTITY_TYPES, slugForType, TYPE_ICONS, typeMeta, type EntityTypeMeta } from '../lib/entityTypes';
import { updateTypeConfig } from '../lib/entityService';
import type { BuiltinType, CustomFieldDef, CustomTypeDef, FieldKind, TypeConfig, TypeOverride } from '../types';

const GROUPS = ['Adventure', 'Characters', 'World'] as const;
const BASES = BUILTIN_TYPES.filter((t): t is CustomTypeDef['base'] => t !== 'note');

const BASE_HINT: Record<string, string> = {
  quest: 'a quest (can be tied to anything)',
  item: 'an item (carried by someone, kept somewhere)',
  npc: 'a person (lives somewhere, belongs to factions)',
  monster: 'a creature (roams a region)',
  faction: 'a group (based in a place)',
  shop: 'a shop (inside a settlement)',
  landmark: 'a landmark (inside a settlement or region)',
  settlement: 'a settlement (inside a region or country)',
  geography: 'a region (can hold settlements and landmarks)',
  country: 'a country (the largest kind of place)',
};

type Kind = 'text' | 'textarea' | 'rating' | 'boolean' | 'select' | 'entity-select';
const KINDS: { value: Kind; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'rating', label: 'Rating 1–20' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'select', label: 'Choice' },
  { value: 'entity-select', label: 'Link to an entry' },
];
const kindOf = (f: CustomFieldDef): Kind => (f.rating ? 'rating' : (f.type as Kind));

/** DM page: make your own entry types and tweak the built-in ones. Stored on the campaign. */
export default function EntryTypes() {
  const { isDM, isOwner, currentCampaign } = useAuth();
  const { entities } = useCampaignData();
  const [editing, setEditing] = useState<string | null>(null);
  const config = currentCampaign?.typeConfig ?? {};
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entities) c[e.type] = (c[e.type] ?? 0) + 1;
    return c;
  }, [entities]);

  if (!isDM) {
    return (
      <Page>
        <EmptyState icon={GiStack} title="DM only">
          Only the DM can change entry types.
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        icon={
          <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25">
            <GiStack size={28} />
          </div>
        }
        title="Entry types"
        subtitle="Add your own kinds of entries (spells, gods, ships…), rename the built-in ones, or trim fields you never use."
        actions={
          isOwner && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> New type
            </button>
          )
        }
      />
      {!isOwner && <p className="mb-4 text-sm text-stone-500">Only the campaign’s owner can change these.</p>}

      <div className="space-y-8">
        {GROUPS.map((g) => (
          <section key={g}>
            <h2 className="section-title mb-3">{g}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {ENTITY_TYPES.filter((t) => t.group === g).map((t) => (
                <li key={t.value}>
                  <TypeRow meta={t} count={counts[t.value] ?? 0} onClick={() => isOwner && setEditing(t.value)} disabled={!isOwner} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {editing && currentCampaign && (
        <TypeEditor key={editing} id={editing} config={config} campaignId={currentCampaign.id} count={counts[editing] ?? 0} onClose={() => setEditing(null)} />
      )}
    </Page>
  );
}

function TypeRow({ meta, count, onClick, disabled }: { meta: EntityTypeMeta; count: number; onClick: () => void; disabled?: boolean }) {
  const Icon = meta.icon;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="card flex w-full items-center gap-3 p-3 text-left enabled:hover:border-amber-500/40">
      <span className={clsx('seal', meta.tone.replace('tone ', ''))} style={{ width: 40, height: 40 }}>
        <Icon size={21} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-stone-100">{meta.label}</span>
          {meta.custom && <span className="chip bg-amber-500/10 text-amber-300 ring-amber-500/25">yours</span>}
          {meta.hidden && <span className="chip text-stone-500 ring-stone-700">hidden</span>}
        </span>
        <span className="block truncate text-xs text-stone-500">
          {meta.fields.length} field{meta.fields.length === 1 ? '' : 's'} · {count} entr{count === 1 ? 'y' : 'ies'}
          {meta.custom && meta.base ? ` · works like ${typeMeta(meta.base).label.toLowerCase()}` : ''}
        </span>
      </span>
    </button>
  );
}

function TypeEditor({ id, config, campaignId, count, onClose }: { id: string; config: TypeConfig; campaignId: string; count: number; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { entities } = useCampaignData();
  const isNew = id === 'new';
  const existingCustom = config.custom?.find((c) => c.id === id);
  const isBuiltin = (BUILTIN_TYPES as string[]).includes(id);
  const stock = isBuiltin ? builtinMeta(id as BuiltinType) : null;

  const [custom, setCustom] = useState<CustomTypeDef>(
    () =>
      existingCustom ?? {
        id: '',
        label: '',
        plural: '',
        icon: 'scroll',
        tone: 'item',
        base: 'item',
        group: 'Adventure',
        fields: [],
      },
  );
  const [override, setOverride] = useState<TypeOverride>(() => (isBuiltin ? { ...(config.overrides?.[id as BuiltinType] ?? {}) } : {}));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next: TypeConfig = { custom: [...(config.custom ?? [])], overrides: { ...(config.overrides ?? {}) } };
    if (isBuiltin) {
      next.overrides![id as BuiltinType] = cleanOverride(override);
    } else {
      if (!custom.label.trim()) {
        toast.show('Give the type a name first.', { kind: 'error' });
        return;
      }
      const def: CustomTypeDef = {
        ...custom,
        label: custom.label.trim(),
        plural: custom.plural.trim() || `${custom.label.trim()}s`,
        fields: custom.fields.filter((f) => f.label.trim()).map((f) => ({ ...f, label: f.label.trim() })),
      };
      if (isNew) {
        // Also skip ids of deleted types that entries still remember, so they don't reattach.
        def.id = slugForType(def.label, [...ENTITY_TYPES.map((t) => t.value), ...entities.map((e) => e.customType ?? '')]);
        next.custom!.push(def);
      } else next.custom = next.custom!.map((c) => (c.id === id ? def : c));
    }
    setSaving(true);
    try {
      await updateTypeConfig(campaignId, next);
      toast.success('Entry types saved');
      onClose();
    } catch (err) {
      toast.error(err, 'Save types');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${custom.label}”?`,
      message: count
        ? `The ${count} entr${count === 1 ? 'y' : 'ies'} of this type are kept and will show up as ${typeMeta(custom.base).plural.toLowerCase()} (fields you added stay stored, just not shown).`
        : 'No entries use this type.',
      confirmLabel: 'Delete type',
      danger: true,
    });
    if (!ok) return;
    try {
      await updateTypeConfig(campaignId, { ...config, custom: (config.custom ?? []).filter((c) => c.id !== id) });
      toast.success('Type deleted');
      onClose();
    } catch (err) {
      toast.error(err, 'Delete type');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'New entry type' : `Edit “${isBuiltin ? stock!.label : custom.label}”`}
      footer={
        <>
          {!isNew && !isBuiltin && (
            <button type="button" className="btn btn-ghost mr-auto text-rose-400" onClick={remove}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {isBuiltin ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Name</span>
              <input className="input" placeholder={stock!.label} value={override.label ?? ''} onChange={(e) => setOverride({ ...override, label: e.target.value })} />
            </label>
            <label>
              <span className="label">Plural</span>
              <input className="input" placeholder={stock!.plural} value={override.plural ?? ''} onChange={(e) => setOverride({ ...override, plural: e.target.value })} />
            </label>
          </div>
          {id !== 'note' && <Toggle checked={!!override.hidden} onChange={(v) => setOverride({ ...override, hidden: v })} label="Hide from menus (existing entries stay)" />}
          <div>
            <span className="label">Built-in fields</span>
            <ul className="divide-y divide-stone-800/70 rounded-lg border border-stone-800">
              {stock!.fields.map((f) => {
                const hidden = override.hiddenFields?.includes(f.key);
                return (
                  <li key={f.key} className="flex items-center gap-2 px-3 py-1.5">
                    <span className={clsx('min-w-0 flex-1 truncate text-sm', hidden ? 'text-stone-500 line-through' : 'text-stone-200')}>{f.label}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setOverride({
                          ...override,
                          hiddenFields: hidden ? override.hiddenFields!.filter((k) => k !== f.key) : [...(override.hiddenFields ?? []), f.key],
                        })
                      }
                    >
                      {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                      {hidden ? 'Hidden' : 'Shown'}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="hint mt-1">Hiding a field keeps what’s already written in it; it’s just not shown or asked for.</p>
          </div>
          <FieldsEditor title="Your extra fields" fields={override.extraFields ?? []} onChange={(extraFields) => setOverride({ ...override, extraFields })} />
          <RevealDefaultsEditor
            base={id as BuiltinType}
            fields={[...stock!.fields.filter((f) => !override.hiddenFields?.includes(f.key)), ...(override.extraFields ?? []).filter((f) => f.label.trim())]}
            value={override.revealDefaults ?? {}}
            onChange={(revealDefaults) => setOverride({ ...override, revealDefaults })}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Name</span>
              <input className="input" autoFocus placeholder="e.g. Spell, Deity, Ship" value={custom.label} onChange={(e) => setCustom({ ...custom, label: e.target.value })} />
            </label>
            <label>
              <span className="label">Plural</span>
              <input className="input" placeholder={custom.label ? `${custom.label}s` : 'e.g. Spells'} value={custom.plural} onChange={(e) => setCustom({ ...custom, plural: e.target.value })} />
            </label>
          </div>
          <div>
            <span className="label">Icon</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TYPE_ICONS).map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  aria-pressed={custom.icon === key}
                  onClick={() => setCustom({ ...custom, icon: key })}
                  className={clsx('seal', `tone-${custom.tone}`, custom.icon === key ? 'ring-2 ring-amber-500 ring-offset-1' : 'opacity-70 hover:opacity-100')}
                  style={{ width: 38, height: 38 }}
                >
                  <Icon size={20} aria-hidden />
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">Colour</span>
            <div className="flex flex-wrap gap-1.5">
              {BUILTIN_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-label={`Colour like ${typeMeta(t).plural}`}
                  aria-pressed={custom.tone === t}
                  onClick={() => setCustom({ ...custom, tone: t })}
                  className={clsx('seal', `tone-${t}`, custom.tone === t && 'ring-2 ring-amber-500 ring-offset-1')}
                  style={{ width: 28, height: 28, background: 'var(--tone)' }}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Works like</span>
              <select className="input" value={custom.base} onChange={(e) => setCustom({ ...custom, base: e.target.value as CustomTypeDef['base'] })} disabled={!isNew && count > 0}>
                {BASES.map((b) => (
                  <option key={b} value={b}>
                    {builtinMeta(b).label}
                  </option>
                ))}
              </select>
              <span className="hint mt-1 block">
                Behaves like {BASE_HINT[custom.base]}.{!isNew && count > 0 ? ' Fixed once entries use it.' : ''}
              </span>
            </label>
            <label>
              <span className="label">Menu section</span>
              <select className="input" value={custom.group} onChange={(e) => setCustom({ ...custom, group: e.target.value as CustomTypeDef['group'] })}>
                {GROUPS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
          </div>
          <FieldsEditor title="Fields" fields={custom.fields} onChange={(fields) => setCustom({ ...custom, fields })} />
          <RevealDefaultsEditor
            base={custom.base}
            fields={custom.fields.filter((f) => f.label.trim())}
            value={custom.revealDefaults ?? {}}
            onChange={(revealDefaults) => setCustom({ ...custom, revealDefaults })}
          />
        </div>
      )}
    </Modal>
  );
}

function FieldsEditor({ title, fields, onChange }: { title: string; fields: CustomFieldDef[]; onChange: (f: CustomFieldDef[]) => void }) {
  const update = (i: number, patch: Partial<CustomFieldDef>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) => {
    const next = [...fields];
    const [f] = next.splice(i, 1);
    next.splice(i + d, 0, f);
    onChange(next);
  };
  const add = () => {
    // Random key: a removed field's old data never shows up under a new field.
    onChange([...fields, { key: `x_${Math.random().toString(36).slice(2, 9)}`, label: '', type: 'text' }]);
  };
  const setKind = (i: number, k: Kind) =>
    update(i, { type: (k === 'rating' ? 'text' : k) as FieldKind, rating: k === 'rating' || undefined, options: k === 'select' ? fields[i].options ?? [] : undefined });

  return (
    <div>
      <span className="label">{title}</span>
      {fields.length === 0 && <p className="mb-2 text-sm text-stone-500">Every entry already has a name, description, images, tags, location and relationships.</p>}
      <ul className="space-y-2">
        {fields.map((f, i) => (
          <li key={f.key} className="rounded-lg border border-stone-800 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <input className="input min-w-0 flex-1 basis-40" placeholder="Field name, e.g. School of magic" value={f.label} onChange={(e) => update(i, { label: e.target.value })} />
              <select className="input w-auto" value={kindOf(f)} onChange={(e) => setKind(i, e.target.value as Kind)} aria-label="Kind of field">
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <div className="flex">
                <button type="button" className="btn-icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="btn-icon-sm" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={14} />
                </button>
                <button type="button" className="btn-icon-sm hover:text-rose-300" aria-label="Remove field" onClick={() => onChange(fields.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {f.type === 'select' && (
              <input
                className="input mt-2"
                placeholder="Choices, separated by commas: Evocation, Illusion, Necromancy"
                defaultValue={(f.options ?? []).join(', ')}
                onBlur={(e) => update(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
              />
            )}
            {f.type === 'entity-select' && (
              <select className="input mt-2" value={f.targetType ?? ''} onChange={(e) => update(i, { targetType: e.target.value || undefined })} aria-label="Which kind of entry">
                <option value="">Any entry</option>
                {ENTITY_TYPES.filter((t) => t.value !== 'note').map((t) => (
                  <option key={t.value} value={t.value}>
                    Only {t.plural.toLowerCase()}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm mt-2 -ml-2 text-amber-400" onClick={add}>
        <Plus size={14} /> Add field
      </button>
    </div>
  );
}

function cleanOverride(o: TypeOverride): TypeOverride {
  const out: TypeOverride = {};
  if (o.label?.trim()) out.label = o.label.trim();
  if (o.plural?.trim()) out.plural = o.plural.trim();
  if (o.hidden) out.hidden = true;
  if (o.hiddenFields?.length) out.hiddenFields = o.hiddenFields;
  const extra = (o.extraFields ?? []).filter((f) => f.label.trim()).map((f) => ({ ...f, label: f.label.trim() }));
  if (extra.length) out.extraFields = extra;
  if (o.revealDefaults && Object.keys(o.revealDefaults).length) out.revealDefaults = o.revealDefaults;
  return out;
}

const BASE_KEYS: { key: string; label: string; only?: string[] }[] = [
  { key: 'content', label: 'Description' },
  { key: 'imageUrls', label: 'Images' },
  { key: 'locationId', label: 'Location' },
  { key: 'gender', label: 'Gender', only: ['npc'] },
  { key: 'statBlock', label: 'Stat block', only: ['npc', 'monster'] },
  { key: 'tags', label: 'Tags' },
];

/** Which fields "Reveal" ticks by default for this type. */
function RevealDefaultsEditor({
  base,
  fields,
  value,
  onChange,
}: {
  base: BuiltinType;
  fields: { key: string; label: string; rating?: boolean }[];
  value: Record<string, boolean>;
  onChange: (v: Record<string, boolean>) => void;
}) {
  const rows = [
    ...BASE_KEYS.filter((b) => !b.only || b.only.includes(base)).map((b) => ({ key: b.key, label: b.label, rating: false })),
    ...fields.map((f) => ({ key: f.key, label: f.label, rating: !!f.rating })),
  ];
  const builtIn = (k: string, rating: boolean) => (rating ? false : builtinRevealDefault(base, k));
  return (
    <div>
      <span className="label">When revealed, show by default</span>
      <p className="hint mb-2">These are pre-ticked in the Reveal panel. You can still change them each time.</p>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => {
          const on = value[r.key] ?? builtIn(r.key, r.rating);
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = { ...value };
                if (!on === builtIn(r.key, r.rating)) delete next[r.key];
                else next[r.key] = !on;
                onChange(next);
              }}
              className={clsx(
                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs',
                on ? 'border-emerald-600/50 bg-emerald-500/10 text-emerald-300' : 'border-stone-700 text-stone-500',
              )}
            >
              {on ? <Eye size={12} /> : <EyeOff size={12} />}
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
