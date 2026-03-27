import { useState } from 'react';
import { X, Save, Plus } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Entity, EntityType } from '../types';
import { generateUniqueId } from '../utils/slugify';
import { useAuth } from '../AuthContext';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { OperationType } from '../types';
import { ENTITY_TYPES_ORDERED } from '../utils/entitySchemas';

import AutoExpandingTextarea from './AutoExpandingTextarea';

interface QuickCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (entity: Entity) => void;
  initialName?: string;
  sourceEntityId?: string;
  sourceEntityName?: string;
  initialLocationId?: string;
}

export default function QuickCreateModal({ 
  isOpen, 
  onClose, 
  onCreated, 
  initialName = '',
  sourceEntityId,
  sourceEntityName,
  initialLocationId
}: QuickCreateModalProps) {
  const { user, isDM, currentCampaign } = useAuth();
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<EntityType>(isDM ? 'npc' : 'note');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentCampaign || !name.trim()) return;

    if (!isDM && type !== 'note') {
      setSaveError("Only DMs can create entities other than Notes.");
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const entityId = await generateUniqueId(name);
      const now = new Date().toISOString();

      let content = `*Placeholder for ${name.trim()}*`;
      if (sourceEntityId && sourceEntityName) {
        content += `\n\n**References:** [${sourceEntityName}](/entity/${sourceEntityId})`;
      }

      const entityData: Entity = {
        id: entityId,
        campaignId: currentCampaign.id,
        type,
        name: name.trim(),
        content,
        tags: [],
        ownerId: user.uid,
        isPublic: false,
        allowedPlayers: [currentCampaign.dmId], // Default to DM access
        playerKnowledge: {},
        locationId: initialLocationId || null,
        gender: null,
        imageUrls: [],
        attributes: {},
        fieldPermissions: {},
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'entities', entityId), entityData);
      onCreated(entityData);
      onClose();
    } catch (error: any) {
      console.error("Quick create error:", error);
      setSaveError(error.message || "Failed to create entity. Check permissions.");
      handleFirestoreError(error, OperationType.WRITE, 'entities/quick-new');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in duration-200">
        <div className="p-4 border-b border-stone-800 flex items-center justify-between bg-stone-900/50">
          <div className="flex items-center gap-2 text-emerald-500">
            <Plus size={18} />
            <h3 className="font-cinzel font-bold tracking-wider">Quick Create</h3>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          {saveError && (
            <div className="p-3 bg-red-950/50 border border-red-900/50 rounded-xl text-red-400 text-sm">
              {saveError}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Entity Name</label>
            <AutoExpandingTextarea
              autoFocus
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. The Rusty Tankard"
              className="text-sm min-h-[42px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as EntityType)}
              disabled={!isDM}
              className="w-full px-4 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-sm appearance-none disabled:opacity-50"
            >
              {ENTITY_TYPES_ORDERED.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-stone-400 hover:text-stone-200 font-medium transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || (!isDM && type !== 'note')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20 text-sm"
            >
              <Save size={16} />
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
