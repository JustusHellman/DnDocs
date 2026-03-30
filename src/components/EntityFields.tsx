import React from 'react';
import { Entity, EntityType } from '../types';
import { ENTITY_SCHEMAS } from '../utils/entitySchemas';
import { Info, Globe, Lock } from 'lucide-react';
import clsx from 'clsx';

interface EntityFieldsProps {
  entity: Entity;
  canViewField: (field: string) => boolean;
}

export const EntityFields: React.FC<EntityFieldsProps> = ({ entity, canViewField }) => {
  const schema = ENTITY_SCHEMAS[entity.type as EntityType] || [];
  
  const visibleFields = schema.filter(field => {
    if (field.key === 'name' || field.key === 'content' || field.key === 'tags') return false;
    return canViewField(field.key);
  });

  if (visibleFields.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {visibleFields.map(field => {
        const value = entity.attributes?.[field.key];
        if (value === undefined || value === null || value === '') return null;

        const isPublic = entity.fieldPermissions?.[field.key]?.isPublic ?? entity.isPublic;

        return (
          <div 
            key={field.key}
            className="group relative bg-stone-900/40 border border-stone-800/50 rounded-xl p-4 hover:bg-stone-900/60 transition-all hover:border-amber-900/30"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-amber-500/60 uppercase tracking-wider flex items-center gap-1.5">
                {field.label}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-help">
                <span title={field.description} className="flex items-center">
                  <Info size={12} />
                </span>
                </div>
              </span>
              {isPublic ? (
                <span title="Public field" className="flex items-center">
                  <Globe size={12} className="text-emerald-500/40" />
                </span>
              ) : (
                <span title="Private field" className="flex items-center">
                  <Lock size={12} className="text-amber-500/40" />
                </span>
              )}
            </div>
            <div className="text-stone-200 font-medium break-words">
              {field.type === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
