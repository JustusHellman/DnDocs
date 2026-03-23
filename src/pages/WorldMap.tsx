import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, and, or } from 'firebase/firestore';
import { Entity, OperationType } from '../types';
import { Link } from 'react-router-dom';
import { ChevronRight, Map as MapIcon, Globe, Castle, MapPin, Building, Users, Flag, Package, FileText, Scroll, Skull, ArrowLeft, ExternalLink } from 'lucide-react';

const ENTITY_ICONS: Record<string, React.ElementType> = {
  geography: Globe,
  country: Globe,
  settlement: Castle,
  landmark: MapPin,
  shop: Building,
  npc: Users,
  monster: Skull,
  faction: Flag,
  item: Package,
  note: FileText,
  quest: Scroll,
};

export default function WorldMap() {
  const { currentCampaign, user, isDM } = useAuth();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentCampaign || !user) return;

    const fetchEntities = async () => {
      try {
        let q;
        if (isDM) {
          q = query(collection(db, 'entities'), where('campaignId', '==', currentCampaign.id));
        } else {
          q = query(
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
        }
        
        const snapshot = await getDocs(q);
        const fetchedEntities = snapshot.docs.map(doc => doc.data() as Entity);
        setEntities(fetchedEntities);
      } catch (error) {
        console.error('Error fetching entities for map:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEntities();
  }, [currentCampaign, user, isDM]);

  const entityMap = useMemo(() => {
    const map = new Map<string, Entity>();
    entities.forEach(e => map.set(e.id, e));
    return map;
  }, [entities]);

  const breadcrumbs = useMemo(() => {
    const crumbs: Entity[] = [];
    let current = currentParentId ? entityMap.get(currentParentId) : null;
    while (current) {
      crumbs.unshift(current);
      current = current.locationId ? entityMap.get(current.locationId) : null;
    }
    return crumbs;
  }, [currentParentId, entityMap]);

  const currentChildren = useMemo(() => {
    return entities.filter(e => {
      if (currentParentId === null) {
        // Root level: either no locationId, or locationId points to an entity we don't have access to
        return !e.locationId || !entityMap.has(e.locationId);
      }
      return e.locationId === currentParentId;
    }).sort((a, b) => {
      const typeOrder = ['geography', 'country', 'settlement', 'landmark', 'faction', 'shop', 'npc', 'monster', 'item', 'quest', 'note'];
      const typeDiff = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
      if (typeDiff !== 0) return typeDiff;
      return a.name.localeCompare(b.name);
    });
  }, [entities, currentParentId, entityMap]);

  const currentEntity = currentParentId ? entityMap.get(currentParentId) : null;
  const CurrentIcon = currentEntity ? (ENTITY_ICONS[currentEntity.type] || MapPin) : Globe;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-stone-400">Loading World Map...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <MapIcon className="text-amber-500" size={32} />
        <div>
          <h1 className="text-3xl font-bold text-stone-100 font-cinzel tracking-wider">World Map</h1>
          <p className="text-stone-400 mt-1">Explore your campaign world.</p>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center flex-wrap gap-2 mb-6 bg-stone-900/80 backdrop-blur-md p-4 rounded-xl border border-stone-800 shadow-sm">
        <button 
          onClick={() => setCurrentParentId(null)}
          className={`flex items-center gap-1.5 font-medium transition-colors ${currentParentId === null ? 'text-amber-500' : 'text-stone-400 hover:text-stone-200'}`}
        >
          <Globe size={16} />
          World
        </button>
        
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const CrumbIcon = ENTITY_ICONS[crumb.type] || MapPin;
          return (
            <div key={crumb.id} className="flex items-center gap-2">
              <ChevronRight size={16} className="text-stone-600" />
              <button
                onClick={() => setCurrentParentId(crumb.id)}
                className={`flex items-center gap-1.5 font-medium transition-colors ${isLast ? 'text-amber-500' : 'text-stone-400 hover:text-stone-200'}`}
              >
                <CrumbIcon size={16} />
                <span className="truncate max-w-[150px] sm:max-w-[200px]">{crumb.name}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Current Entity Header (if not root) */}
      {currentEntity && (
        <div className="mb-8 p-6 bg-stone-900/60 border border-stone-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-900/20 border border-amber-700/30 flex items-center justify-center text-amber-500 shrink-0">
              <CurrentIcon size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-stone-100 font-cinzel">{currentEntity.name}</h2>
              <p className="text-stone-400 capitalize">{currentEntity.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentParentId(
                currentEntity.locationId && entityMap.has(currentEntity.locationId) 
                  ? currentEntity.locationId 
                  : null
              )}
              className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors font-medium text-sm"
            >
              <ArrowLeft size={16} />
              Go Up
            </button>
            <Link
              to={`/entity/${currentEntity.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg transition-colors font-bold text-sm shadow-lg shadow-amber-900/20"
            >
              <ExternalLink size={16} />
              View Details
            </Link>
          </div>
        </div>
      )}

      {/* Children Grid */}
      <div>
        <h3 className="text-lg font-semibold text-stone-300 mb-4 font-cinzel flex items-center gap-2">
          {currentParentId === null ? 'Top-Level Locations' : 'Inside this location'}
          <span className="text-sm font-sans text-stone-500 bg-stone-800 px-2 py-0.5 rounded-full">{currentChildren.length}</span>
        </h3>
        
        {currentChildren.length === 0 ? (
          <div className="text-center py-16 bg-stone-900/40 border border-stone-800/50 rounded-2xl border-dashed">
            <MapPin size={48} className="mx-auto mb-4 text-stone-700" />
            <p className="text-stone-400 text-lg">Nothing is located here yet.</p>
            {isDM && (
              <Link to={`/entity/new?locationId=${currentParentId || ''}`} className="inline-block mt-4 text-amber-500 hover:text-amber-400 font-medium">
                + Create something here
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {currentChildren.map(child => {
              const ChildIcon = ENTITY_ICONS[child.type] || MapPin;
              return (
                <button
                  key={child.id}
                  onClick={() => setCurrentParentId(child.id)}
                  className="flex flex-col text-left p-4 bg-stone-900 border border-stone-800 hover:border-amber-700/50 hover:bg-stone-800/80 rounded-xl transition-all group shadow-sm"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-stone-800 group-hover:bg-amber-900/20 flex items-center justify-center text-stone-400 group-hover:text-amber-500 transition-colors">
                      <ChildIcon size={20} />
                    </div>
                    <span className="text-xs font-medium text-stone-500 uppercase tracking-wider bg-stone-950 px-2 py-1 rounded-md">
                      {child.type}
                    </span>
                  </div>
                  <h4 className="font-bold text-stone-200 group-hover:text-amber-400 transition-colors truncate w-full text-lg mb-1">
                    {child.name}
                  </h4>
                  <p className="text-sm text-stone-500 line-clamp-2">
                    {child.content ? child.content.replace(/[#*`_]/g, '').substring(0, 80) + '...' : 'No description available.'}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
