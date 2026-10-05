import { useMemo, useState } from 'react';
import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { TypeIcon } from '../ui/bits';
import EntityPicker from './EntityPicker';
import QuickCreateModal from './QuickCreateModal';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData, useVisibleEntities } from '../../contexts/CampaignDataContext';
import { usePeek } from '../../contexts/PeekContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { createRelationshipPair, deleteRelationshipPair, type PendingRelationship } from '../../lib/entityService';
import type { Entity, Relationship } from '../../types';
import { relationsOf } from '../../lib/relationships';

export interface RelationView {
  rel: Relationship;
  /** The entry on the other end. */
  target: Entity;
  /** What `target` is to the entry we're looking at. */
  label: string;
}

/** Relationships of an entity, filtered to entries the viewer is allowed to see. */
export function useEntityRelationships(entityId: string): RelationView[] {
  const { relationships, entityMap, canView } = useCampaignData();
  return useMemo(
    () =>
      relationsOf(entityId, relationships)
        .map(({ rel, otherId, label }) => ({ rel, label, target: entityMap.get(otherId) }))
        .filter((x): x is RelationView => !!x.target && canView(x.target) && x.target.id !== entityId)
        .sort((a, b) => a.label.localeCompare(b.label) || a.target.name.localeCompare(b.target.name)),
    [relationships, entityMap, canView, entityId],
  );
}

export function RelationshipList({ entity }: { entity: Entity }) {
  const { isDM } = useAuth();
  const { peek } = usePeek();
  const toast = useToast();
  const confirm = useConfirm();
  const rels = useEntityRelationships(entity.id);

  const remove = async (rel: Relationship, targetName: string) => {
    const ok = await confirm({
      title: 'Remove relationship?',
      message: `This removes the link between ${entity.name} and ${targetName} in both directions.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRelationshipPair(rel);
    } catch (err) {
      toast.error(err, 'Remove relationship');
    }
  };

  if (rels.length === 0) return <p className="text-sm text-stone-500">No relationships yet.</p>;

  return (
    <ul className="divide-y divide-stone-800/70">
      {rels.map(({ rel, target, label }) => (
        <li key={rel.id} className="group flex items-center gap-2 py-1.5">
          <button type="button" onClick={(e) => peek(target, { newSlot: e.ctrlKey || e.metaKey })} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-stone-800/60">
            <TypeIcon type={target.type} className="shrink-0 text-stone-500" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-stone-100">{target.name}</span>
              <span className="block truncate text-xs text-stone-500">{label}</span>
            </span>
          </button>
          {isDM && (
            <button
              type="button"
              aria-label={`Remove relationship with ${target.name}`}
              onClick={() => remove(rel, target.name)}
              className="btn-icon-sm shrink-0 opacity-100 hover:text-rose-300 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
            >
              <Trash2 size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Form used both by the detail view (saves immediately) and the editor (queues until save). */
export function RelationshipModal({
  open,
  onClose,
  source,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  source: Pick<Entity, 'id' | 'name'>;
  onSubmit: (rel: PendingRelationship) => Promise<void> | void;
}) {
  const { entityMap, relationshipLabels } = useCampaignData();
  const visible = useVisibleEntities();
  const [targetId, setTargetId] = useState('');
  const [label, setLabel] = useState('');
  const [reverseLabel, setReverseLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [quickName, setQuickName] = useState<string | null>(null);
  const target = entityMap.get(targetId);

  const reset = () => {
    setTargetId('');
    setLabel('');
    setReverseLabel('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !label.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ targetId: target.id, targetName: target.name, label, reverseLabel: reverseLabel || label });
      reset();
      onClose();
    } catch {
      /* already reported by onSubmit */
    } finally {
      setSaving(false);
    }
  };

  const sourceName = source.name || 'This entry';
  const targetName = target?.name || 'the other one';

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Add relationship"
        description="Links are created in both directions."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" form="rel-form" className="btn btn-primary" disabled={saving || !target || !label.trim()}>
              {saving ? 'Saving…' : 'Add relationship'}
            </button>
          </>
        }
      >
        <form id="rel-form" onSubmit={submit} className="space-y-4">
          <div>
            <span className="label">Related to</span>
            <EntityPicker
              options={visible.filter((e) => e.id !== source.id)}
              value={targetId}
              onChange={setTargetId}
              placeholder="Choose an entry…"
              onCreateNew={(name) => setQuickName(name)}
            />
          </div>
          <datalist id="rel-labels">
            {relationshipLabels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <div>
              <label className="label" htmlFor="rel-label">
                {targetName} is {sourceName}’s…
              </label>
              <input id="rel-label" list="rel-labels" required className="input" placeholder="e.g. Father, Employer" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <ArrowLeftRight size={16} className="mx-auto hidden text-stone-600 sm:mb-3 sm:block" />
            <div>
              <label className="label" htmlFor="rel-reverse">
                {sourceName} is {targetName}’s…
              </label>
              <input id="rel-reverse" list="rel-labels" className="input" placeholder="e.g. Son, Employee" value={reverseLabel} onChange={(e) => setReverseLabel(e.target.value)} />
            </div>
          </div>
          <p className="hint">Leave the second field empty to use the same word both ways (e.g. “Friend”).</p>
        </form>
      </Modal>
      <QuickCreateModal
        open={quickName !== null}
        onClose={() => setQuickName(null)}
        initialName={quickName ?? ''}
        source={source.id ? source : undefined}
        onCreated={(e) => setTargetId(e.id)}
      />
    </>
  );
}

export function RelationshipsSection({ entity }: { entity: Entity }) {
  const { isDM, currentCampaign } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <RelationshipList entity={entity} />
      {isDM && (
        <button type="button" className="btn btn-ghost btn-sm mt-2 -ml-2 text-amber-400" onClick={() => setOpen(true)}>
          <Plus size={14} /> Add relationship
        </button>
      )}
      {isDM && (
        <RelationshipModal
          open={open}
          onClose={() => setOpen(false)}
          source={entity}
          onSubmit={async (rel) => {
            try {
              await createRelationshipPair(currentCampaign!.id, entity, rel);
            } catch (err) {
              toast.error(err, 'Add relationship');
              throw err;
            }
          }}
        />
      )}
    </>
  );
}
