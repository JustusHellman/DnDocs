import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import EntityPicker from './EntityPicker';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData, useVisibleEntities } from '../../contexts/CampaignDataContext';
import { useToast } from '../../contexts/ToastContext';
import { menuTypes, ENTITY_TYPES, typeMeta } from '../../lib/entityTypes';
import { quickCreateEntity } from '../../lib/entityService';
import type { Entity, EntityType } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (entity: Entity) => void;
  initialName?: string;
  initialType?: EntityType;
  initialLocationId?: string | null;
  /** Adds a "References: [source]" line so the new stub links back. */
  source?: Pick<Entity, 'id' | 'name'>;
}

export default function QuickCreateModal({ open, onClose, onCreated, initialName = '', initialType, initialLocationId, source }: Props) {
  const { user, isDM, currentCampaign } = useAuth();
  const { entityMap } = useCampaignData();
  const visible = useVisibleEntities();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<EntityType>(initialType ?? (isDM ? 'npc' : 'note'));
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setLocationId(initialLocationId ?? '');
    const parent = initialLocationId ? entityMap.get(initialLocationId) : undefined;
    // Suggest a sensible type for things created inside a place.
    const suggested =
      initialType ??
      (!isDM ? 'note' : parent ? menuTypes().find((t) => t.parents.includes(parent.type) && t.value !== 'note')?.value ?? 'npc' : 'npc');
    setType(suggested);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const allowedTypes = isDM ? menuTypes() : ENTITY_TYPES.filter((t) => t.value === 'note');
  const locationOptions = visible.filter((e) => typeMeta(type).parents.includes(e.type));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentCampaign || !name.trim()) return;
    setSaving(true);
    try {
      const entity = await quickCreateEntity({
        campaign: currentCampaign,
        user,
        name,
        type,
        locationId: locationId || null,
        content: source ? `**References:** [${source.name}](/entity/${source.id})` : '',
      });
      toast.success(`${typeMeta(type).label} “${entity.name}” created`);
      onCreated?.(entity);
      onClose();
    } catch (err) {
      toast.error(err, 'Quick create');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick create"
      description="Create a stub now and fill in the details later."
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="quick-create" className="btn btn-primary" disabled={saving || !name.trim()}>
            <Plus size={16} /> {saving ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <form id="quick-create" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="qc-name">
            Name
          </label>
          <input id="qc-name" autoFocus required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Rusty Tankard" />
        </div>
        <div>
          <span className="label">Type</span>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {allowedTypes.map((t) => {
              const Icon = t.icon;
              const active = t.value === type;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs font-medium transition-colors ${
                    active ? 'border-amber-500/70 bg-amber-500/10 text-amber-200' : 'border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200'
                  }`}
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="label">Located in</span>
          <EntityPicker options={locationOptions} value={locationId} onChange={setLocationId} placeholder="Nowhere in particular" />
        </div>
      </form>
    </Modal>
  );
}
