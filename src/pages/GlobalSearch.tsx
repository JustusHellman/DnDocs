import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, or } from 'firebase/firestore';
import { db } from '../firebase';
import { Entity, OperationType } from '../types';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { useAuth } from '../AuthContext';
import { Search, Map, Castle, Users, BookOpen, Package, FileText, Globe, MapPin, Building, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

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

export default function GlobalSearch() {
  const { user, isDM, currentCampaign } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);

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
        where('campaignId', '==', currentCampaign.id),
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
    return (
      entity.name.toLowerCase().includes(term) ||
      (canViewContent && entity.content.toLowerCase().includes(term)) ||
      (canViewTags && entity.tags.some(tag => tag.toLowerCase().includes(term)))
    );
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-amber-500 mb-2">Global Search</h1>
        <p className="text-stone-400">Search across all NPCs, settlements, landmarks, countries, factions, shops, items, and notes.</p>
      </div>

      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-stone-500" />
        </div>
        <input
          type="text"
          placeholder="Search by name, content, or tags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-4 bg-stone-900/60 backdrop-blur-sm border border-stone-800/50 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all shadow-sm text-lg"
        />
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
