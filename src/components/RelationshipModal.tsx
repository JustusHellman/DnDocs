import React from 'react';
import { X } from 'lucide-react';
import SearchableDropdown from './SearchableDropdown';
import AutoExpandingTextarea from './AutoExpandingTextarea';
import { Entity } from '../types';

interface RelationshipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  allEntities: Entity[];
  relTargetId: string;
  setRelTargetId: (id: string) => void;
  relTargetIsMy: string;
  setRelTargetIsMy: (val: string) => void;
  relIAmTargets: string;
  setRelIAmTargets: (val: string) => void;
  existingLabels: string[];
  savingRel: boolean;
  onQuickCreate: (name: string) => void;
}

export const RelationshipModal: React.FC<RelationshipModalProps> = ({
  isOpen,
  onClose,
  onSave,
  allEntities,
  relTargetId,
  setRelTargetId,
  relTargetIsMy,
  setRelTargetIsMy,
  relIAmTargets,
  setRelIAmTargets,
  existingLabels,
  savingRel,
  onQuickCreate
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-stone-900/90 backdrop-blur-xl border border-stone-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-400 hover:text-stone-100">
          <X size={20} />
        </button>
        <h2 className="text-xl font-bold text-white mb-6">Add Relationship</h2>
        <form onSubmit={onSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-400 mb-1">Target Entity</label>
            <SearchableDropdown
              options={allEntities.map(e => ({ id: e.id, label: e.name, type: e.type }))}
              value={relTargetId}
              onChange={setRelTargetId}
              placeholder="Select an entity..."
              onCreateNew={onQuickCreate}
            />
          </div>
          
          <datalist id="relationship-labels">
            {existingLabels.map(label => <option key={label} value={label} />)}
          </datalist>

          <div>
            <label className="block text-sm font-medium text-stone-400 mb-1">Target is my...</label>
            <AutoExpandingTextarea
              required
              list="relationship-labels"
              placeholder="e.g. Friend, Father, Enemy"
              value={relTargetIsMy}
              onChange={e => setRelTargetIsMy(e.target.value)}
              className="min-h-[42px]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-400 mb-1">I am Target's...</label>
            <AutoExpandingTextarea
              required
              list="relationship-labels"
              placeholder="e.g. Friend, Son, Enemy"
              value={relIAmTargets}
              onChange={e => setRelIAmTargets(e.target.value)}
              className="min-h-[42px]"
            />
          </div>

          <button type="submit" disabled={savingRel} className="w-full py-3 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/50 disabled:opacity-50 text-amber-500 rounded-xl font-medium transition-colors mt-6">
            {savingRel ? 'Saving...' : 'Save Relationship'}
          </button>
        </form>
      </div>
    </div>
  );
};
