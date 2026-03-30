import React from 'react';
import { Relationship, Entity } from '../types';
import { Trash2, Link as LinkIcon, Plus } from 'lucide-react';

interface RelationshipListProps {
  relationships: Relationship[];
  isDM: boolean;
  onDelete: (rel: Relationship) => void;
  onNavigate: (entityId: string) => void;
  onAdd: () => void;
}

export const RelationshipList: React.FC<RelationshipListProps> = ({
  relationships,
  isDM,
  onDelete,
  onNavigate,
  onAdd
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">Relationships</h3>
        {isDM && (
          <button 
            onClick={onAdd}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors flex items-center gap-1"
          >
            <Plus size={12} /> Add Relationship
          </button>
        )}
      </div>
      
      {relationships.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {relationships.map(rel => (
            <div key={rel.id} className="group flex items-center justify-between p-3 bg-stone-900/50 border border-stone-800 rounded-xl hover:border-amber-900/30 transition-all">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="p-2 bg-stone-800 rounded-lg text-stone-400 group-hover:text-amber-400 transition-colors">
                  <LinkIcon size={16} />
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs text-stone-500 uppercase tracking-widest font-bold truncate">{rel.label}</div>
                  <button 
                    onClick={() => onNavigate(rel.targetId)}
                    className="text-amber-400 hover:text-amber-300 font-medium truncate block"
                  >
                    {rel.targetName}
                  </button>
                </div>
              </div>
              {isDM && (
                <button 
                  onClick={() => onDelete(rel)}
                  className="p-2 text-stone-600 hover:text-red-400 hover:bg-red-900/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-stone-600 italic py-2">No relationships defined.</div>
      )}
    </div>
  );
};
