import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, deleteDoc, collection, getDocs, query, where, getDoc, setDoc, or } from 'firebase/firestore';
import { db } from '../firebase';
import { Entity, User, OperationType, Relationship } from '../types';
import { ENTITY_SCHEMAS } from '../utils/entitySchemas';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { useAuth } from '../AuthContext';
import { Edit, Trash2, ArrowLeft, Lock, Globe, Users, BookOpen, MapPin, Plus, X, ChevronRight, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import CollapsibleSection from '../components/CollapsibleSection';
import SearchableDropdown from '../components/SearchableDropdown';

export default function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDM, user, currentCampaign } = useAuth();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [locationEntity, setLocationEntity] = useState<Entity | null>(null);
  const [locatedHere, setLocatedHere] = useState<Entity[]>([]);
  const [allCampaignEntities, setAllCampaignEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);

  // Modal state
  const [showRelModal, setShowRelModal] = useState(false);
  const [relTargetId, setRelTargetId] = useState('');
  const [relTargetIsMy, setRelTargetIsMy] = useState('');
  const [relIAmTargets, setRelIAmTargets] = useState('');
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [existingLabels, setExistingLabels] = useState<string[]>([]);
  const [savingRel, setSavingRel] = useState(false);

  // Expanded nodes for LocationTree
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    allCampaignEntities.forEach(e => {
      if (allCampaignEntities.some(child => child.locationId === e.id)) {
        allIds.add(e.id);
      }
    });
    if (entity) allIds.add(entity.id);
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const canViewField = (field: string) => {
    if (isDM) return true;
    if (!entity) return false;
    if (user && entity.ownerId === user.uid) return true;
    const perm = entity.fieldPermissions?.[field];
    if (!perm) return entity.isPublic; // fallback to entity's global isPublic
    if (perm.isPublic) return true;
    if (user && perm.allowedPlayers.includes(user.uid)) return true;
    return false;
  };

  useEffect(() => {
    if (!id) return;
    
    const unsubscribe = onSnapshot(doc(db, 'entities', id), async (docSnap) => {
      if (docSnap.exists()) {
        const entityData = docSnap.data() as Entity;
        setEntity(entityData);

        if (currentCampaign) {
          try {
            // Fetch location entity
            if (entityData.locationId) {
              const locDoc = await getDoc(doc(db, 'entities', entityData.locationId));
              if (locDoc.exists()) setLocationEntity(locDoc.data() as Entity);
            } else {
              setLocationEntity(null);
            }

            // Fetch all campaign entities for the location tree
            let allEntQ;
            if (isDM) {
              allEntQ = query(collection(db, 'entities'), where('campaignId', '==', currentCampaign.id));
            } else {
              allEntQ = query(
                collection(db, 'entities'),
                where('campaignId', '==', currentCampaign.id),
                or(
                  where('isPublic', '==', true),
                  where('allowedPlayers', 'array-contains', user.uid),
                  where('ownerId', '==', user.uid)
                )
              );
            }
            const allEntSnap = await getDocs(allEntQ);
            const allEnts = allEntSnap.docs.map(d => d.data() as Entity);
            setAllCampaignEntities(allEnts);

            // Set located here for a quick check if it has children
            setLocatedHere(allEnts.filter(e => e.locationId === id));

            // Fetch relationships
            const relsQ = query(collection(db, 'relationships'), where('campaignId', '==', currentCampaign.id), where('sourceId', '==', id));
            const relsSnap = await getDocs(relsQ);
            setRelationships(relsSnap.docs.map(d => d.data() as Relationship));
          } catch (err) {
            console.error("Error fetching related data", err);
          }
        }
      } else {
        setEntity(null);
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, `entities/${id}`));

    return () => unsubscribe();
  }, [id, currentCampaign]);

  useEffect(() => {
    if (isDM && currentCampaign) {
      getDocs(collection(db, 'users'))
        .then(snapshot => {
          setPlayers(snapshot.docs.map(doc => doc.data() as User).filter(u => currentCampaign.players.includes(u.uid)));
        })
        .catch(error => handleFirestoreError(error, OperationType.LIST, 'users'));
    }
  }, [isDM, currentCampaign]);

  const handleDelete = async () => {
    if (!id || !window.confirm('Are you sure you want to delete this entity?')) return;
    try {
      await deleteDoc(doc(db, 'entities', id));
      navigate(-1);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `entities/${id}`);
    }
  };

  const handleOpenRelModal = async () => {
    if (!currentCampaign) return;
    setShowRelModal(true);
    try {
      const entQ = query(collection(db, 'entities'), where('campaignId', '==', currentCampaign.id));
      const entSnap = await getDocs(entQ);
      setAllEntities(entSnap.docs.map(d => d.data() as Entity).filter(e => e.id !== id));

      const allRelsQ = query(collection(db, 'relationships'), where('campaignId', '==', currentCampaign.id));
      const allRelsSnap = await getDocs(allRelsQ);
      const labels = new Set<string>();
      allRelsSnap.docs.forEach(d => labels.add(d.data().label));
      setExistingLabels(Array.from(labels));
    } catch (err) {
      console.error("Error fetching data for modal", err);
    }
  };

  const handleSaveRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relTargetId || !relTargetIsMy || !relIAmTargets || !entity || !currentCampaign) return;
    setSavingRel(true);
    try {
      const targetEntity = allEntities.find(e => e.id === relTargetId);
      if (!targetEntity) return;

      const rel1Id = crypto.randomUUID();
      const rel2Id = crypto.randomUUID();

      const rel1: Relationship = {
        id: rel1Id,
        campaignId: currentCampaign.id,
        sourceId: entity.id,
        targetId: targetEntity.id,
        targetName: targetEntity.name,
        label: relTargetIsMy,
        reverseId: rel2Id,
        createdAt: new Date().toISOString()
      };

      const rel2: Relationship = {
        id: rel2Id,
        campaignId: currentCampaign.id,
        sourceId: targetEntity.id,
        targetId: entity.id,
        targetName: entity.name,
        label: relIAmTargets,
        reverseId: rel1Id,
        createdAt: new Date().toISOString()
      };

      await Promise.all([
        setDoc(doc(db, 'relationships', rel1Id), rel1),
        setDoc(doc(db, 'relationships', rel2Id), rel2)
      ]);

      setRelationships(prev => [...prev, rel1]);
      setShowRelModal(false);
      setRelTargetId('');
      setRelTargetIsMy('');
      setRelIAmTargets('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'relationships');
    } finally {
      setSavingRel(false);
    }
  };

  const handleDeleteRelationship = async (rel: Relationship) => {
    if (!window.confirm('Remove this relationship?')) return;
    try {
      await Promise.all([
        deleteDoc(doc(db, 'relationships', rel.id)),
        deleteDoc(doc(db, 'relationships', rel.reverseId))
      ]);
      setRelationships(prev => prev.filter(r => r.id !== rel.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'relationships');
    }
  };

  if (loading) return <div className="text-center py-12 text-stone-500">Loading entity...</div>;
  if (!entity) return <div className="text-center py-12 text-red-500">Entity not found or you don't have permission to view it.</div>;

  const playerKnowledge = entity.playerKnowledge || {};
  const myKnowledge = user && !isDM ? playerKnowledge[user.uid] : null;

  const LocationTree = ({ parentId, entities, depth = 0, visited = new Set<string>() }: { parentId: string, entities: Entity[], depth?: number, visited?: Set<string> }) => {
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
                <Link to={`/entity/${child.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 bg-stone-900/50 border border-stone-800 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-stone-800 transition-colors">
                  <MapPin size={14} />
                  <span className="font-medium">{child.name}</span>
                  <span className="text-xs text-stone-500 uppercase tracking-wider">{child.type}</span>
                </Link>
              </div>
              {hasChildren && isExpanded && (
                <LocationTree parentId={child.id} entities={entities} depth={depth + 1} visited={newVisited} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-stone-400 hover:text-stone-100 transition-colors text-sm font-medium">
          <ArrowLeft size={16} />
          Back
        </button>
      </div>

      <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl overflow-hidden shadow-xl mb-8">
        <div className="p-8 border-b border-stone-800 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-stone-800 text-stone-300 uppercase tracking-widest">
                {entity.type}
              </span>
              {entity.type === 'npc' && entity.gender && canViewField('gender') && (
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-950/30 text-amber-400 border border-amber-900/30 uppercase tracking-widest">
                  {entity.gender}
                </span>
              )}
              {entity.isPublic ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-950/30 text-emerald-400 border border-emerald-900/30 uppercase tracking-widest">
                  <Globe size={12} /> Public
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-red-950/30 text-red-400 border border-red-900/30 uppercase tracking-widest">
                  <Lock size={12} /> Secret
                </span>
              )}
            </div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-4">{entity.name}</h1>
            
            {entity.tags && entity.tags.length > 0 && canViewField('tags') && (
              <div className="flex flex-wrap gap-2">
                {entity.tags.map(tag => (
                  <span key={tag} className="px-3 py-1 rounded-lg text-sm font-medium bg-stone-950 text-amber-300 border border-stone-800">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          
          {(isDM || (entity.type === 'note' && entity.ownerId === user?.uid)) && (
            <div className="flex items-center gap-3">
              <Link
                to={`/entity/${entity.id}/edit`}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-stone-100 rounded-lg transition-colors"
                title="Edit"
              >
                <Edit size={20} />
              </Link>
              <button
                onClick={handleDelete}
                className="p-2 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-900/30 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 size={20} />
              </button>
            </div>
          )}
        </div>

        <div className="p-8">
          {entity.attributes && Object.keys(entity.attributes).length > 0 && (
            <CollapsibleSection title="Attributes">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(entity.attributes).map(([key, value]) => {
                    if (value === undefined || value === null || value === '') return null;
                    if (!canViewField(key)) return null;
                    
                    const schema = ENTITY_SCHEMAS[entity.type]?.find(s => s.key === key);
                    const label = schema ? schema.label : key;
                    
                    return (
                      <div key={key} className={`bg-stone-950 rounded-xl p-4 border border-stone-800 ${schema?.type === 'textarea' ? 'col-span-full' : ''}`}>
                        <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">{label}</div>
                        <div className="text-stone-300 whitespace-pre-wrap font-medium">
                          {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>
            )}

            {entity.imageUrls && entity.imageUrls.length > 0 && canViewField('imageUrls') && (
              <CollapsibleSection title="Images & Maps">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {entity.imageUrls.map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-stone-800 bg-stone-950 aspect-video hover:border-amber-500/50 transition-colors">
                      <img src={url} alt={`${entity.name} image ${index + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </a>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {(locationEntity && canViewField('locationId') || locatedHere.length > 0) && (
              <CollapsibleSection title="Location">
                {locationEntity && canViewField('locationId') && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">Located In</h3>
                    <Link to={`/entity/${locationEntity.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-stone-800 transition-colors">
                      <MapPin size={16} />
                      {locationEntity.name}
                    </Link>
                  </div>
                )}

                {locatedHere.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">Located Here</h3>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={expandAll}
                          className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                        >
                          Expand All
                        </button>
                        <span className="text-stone-700 text-xs">|</span>
                        <button 
                          onClick={collapseAll}
                          className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                        >
                          Collapse All
                        </button>
                      </div>
                    </div>
                    <LocationTree parentId={entity.id} entities={allCampaignEntities} />
                  </div>
                )}
              </CollapsibleSection>
            )}

            <CollapsibleSection title="Relationships">
              <div className="flex items-center justify-end mb-4">
                {isDM && (
                  <button onClick={handleOpenRelModal} className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1">
                    <Plus size={16} /> Add Relationship
                  </button>
                )}
              </div>
          {relationships.length === 0 ? (
            <p className="text-stone-500 text-sm">No relationships defined yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {relationships.map(rel => (
                <div key={rel.id} className="bg-stone-950/50 border border-stone-800 rounded-xl p-3 flex items-center justify-between group">
                  <div>
                    <Link to={`/entity/${rel.targetId}`} className="font-medium text-amber-400 hover:text-amber-300">
                      {rel.targetName}
                    </Link>
                    <span className="text-stone-400 text-sm ml-2">({rel.label})</span>
                  </div>
                  {isDM && (
                    <button onClick={() => handleDeleteRelationship(rel)} className="text-stone-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Content">
            {canViewField('content') ? (
              <div className="prose prose-invert prose-stone max-w-none">
                <ReactMarkdown>{entity.content}</ReactMarkdown>
              </div>
            ) : (
              <div className="p-6 bg-stone-950 border border-stone-800 rounded-xl text-center">
                <Lock className="mx-auto h-8 w-8 text-stone-600 mb-3" />
                <h3 className="text-lg font-medium text-stone-300 mb-1">Classified Information</h3>
                <p className="text-stone-500 text-sm">You do not have access to the main content of this entity.</p>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Notes">
            <div className="flex items-center justify-end mb-4">
              <Link to={`/entity/new?type=note&locationId=${entity.id}`} className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1">
                <Plus size={16} /> Add Note
              </Link>
            </div>
            {allCampaignEntities.filter(e => e.type === 'note' && e.locationId === entity.id).length === 0 ? (
              <p className="text-stone-500 text-sm">No notes attached to this entity yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {allCampaignEntities.filter(e => e.type === 'note' && e.locationId === entity.id).map(note => (
                  <div key={note.id} className="bg-stone-950/50 border border-stone-800 rounded-xl p-4">
                    <Link to={`/entity/${note.id}`} className="font-medium text-amber-400 hover:text-amber-300 text-lg block mb-2">
                      {note.name}
                    </Link>
                    <div className="prose prose-invert prose-stone max-w-none text-sm line-clamp-3">
                      <ReactMarkdown>{note.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </div>
      </div>

      {/* Player Knowledge Section */}
      {isDM ? (
        <CollapsibleSection title="Player Knowledge">
          <div className="p-2">
            {players.length === 0 ? (
              <p className="text-stone-500 text-sm">No players found in the database.</p>
            ) : (
              <div className="space-y-4">
                {players.map(player => {
                  const knowledge = playerKnowledge[player.uid];
                  return (
                    <div key={player.uid} className="p-4 bg-stone-950 border border-stone-800 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-stone-200">{player.displayName}</h3>
                        {knowledge ? (
                          <span className="text-xs font-medium text-emerald-400 bg-emerald-950/30 px-2 py-1 rounded border border-emerald-900/30">Has Knowledge</span>
                        ) : (
                          <span className="text-xs font-medium text-stone-500 bg-stone-900/50 px-2 py-1 rounded border border-stone-800">No specific knowledge</span>
                        )}
                      </div>
                      {knowledge && (
                        <div className="text-sm text-stone-400 mt-2 p-3 bg-stone-950/50 rounded-lg border border-stone-800/50">
                          {knowledge}
                        </div>
                      )}
                      <div className="mt-3 text-right">
                        <Link to={`/entity/${entity.id}/edit`} className="text-xs text-amber-400 hover:text-amber-300 font-medium">
                          Edit Knowledge
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CollapsibleSection>
      ) : myKnowledge ? (
        <CollapsibleSection title="What You Know">
          <div className="p-2">
            <div className="prose prose-invert prose-amber max-w-none text-amber-200">
              <ReactMarkdown>{myKnowledge}</ReactMarkdown>
            </div>
          </div>
        </CollapsibleSection>
      ) : null}

      {/* Relationship Modal */}
      {showRelModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900/90 backdrop-blur-xl border border-stone-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setShowRelModal(false)} className="absolute top-4 right-4 text-stone-400 hover:text-stone-100">
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-white mb-6">Add Relationship</h2>
            <form onSubmit={handleSaveRelationship} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-400 mb-1">Target Entity</label>
                <SearchableDropdown
                  options={allEntities.map(e => ({ id: e.id, label: e.name, type: e.type }))}
                  value={relTargetId}
                  onChange={setRelTargetId}
                  placeholder="Select an entity..."
                />
              </div>
              
              <datalist id="relationship-labels">
                {existingLabels.map(label => <option key={label} value={label} />)}
              </datalist>

              <div>
                <label className="block text-sm font-medium text-stone-400 mb-1">Target is my...</label>
                <input required type="text" list="relationship-labels" placeholder="e.g. Friend, Father, Enemy" value={relTargetIsMy} onChange={e => setRelTargetIsMy(e.target.value)} className="w-full px-4 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 focus:ring-2 focus:ring-amber-500/50 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-400 mb-1">I am Target's...</label>
                <input required type="text" list="relationship-labels" placeholder="e.g. Friend, Son, Enemy" value={relIAmTargets} onChange={e => setRelIAmTargets(e.target.value)} className="w-full px-4 py-2 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 focus:ring-2 focus:ring-amber-500/50 outline-none" />
              </div>

              <button type="submit" disabled={savingRel} className="w-full py-3 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/50 disabled:opacity-50 text-amber-500 rounded-xl font-medium transition-colors mt-6">
                {savingRel ? 'Saving...' : 'Save Relationship'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
