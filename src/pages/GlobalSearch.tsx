import { useState, useEffect } from 'react';
import { Entity, OperationType, EntityType } from '../types';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { useAuth } from '../AuthContext';
import { useEntities } from '../hooks/useEntities';
import { usePermissions } from '../hooks/usePermissions';
import { Search, Map, Castle, Users, BookOpen, Package, FileText, Globe, MapPin, Building, Flag, X as XIcon, Scroll, Skull } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import AutoExpandingTextarea from '../components/AutoExpandingTextarea';
import SearchableDropdown from '../components/SearchableDropdown';
import { ENTITY_TYPES_ORDERED, ENTITY_HIERARCHY } from '../utils/entitySchemas';
import { useTabActions } from '../contexts/TabContext';
import { useNavigation } from '../hooks/useNavigation';

const iconMap: Record<string, any> = {
  npc: Users,
  monster: Skull,
  settlement: Castle,
  landmark: MapPin,
  geography: Map,
  country: Globe,
  faction: Flag,
  shop: Building,
  item: Package,
  note: FileText,
  quest: Scroll,
};

export default function GlobalSearch() {
  const { user, isDM, currentCampaign } = useAuth();
  const { openTab } = useTabActions();
  const { navigateToEntity } = useNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<EntityType[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const { entities, loading, error } = useEntities();
  const { canViewEntity, canViewField } = usePermissions();
  const [retryCount, setRetryCount] = useState(0);

  const entityTypes: EntityType[] = ENTITY_TYPES_ORDERED.map(t => t.value as EntityType);

  const isEntityInLocation = (entity: Entity, targetId: string, allEntities: Entity[]): boolean => {
    if (entity.locationId === targetId) return true;
    if (!entity.locationId) return false;
    
    // Find the parent entity to check its location
    const parent = allEntities.find(e => e.id === entity.locationId);
    if (!parent) return false;
    
    return isEntityInLocation(parent, targetId, allEntities);
  };

  const filteredEntities = entities.filter(entity => {
    // Check if user can see the entity at all
    if (!canViewEntity(entity)) return false;

    const term = searchTerm.toLowerCase();
    
    // Type filter
    if (selectedTypes.length > 0 && !selectedTypes.includes(entity.type)) {
      return false;
    }

    // Location filter (Recursive)
    if (selectedLocationId && !isEntityInLocation(entity, selectedLocationId, entities)) {
      return false;
    }

    if (!term) return true;

    const canViewContent = canViewField(entity, 'content');
    const canViewTags = canViewField(entity, 'tags');

    return (
      entity.name.toLowerCase().includes(term) ||
      (canViewContent && entity.content.toLowerCase().includes(term)) ||
      (canViewTags && entity.tags.some(tag => tag.toLowerCase().includes(term)))
    );
  }).sort((a, b) => {
    const term = searchTerm.toLowerCase();
    
    if (!term) {
      const sizeA = ENTITY_HIERARCHY[a.type] || 0;
      const sizeB = ENTITY_HIERARCHY[b.type] || 0;
      if (sizeA !== sizeB) {
        return sizeB - sizeA; // Descending size
      }
      return a.name.localeCompare(b.name);
    }

    // Relevance sort
    const getRelevance = (entity: Entity) => {
      const name = entity.name.toLowerCase();
      if (name === term) return 100;
      if (name.startsWith(term)) return 80;
      if (name.includes(term)) return 60;
      
      const canViewContent = canViewField(entity, 'content');
      if (canViewContent && entity.content.toLowerCase().includes(term)) return 40;
      
      const canViewTags = canViewField(entity, 'tags');
      if (canViewTags && entity.tags.some(tag => tag.toLowerCase().includes(term))) return 20;
      
      return 0;
    };

    const relA = getRelevance(a);
    const relB = getRelevance(b);
    
    if (relA !== relB) {
      return relB - relA; // Descending relevance
    }
    
    // Fallback to hierarchy then alphabetical if relevance is same
    const sizeA = ENTITY_HIERARCHY[a.type] || 0;
    const sizeB = ENTITY_HIERARCHY[b.type] || 0;
    if (sizeA !== sizeB) {
      return sizeB - sizeA;
    }
    return a.name.localeCompare(b.name);
  });

  const locations = entities.filter(e => ['country', 'settlement', 'geography', 'landmark'].includes(e.type));
  const locationOptions = locations.map(l => ({ id: l.id, label: l.name, type: l.type }));

  const toggleType = (type: EntityType) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type) 
        : [...prev, type]
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-amber-500 mb-2">Global Search</h1>
        <p className="text-stone-400">Search across all NPCs, settlements, landmarks, countries, factions, shops, items, and notes.</p>
      </div>

      <div className="space-y-4 mb-8">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-stone-500" />
          </div>
          <AutoExpandingTextarea
            placeholder="Search by name, content, or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-11 pr-4 py-4 bg-stone-900/60 backdrop-blur-sm border border-stone-800/50 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all shadow-sm text-lg min-h-[66px]"
          />
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 flex flex-wrap gap-2">
            {entityTypes.map(type => {
              const Icon = iconMap[type] || FileText;
              const isActive = selectedTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                    isActive 
                      ? "bg-amber-600 border-amber-500 text-stone-950 shadow-[0_0_15px_rgba(245,158,11,0.3)]" 
                      : "bg-stone-900/40 border-stone-800 text-stone-400 hover:border-stone-700 hover:bg-stone-800/60"
                  )}
                >
                  <Icon size={14} />
                  <span className="capitalize">{type}s</span>
                </button>
              );
            })}
          </div>
          <div className="w-full md:w-64">
            <SearchableDropdown
              options={locationOptions}
              value={selectedLocationId}
              onChange={(val) => setSelectedLocationId(val)}
              placeholder="Filter by location..."
            />
          </div>
        </div>
        {(selectedTypes.length > 0 || selectedLocationId) && (
          <button
            onClick={() => {
              setSelectedTypes([]);
              setSelectedLocationId('');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-stone-500 hover:text-stone-300 transition-colors"
          >
            <XIcon size={14} />
            Clear All Filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-stone-500">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500 mb-4"></div>
          <p className="text-lg font-medium">Consulting the archives...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12 px-6 bg-red-950/20 border border-red-900/30 rounded-xl">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => setRetryCount(prev => prev + 1)}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors"
          >
            Retry Connection
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntities.length === 0 ? (
            <div className="text-center py-12 text-stone-500 bg-stone-900/40 backdrop-blur-sm rounded-xl border border-stone-800/50">
              Nothing to see here
            </div>
          ) : (
            filteredEntities.map(entity => {
              const Icon = iconMap[entity.type] || FileText;
              return (
                <div
                  key={entity.id}
                  onClick={() => navigateToEntity(entity)}
                  className="block p-5 bg-stone-900/60 backdrop-blur-sm border border-stone-800/50 rounded-xl hover:border-amber-500/50 hover:bg-stone-800/60 transition-all group cursor-pointer"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-stone-950/80 rounded-lg text-amber-400 group-hover:text-amber-300 group-hover:bg-amber-950/30 transition-colors">
                      <Icon size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-display font-bold text-stone-100 truncate">{entity.name}</h3>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-stone-800/80 text-stone-400 uppercase tracking-wider">
                          {entity.type}
                        </span>
                        {!entity.isPublic && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-950/30 text-red-400 border border-red-900/30">
                            Secret
                          </span>
                        )}
                      </div>
                      {canViewField(entity, 'content') ? (
                        <p className="text-stone-400 text-sm line-clamp-2 mb-3">
                          {entity.content}
                        </p>
                      ) : (
                        <p className="text-stone-600 text-sm italic mb-3">
                          Content hidden
                        </p>
                      )}
                      {entity.tags && entity.tags.length > 0 && canViewField(entity, 'tags') && (
                        <div className="flex flex-wrap gap-2">
                          {entity.tags.map(tag => (
                            <span key={tag} className="px-2 py-1 rounded-md text-xs font-medium bg-stone-800/80 text-stone-300 border border-stone-700/50">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
