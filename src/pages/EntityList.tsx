import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, or } from 'firebase/firestore';
import { db } from '../firebase';
import { Entity, OperationType } from '../types';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { useAuth } from '../AuthContext';
import { Plus, Search, Map, Castle, Users, BookOpen, Package, FileText, Globe, MapPin, Building, Flag } from 'lucide-react';

const iconMap: Record<string, any> = {
  npc: Users,
  settlement: Castle,
  landmark: MapPin,
  country: Globe,
  faction: Flag,
  shop: Building,
  item: Package,
  note: FileText,
};

export default function EntityList() {
  const { type } = useParams<{ type: string }>();
  const { user, isDM, currentCampaign } = useAuth();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!type || !user || !currentCampaign) return;
    
    if (isDM) {
      const q = query(collection(db, 'entities'), where('campaignId', '==', currentCampaign.id));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as Entity);
        setEntities(data.filter(e => e.type === type));
        setLoading(false);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'entities'));
      return () => unsubscribe();
    } else {
      const q = query(
        collection(db, 'entities'),
        where('campaignId', '==', currentCampaign.id),
        where('type', '==', type),
        or(
          where('isPublic', '==', true),
          where('allowedPlayers', 'array-contains', user.uid),
          where('ownerId', '==', user.uid)
        )
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as Entity);
        setEntities(data);
        setLoading(false);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'entities'));
      return () => unsubscribe();
    }
  }, [type, user, isDM, currentCampaign]);

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
    const canViewName = true; // Name is always visible if entity is visible
    const canViewTags = canViewField(entity, 'tags');
    return (
      entity.name.toLowerCase().includes(term) ||
      (canViewTags && entity.tags.some(tag => tag.toLowerCase().includes(term)))
    );
  });

  const Icon = type ? iconMap[type] || FileText : FileText;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-amber-500 mb-2 capitalize flex items-center gap-3">
            <Icon className="text-amber-400" size={32} />
            {type}s
          </h1>
          <p className="text-stone-400">Browse and manage all {type}s in the database.</p>
        </div>
        {(isDM || type === 'note') && (
          <Link
            to={`/entity/new?type=${type}`}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg font-bold transition-colors"
          >
            <Plus size={20} />
            New {type}
          </Link>
        )}
      </div>

      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-stone-500" />
        </div>
        <input
          type="text"
          placeholder={`Search ${type}s...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-stone-900/60 backdrop-blur-sm border border-stone-800/50 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-stone-500">Loading {type}s...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEntities.length === 0 ? (
            <div className="col-span-full text-center py-12 text-stone-500 bg-stone-900/40 backdrop-blur-sm rounded-xl border border-stone-800/50">
              No {type}s found.
            </div>
          ) : (
            filteredEntities.map(entity => (
              <Link
                key={entity.id}
                to={`/entity/${entity.id}`}
                className="block p-5 bg-stone-900/60 backdrop-blur-sm border border-stone-800/50 rounded-xl hover:border-amber-500/50 hover:bg-stone-800/60 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-display font-bold text-stone-100 truncate pr-4">{entity.name}</h3>
                  {!entity.isPublic && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/30 text-red-400 border border-red-900/30 uppercase tracking-wider shrink-0">
                      Secret
                    </span>
                  )}
                </div>
                {canViewField(entity, 'content') ? (
                  <p className="text-stone-400 text-sm line-clamp-3 mb-4">
                    {entity.content}
                  </p>
                ) : (
                  <p className="text-stone-600 text-sm italic mb-4">
                    Content hidden
                  </p>
                )}
                {entity.tags && entity.tags.length > 0 && canViewField(entity, 'tags') && (
                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    {entity.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded text-xs font-medium bg-stone-800/80 text-stone-300 border border-stone-700/50">
                        #{tag}
                      </span>
                    ))}
                    {entity.tags.length > 3 && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-stone-800/80 text-stone-500 border border-stone-700/50">
                        +{entity.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
