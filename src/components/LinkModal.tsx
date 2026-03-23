import { useState, useEffect } from 'react';
import { X, Search, Link as LinkIcon, Plus } from 'lucide-react';
import { Entity } from '../types';
import QuickCreateModal from './QuickCreateModal';
import AutoExpandingTextarea from './AutoExpandingTextarea';

interface LinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string, entityId: string) => void;
  entities: Entity[];
  sourceEntityId?: string;
  sourceEntityName?: string;
}

export default function LinkModal({ 
  isOpen, 
  onClose, 
  onInsert, 
  entities,
  sourceEntityId,
  sourceEntityName
}: LinkModalProps) {
  const [searchText, setSearchText] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSearchText('');
      setDisplayText('');
      setSelectedEntityId('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredEntities = entities.filter(e => 
    e.name.toLowerCase().includes(searchText.toLowerCase()) ||
    e.type.toLowerCase().includes(searchText.toLowerCase())
  ).slice(0, 10);

  const handleInsert = () => {
    if (selectedEntityId) {
      const finalDisplayText = displayText.trim() || entities.find(e => e.id === selectedEntityId)?.name || 'Link';
      onInsert(finalDisplayText, selectedEntityId);
      onClose();
    }
  };

  const handleQuickCreate = (newEntity: Entity) => {
    onInsert(displayText.trim() || newEntity.name, newEntity.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-stone-800 flex items-center justify-between bg-stone-900/50">
          <div className="flex items-center gap-2 text-amber-500">
            <LinkIcon size={18} />
            <h3 className="font-cinzel font-bold tracking-wider">Insert Entity Link</h3>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider">Display Text</label>
            <span className="text-[10px] text-stone-600 italic">Optional</span>
          </div>
          <AutoExpandingTextarea
            value={displayText}
            onChange={e => setDisplayText(e.target.value)}
            placeholder="Text to show (optional)"
            className="text-sm min-h-[42px]"
          />

          <div className="flex items-center justify-between pt-2">
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider">Search Existing</label>
            <button
              type="button"
              onClick={() => setIsQuickCreateOpen(true)}
              className="flex items-center gap-1 px-2 py-1 bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 hover:text-emerald-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-emerald-500/20"
            >
              <Plus size={12} />
              Create New
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 z-10" size={16} />
            <AutoExpandingTextarea
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search by name or type..."
              className="pl-10 text-sm min-h-[42px]"
            />
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
            {filteredEntities.length > 0 ? (
              filteredEntities.map(entity => (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => {
                    setSelectedEntityId(entity.id);
                    if (!displayText) setDisplayText(entity.name);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                    selectedEntityId === entity.id
                      ? 'bg-amber-900/20 border-amber-500/50 text-amber-200'
                      : 'bg-stone-950/50 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200'
                  }`}
                >
                  <span className="font-medium text-sm">{entity.name}</span>
                  <span className="text-[10px] uppercase tracking-widest opacity-60 px-2 py-0.5 bg-stone-900 rounded-md border border-stone-800">
                    {entity.type}
                  </span>
                </button>
              ))
            ) : (
              <div className="text-center py-4 text-stone-600 text-sm italic">
                No entities found...
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-stone-950/50 border-t border-stone-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-stone-400 hover:text-stone-200 font-medium transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!selectedEntityId}
            className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-amber-900/20 text-sm"
          >
            Insert Link
          </button>
        </div>
      </div>

      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        onCreated={handleQuickCreate}
        initialName={searchText}
        sourceEntityId={sourceEntityId}
        sourceEntityName={sourceEntityName}
      />
    </div>
  );
}
