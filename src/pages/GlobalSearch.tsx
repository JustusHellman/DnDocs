import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, or, and } from 'firebase/firestore';
import { db } from '../firebase';
import { Entity, OperationType, EntityType } from '../types';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { useAuth } from '../AuthContext';
import { Search, Map, Castle, Users, BookOpen, Package, FileText, Globe, MapPin, Building, Flag, X as XIcon, Scroll, Skull } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import AutoExpandingTextarea from '../components/AutoExpandingTextarea';
import SearchableDropdown from '../components/SearchableDropdown';
import { ENTITY_TYPES_ORDERED } from '../utils/entitySchemas';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<EntityType[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);

  const entityTypes: EntityType[] = ENTITY_TYPES_ORDERED.map(t => t.value as EntityType);

  useEffect(() => {
    if (!user || !currentCampaign) return;

    if (isDM) {
      const q = query(collection(db, 'entities'), where('campaignId', '==', currentCampaign.id));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as Entity);
        setEntities(data);
        setLoading(false);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'entities'));
      return () => unsubscribe();
    } else {
      const q = query(
        collection(db, 'entities'),
        and(
          where('campaignId', '==', currentCampaign.id),
          or(
            where('isPublic', '==', true),
            where('allowedPlayers', 'array-contains', user.uid),
            where('ownerId', '==', user.uid)
          )
        )
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as Entity);
        setEntities(data);
        setLoading(false);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'entities'));
      return () => unsubscribe();
    }
  }, [user, isDM, currentCampaign]);

  const canViewField = (entity: Entity, field: string) => {
    if (isDM) return true;
    if (user && entity.ownerId === user.uid) return true;
    const perm = entity.fieldPermissions?.[field];
    if (!perm) return entity.isPublic;
    if (perm.isPublic) return true;
    if (user && perm.allowedPlayers.includes(user.uid)) return true;
    return false;
  };

  const filteredEntities = entities.filter(entity => {
    const term = searchTerm.toLowerCase();
    const canViewContent = canViewField(entity, 'content');
    const canViewTags = canViewField(entity, 'tags');
    
    // Type filter
    if (selectedTypes.length > 0 && !selectedTypes.includes(entity.type)) {
      return false;
    }

    // Location filter
    if (selectedLocationId && entity.locationId !== selectedLocationId) {
      return false;
    }

    return (
      entity.name.toLowerCase().includes(term) ||
      (canViewContent && entity.content.toLowerCase().includes(term)) ||
      (canViewTags && entity.tags.some(tag => tag.toLowerCase().includes(term)))
    );
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
    <div className="max-w-4xl mx-auto">
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
        <div className="text-center py-12 text-stone-500">Loading database...</div>
      ) : (
        <div className="space-y-4">
          {filteredEntities.length === 0 ? (
            <div className="text-center py-12 text-stone-500 bg-stone-900/40 backdrop-blur-sm rounded-xl border border-stone-800/50">
              No results found for "{searchTerm}"
            </div>
          ) : (
            filteredEntities.map(entity => {
              const Icon = iconMap[entity.type] || FileText;
              return (
                <Link
                  key={entity.id}
                  to={`/entity/${entity.id}`}
                  className="block p-5 bg-stone-900/60 backdrop-blur-sm border border-stone-800/50 rounded-xl hover:border-amber-500/50 hover:bg-stone-800/60 transition-all group"
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
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
