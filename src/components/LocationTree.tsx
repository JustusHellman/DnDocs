import React from 'react';
import { Entity } from '../types';
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';

interface LocationTreeProps {
  parentId: string;
  entities: Entity[];
  depth?: number;
  visited?: Set<string>;
  expandedNodes: Set<string>;
  toggleNode: (nodeId: string) => void;
  navigateToEntity: (entity: Entity) => void;
}

export const LocationTree: React.FC<LocationTreeProps> = ({
  parentId,
  entities,
  depth = 0,
  visited = new Set<string>(),
  expandedNodes,
  toggleNode,
  navigateToEntity
}) => {
  if (visited.has(parentId)) return null; // Cycle detection
  
  const children = entities.filter(e => e.locationId === parentId);
  if (children.length === 0) return null;

  const newVisited = new Set(visited);
  newVisited.add(parentId);

  return (
    <div className={depth > 0 ? "ml-4 pl-4 border-l border-stone-800 mt-2 space-y-2" : "space-y-2"}>
      {children.map(child => {
        const hasChildren = entities.some(e => e.locationId === child.id);
        const isExpanded = expandedNodes.has(child.id);

        return (
          <div key={child.id} className="flex flex-col items-start">
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <button
                  onClick={() => toggleNode(child.id)}
                  className="p-1 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded transition-colors"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="w-6" />
              )}
              <button 
                onClick={() => navigateToEntity(child)} 
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-stone-900/50 border border-stone-800 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-stone-800 transition-colors"
              >
                <MapPin size={14} />
                <span className="font-medium">{child.name}</span>
                <span className="text-xs text-stone-500 uppercase tracking-wider">{child.type}</span>
              </button>
            </div>
            {hasChildren && isExpanded && (
              <LocationTree 
                parentId={child.id} 
                entities={entities} 
                depth={depth + 1} 
                visited={newVisited}
                expandedNodes={expandedNodes}
                toggleNode={toggleNode}
                navigateToEntity={navigateToEntity}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
