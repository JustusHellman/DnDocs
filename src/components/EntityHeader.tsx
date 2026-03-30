import React from 'react';
import { Entity, User } from '../types';
import { Edit, Trash2, ArrowLeft, Lock, Globe, Users, BookOpen, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

interface EntityHeaderProps {
  entity: Entity;
  isDM: boolean;
  canEdit: boolean;
  ownerName: string;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
}

export const EntityHeader: React.FC<EntityHeaderProps> = ({
  entity,
  isDM,
  canEdit,
  ownerName,
  onEdit,
  onDelete,
  onBack
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-stone-800 rounded-lg text-stone-400 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl md:text-4xl font-display font-bold text-amber-500">
              {entity.name}
            </h1>
            {entity.isPublic ? (
              <span title="Publicly visible" className="flex items-center">
                <Globe size={18} className="text-emerald-500/70" />
              </span>
            ) : (
              <span title="Private" className="flex items-center">
                <Lock size={18} className="text-amber-500/70" />
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-400">
            <span className="capitalize px-2 py-0.5 bg-stone-800 rounded text-amber-400/80 font-medium">
              {entity.type}
            </span>
            {ownerName && (
              <span className="flex items-center gap-1.5">
                <Users size={14} />
                Owner: {ownerName}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {canEdit && (
          <>
            <button
              onClick={onEdit}
              className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors border border-stone-700"
            >
              <Edit size={18} />
              Edit
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg transition-colors border border-red-900/30"
            >
              <Trash2 size={18} />
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
};
