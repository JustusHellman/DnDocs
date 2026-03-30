import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, deleteDoc, collection, getDocs, query, where, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Entity, User, OperationType, Relationship, DndStats } from '../types';
import { ENTITY_SCHEMAS } from '../utils/entitySchemas';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { useAuth } from '../AuthContext';
import { useEntities } from '../hooks/useEntities';
import { usePermissions } from '../hooks/usePermissions';
import { useTabActions } from '../contexts/TabContext';
import { useNavigation } from '../hooks/useNavigation';
import { Edit, Trash2, ArrowLeft, Lock, Globe, Users, BookOpen, MapPin, Plus, X, ChevronRight, ChevronDown, Info, ExternalLink, Share } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import CollapsibleSection from '../components/CollapsibleSection';
import SearchableDropdown from '../components/SearchableDropdown';
import QuickCreateModal from '../components/QuickCreateModal';
import AutoExpandingTextarea from '../components/AutoExpandingTextarea';
import { EntityHeader } from '../components/EntityHeader';
import { EntityFields } from '../components/EntityFields';
import { LocationTree } from '../components/LocationTree';
import { RelationshipList } from '../components/RelationshipList';
import { StatBlockModal } from '../components/StatBlockModal';
import { RelationshipModal } from '../components/RelationshipModal';

export default function EntityDetail({ entityId }: { entityId?: string }) {
  const params = useParams<{ id: string }>();
  const id = entityId || params.id;
  const navigate = useNavigate();
  const { isDM, user, currentCampaign } = useAuth();
  const { openTab, closeTab } = useTabActions();
  const { navigateToEntity } = useNavigation();
  const { entities: allEntitiesData, loading: entitiesLoading } = useEntities();
  const { canViewEntity, canViewField } = usePermissions();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [players, setPlayers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [locationEntity, setLocationEntity] = useState<Entity | null>(null);
  const [locatedHere, setLocatedHere] = useState<Entity[]>([]);
  const [allCampaignEntities, setAllCampaignEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [ownerName, setOwnerName] = useState<string>('');

  // Modal state
  const [showRelModal, setShowRelModal] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isStatBlockModalOpen, setIsStatBlockModalOpen] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState('');
  const [relTargetId, setRelTargetId] = useState('');
  const [relTargetIsMy, setRelTargetIsMy] = useState('');
  const [relIAmTargets, setRelIAmTargets] = useState('');
  const [allEntities, setAllEntities] = useState<Entity[]>([]);
  const [existingLabels, setExistingLabels] = useState<string[]>([]);
  const [savingRel, setSavingRel] = useState(false);

  // Expanded nodes for LocationTree
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    if (selectedImage) {
      setIsZoomed(false);
    }
  }, [selectedImage]);

  useEffect(() => {
    if (!entitiesLoading) {
      setAllCampaignEntities(allEntitiesData);
      setAllEntities(allEntitiesData);
      setLocatedHere(allEntitiesData.filter(e => {
        if (e.locationId !== id) return false;
        return canViewEntity(e);
      }));
    }
  }, [allEntitiesData, entitiesLoading, id, canViewEntity]);

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

  const markdownComponents = {
    a: ({ node, ...props }: any) => {
      const href = props.href || '';
      if (href.startsWith('/entity/')) {
        const targetId = href.split('/')[2];
        const targetEntity = allEntitiesData.find(e => e.id === targetId);
        if (targetEntity) {
          return (
            <button 
              onClick={() => navigateToEntity(targetEntity)} 
              className="text-amber-400 hover:text-amber-300 underline decoration-amber-500/30 underline-offset-4 inline"
            >
              {props.children}
            </button>
          );
        }
      }
      if (href.startsWith('/')) {
        return <Link to={href} {...props} className="text-amber-400 hover:text-amber-300 underline decoration-amber-500/30 underline-offset-4" />;
      }
      return <a {...props} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline decoration-amber-500/30 underline-offset-4" />;
    }
  };


  useEffect(() => {
    if (!id) return;
    
    const unsubscribe = onSnapshot(doc(db, 'entities', id), async (docSnap) => {
      if (docSnap.exists()) {
        const entityData = docSnap.data() as Entity;
        
        // Check if user can see this entity at all
        if (!canViewEntity(entityData)) {
          navigate('/');
          return;
        }
        
        // Resolve media URLs to base64 for display
        const resolvedImageUrls = [...(entityData.imageUrls || [])];
        let hasMedia = false;
        for (let i = 0; i < resolvedImageUrls.length; i++) {
          const url = resolvedImageUrls[i];
          if (url.startsWith('media:')) {
            hasMedia = true;
            const mediaId = url.replace('media:', '');
            const mediaSnap = await getDoc(doc(db, 'media', mediaId));
            if (mediaSnap.exists()) {
              resolvedImageUrls[i] = mediaSnap.data().data;
            }
          }
        }
        
        if (hasMedia) {
          setEntity({ ...entityData, imageUrls: resolvedImageUrls });
        } else {
          setEntity(entityData);
        }

        if (currentCampaign) {
          try {
            // Fetch location entity
            if (entityData.locationId) {
              const locDoc = await getDoc(doc(db, 'entities', entityData.locationId));
              if (locDoc.exists()) setLocationEntity(locDoc.data() as Entity);
            } else {
              setLocationEntity(null);
            }

            // Fetch relationships
            const relsQ = query(collection(db, 'relationships'), where('campaignId', '==', currentCampaign.id), where('sourceId', '==', id));
            const relsSnap = await getDocs(relsQ);
            setRelationships(relsSnap.docs.map(d => d.data() as Relationship));

            // Fetch owner name
            if (entityData.ownerId) {
              const ownerDoc = await getDoc(doc(db, 'users', entityData.ownerId));
              if (ownerDoc.exists()) {
                setOwnerName(ownerDoc.data().displayName);
              }
            }
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
      // Delete associated media to avoid orphaned data
      if (entity && entity.imageUrls) {
        const mediaIds = entity.imageUrls
          .filter(url => url.startsWith('media:'))
          .map(url => url.replace('media:', ''));
        
        for (const mediaId of mediaIds) {
          try {
            await deleteDoc(doc(db, 'media', mediaId));
          } catch (err) {
            console.error(`Error deleting media ${mediaId}`, err);
          }
        }
      }

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

  const handleQuickCreate = (newEntity: Entity) => {
    setAllEntities(prev => [...prev, newEntity]);
    setRelTargetId(newEntity.id);
    setIsQuickCreateOpen(false);
  };

  const handlePushToPlayers = async () => {
    if (!id || !entity) return;
    try {
      await updateDoc(doc(db, 'entities', id), {
        lastPushedAt: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `entities/${id}`);
    }
  };

  if (loading) return <div className="text-center py-12 text-stone-500">Loading entity...</div>;
  if (!entity) return <div className="text-center py-12 text-red-500">Entity not found or you don't have permission to view it.</div>;

  const playerKnowledge = entity.playerKnowledge || {};
  const myKnowledge = user && !isDM ? playerKnowledge[user.uid] : null;

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10 pb-12">
      {!entityId && (
        <div className="mb-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-stone-400 hover:text-stone-100 transition-colors text-sm font-medium">
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
      )}

      <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl overflow-hidden shadow-xl mb-8">
        <div className="p-5 sm:p-6 md:p-8 border-b border-stone-800 flex flex-col gap-4">
          {/* Top Row: Title and Actions */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight break-words leading-tight flex-1 min-w-[200px] font-cinzel">
              {entity.name}
            </h1>
            
            {(isDM || (entity.type === 'note' && entity.ownerId === user?.uid)) && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {isDM && (
                  <button
                    onClick={handlePushToPlayers}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 hover:text-amber-300 border border-amber-900/30 rounded-lg transition-colors text-xs font-medium"
                    title="Push to Players"
                  >
                    <Share size={14} />
                    <span className="hidden sm:inline">Push</span>
                  </button>
                )}
                <Link
                  to={`/entity/${entity.id}/edit`}
                  onClick={() => {
                    if (entityId) {
                      closeTab(entityId);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-stone-100 rounded-lg transition-colors text-xs font-medium"
                  title="Edit"
                >
                  <Edit size={14} />
                  <span className="hidden sm:inline">Edit</span>
                </Link>
                <button
                  onClick={handleDelete}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-900/30 rounded-lg transition-colors text-xs font-medium"
                  title="Delete"
                >
                  <Trash2 size={14} />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </div>
            )}
          </div>

          {/* Bottom Row: Badges and Tags */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold bg-stone-800 text-stone-300 uppercase tracking-widest">
              {entity.type}
            </span>
            {entity.type === 'npc' && entity.gender && canViewField(entity, 'gender') && (
              <span className="px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold bg-amber-950/30 text-amber-400 border border-amber-900/30 uppercase tracking-widest">
                {entity.gender}
              </span>
            )}
            {entity.isPublic ? (
              <span className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold bg-emerald-950/30 text-emerald-400 border border-emerald-900/30 uppercase tracking-widest">
                <Globe size={12} /> Public
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] sm:text-xs font-bold bg-red-950/30 text-red-400 border border-red-900/30 uppercase tracking-widest">
                <Lock size={12} /> Secret
              </span>
            )}
            {ownerName && (
              <div className="group relative flex items-center">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-stone-800 text-stone-400 cursor-help hover:bg-stone-700 hover:text-stone-200 transition-colors">
                  <Info size={12} />
                </span>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-stone-800 text-stone-200 text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-stone-700 z-50">
                  Created by {ownerName}
                </div>
              </div>
            )}
            
            {entity.tags && entity.tags.length > 0 && canViewField(entity, 'tags') && (
              <>
                <div className="w-px h-4 bg-stone-700 mx-1 hidden sm:block"></div>
                {entity.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-medium bg-stone-950 text-amber-300 border border-stone-800">
                    #{tag}
                  </span>
                ))}
              </>
            )}
            
            {(entity.type === 'npc' || entity.type === 'monster') && (entity.statBlock || entity.dndStats) && canViewField(entity, 'statBlock') && (
              <>
                <div className="w-px h-4 bg-stone-700 mx-1 hidden sm:block"></div>
                <button
                  onClick={() => setIsStatBlockModalOpen(true)}
                  className="flex items-center gap-1.5 px-2 py-1 bg-stone-800 hover:bg-stone-700 text-amber-400 hover:text-amber-300 rounded-md transition-colors text-[10px] sm:text-xs font-bold border border-stone-700 uppercase tracking-widest"
                >
                  <BookOpen size={12} />
                  Stat Block
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6 md:p-8">
          {entity.attributes && Object.keys(entity.attributes).length > 0 && (
            <CollapsibleSection title="Attributes">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(entity.attributes).map(([key, value]) => {
                    if (value === undefined || value === null || value === '') return null;
                    if (!canViewField(entity, key)) return null;
                    
                    const schema = ENTITY_SCHEMAS[entity.type]?.find(s => s.key === key);
                    const label = schema ? schema.label : key;
                    
                    const isEntitySelect = schema?.type === 'entity-select';
                    const targetEntity = isEntitySelect ? allCampaignEntities.find(e => e.id === value) : null;

                    return (
                      <div key={key} className={`bg-stone-950 rounded-xl p-4 border border-stone-800 ${schema?.type === 'textarea' ? 'col-span-full' : ''}`}>
                        <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">{label}</div>
                        <div className="text-stone-300 whitespace-pre-wrap font-medium">
                          {isEntitySelect ? (
                            targetEntity ? (
                              <button onClick={() => navigateToEntity(targetEntity)} className="text-amber-400 hover:text-amber-300 underline decoration-amber-500/30 underline-offset-4">
                                {targetEntity.name}
                              </button>
                            ) : (
                              <span className="text-stone-600 italic">Unknown Entity</span>
                            )
                          ) : typeof value === 'boolean' ? (
                            value ? 'Yes' : 'No'
                          ) : (
                            String(value)
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>
            )}

            {entity.imageUrls && entity.imageUrls.length > 0 && canViewField(entity, 'imageUrls') && (
              <CollapsibleSection title="Images & Maps">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {entity.imageUrls.map((url, index) => (
                    <button 
                      key={index} 
                      onClick={() => setSelectedImage(url)}
                      className="block w-full rounded-xl overflow-hidden border border-stone-800 bg-stone-950 aspect-video hover:border-amber-500/50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    >
                      <img src={url} alt={`${entity.name} image ${index + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {(locationEntity && canViewField(entity, 'locationId') || locatedHere.length > 0) && (
              <CollapsibleSection title="Location">
                {locationEntity && canViewField(entity, 'locationId') && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">Located In</h3>
                    <button onClick={() => navigateToEntity(locationEntity)} className="inline-flex items-center gap-2 px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-stone-800 transition-colors">
                      <MapPin size={16} />
                      {locationEntity.name}
                    </button>
                  </div>
                )}

                {locatedHere.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">Located Here</h3>
                      <div className="flex items-center gap-3">
                        {isDM && (
                          <button 
                            onClick={() => {
                              setQuickCreateName('');
                              setIsQuickCreateOpen(true);
                            }}
                            className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors flex items-center gap-1"
                          >
                            <Plus size={12} /> Quick Create
                          </button>
                        )}
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
                    <LocationTree 
                      parentId={entity.id} 
                      entities={allCampaignEntities} 
                      expandedNodes={expandedNodes}
                      toggleNode={toggleNode}
                      navigateToEntity={navigateToEntity}
                    />
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
              {relationships.map(rel => {
                const targetEntity = allEntitiesData.find(e => e.id === rel.targetId);
                return (
                  <div key={rel.id} className="bg-stone-950/50 border border-stone-800 rounded-xl p-3 flex items-center justify-between group">
                    <div>
                      <button 
                        onClick={() => {
                          if (targetEntity) {
                            navigateToEntity(targetEntity);
                          } else {
                            openTab(rel.targetId, rel.targetName, 'unknown');
                          }
                        }} 
                        className="font-medium text-amber-400 hover:text-amber-300"
                      >
                        {rel.targetName}
                      </button>
                      <span className="text-stone-400 text-sm ml-2">({rel.label})</span>
                    </div>
                    {isDM && (
                      <button onClick={() => handleDeleteRelationship(rel)} className="text-stone-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Content">
            {canViewField(entity, 'content') ? (
              <div data-color-mode="dark" className="prose prose-invert prose-stone max-w-none bg-transparent">
                <MDEditor.Markdown source={entity.content} className="!bg-transparent" components={markdownComponents} />
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
              <Link
                to={`/entity/new?type=note&locationId=${entity.id}`}
                onClick={() => {
                  if (entityId) closeTab(entityId);
                }}
                className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1"
              >
                <Plus size={16} /> Add Note
              </Link>
            </div>
            {allCampaignEntities.filter(e => e.type === 'note' && e.locationId === entity.id).length === 0 ? (
              <p className="text-stone-500 text-sm">No notes attached to this entity yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {allCampaignEntities.filter(e => e.type === 'note' && e.locationId === entity.id).map(note => (
                  <div key={note.id} className="bg-stone-950/50 border border-stone-800 rounded-xl p-4">
                    <button onClick={() => navigateToEntity(note)} className="font-medium text-amber-400 hover:text-amber-300 text-lg block mb-2 text-left">
                      {note.name}
                    </button>
                    <div data-color-mode="dark" className="prose prose-invert prose-stone max-w-none text-sm line-clamp-3 bg-transparent">
                      <MDEditor.Markdown source={note.content} className="!bg-transparent" components={markdownComponents} />
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
        <>
          {entity.dmNotes && (
            <div className="bg-stone-900/80 backdrop-blur-md border border-red-900/50 rounded-2xl p-8 shadow-xl mb-6">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="text-red-400" size={24} />
                <h2 className="text-xl font-bold text-stone-100 font-cinzel tracking-wider">DM Secret Notes</h2>
              </div>
              <div data-color-mode="dark" className="prose prose-invert prose-stone max-w-none bg-transparent">
                <MDEditor.Markdown source={entity.dmNotes} className="!bg-transparent" components={markdownComponents} />
              </div>
            </div>
          )}
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
                        <Link
                          to={`/entity/${entity.id}/edit`}
                          onClick={() => {
                            if (entityId) closeTab(entityId);
                          }}
                          className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                        >
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
        </>
      ) : myKnowledge ? (
        <CollapsibleSection title="What You Know">
          <div className="p-2">
            <div data-color-mode="dark" className="prose prose-invert prose-amber max-w-none text-amber-200 bg-transparent">
              <MDEditor.Markdown source={myKnowledge} className="!bg-transparent" components={markdownComponents} />
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
                  onCreateNew={(name) => {
                    setQuickCreateName(name);
                    setIsQuickCreateOpen(true);
                  }}
                />
              </div>
              
              <datalist id="relationship-labels">
                {existingLabels.map(label => <option key={label} value={label} />)}
              </datalist>

              <div>
                <label className="block text-sm font-medium text-stone-400 mb-1">Target is my...</label>
                <AutoExpandingTextarea
                  required
                  list="relationship-labels"
                  placeholder="e.g. Friend, Father, Enemy"
                  value={relTargetIsMy}
                  onChange={e => setRelTargetIsMy(e.target.value)}
                  className="min-h-[42px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-400 mb-1">I am Target's...</label>
                <AutoExpandingTextarea
                  required
                  list="relationship-labels"
                  placeholder="e.g. Friend, Son, Enemy"
                  value={relIAmTargets}
                  onChange={e => setRelIAmTargets(e.target.value)}
                  className="min-h-[42px]"
                />
              </div>

              <button type="submit" disabled={savingRel} className="w-full py-3 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/50 disabled:opacity-50 text-amber-500 rounded-xl font-medium transition-colors mt-6">
                {savingRel ? 'Saving...' : 'Save Relationship'}
              </button>
            </form>
          </div>
        </div>
      )}

      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        onCreated={handleQuickCreate}
        initialName={quickCreateName}
        sourceEntityId={entity?.id}
        sourceEntityName={entity?.name}
        initialLocationId={entity?.id}
      />

      {isStatBlockModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-stone-800">
              <div>
                <h2 className="text-xl font-cinzel font-bold text-stone-100">Stat Block</h2>
                <p className="text-sm text-stone-400">{entity?.name || 'NPC'}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsStatBlockModalOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              {entity?.dndStats && (
                <div className="mb-8 space-y-4 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {entity.dndStats.armorClass && (
                      <div>
                        <span className="text-amber-500 font-bold">Armor Class</span> <span className="text-stone-300">{entity.dndStats.armorClass}</span>
                      </div>
                    )}
                    {entity.dndStats.hitPoints && (
                      <div>
                        <span className="text-amber-500 font-bold">Hit Points</span> <span className="text-stone-300">{entity.dndStats.hitPoints}</span>
                      </div>
                    )}
                    {entity.dndStats.speed && (
                      <div>
                        <span className="text-amber-500 font-bold">Speed</span> <span className="text-stone-300">{entity.dndStats.speed}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-y border-amber-900/50 py-4">
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 text-center">
                      {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((stat) => {
                        const score = entity.dndStats?.[stat as keyof DndStats] as number || 10;
                        const mod = Math.floor((score - 10) / 2);
                        const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
                        return (
                          <div key={stat}>
                            <div className="font-bold text-amber-500 uppercase">{stat}</div>
                            <div className="text-stone-300">{score} ({modStr})</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    {entity.dndStats.skills && (
                      <div><span className="text-amber-500 font-bold">Skills</span> <span className="text-stone-300">{entity.dndStats.skills}</span></div>
                    )}
                    {entity.dndStats.senses && (
                      <div><span className="text-amber-500 font-bold">Senses</span> <span className="text-stone-300">{entity.dndStats.senses}</span></div>
                    )}
                    {entity.dndStats.languages && (
                      <div><span className="text-amber-500 font-bold">Languages</span> <span className="text-stone-300">{entity.dndStats.languages}</span></div>
                    )}
                    {(entity.dndStats.challenge || entity.dndStats.proficiencyBonus) && (
                      <div className="flex gap-6 mt-2">
                        {entity.dndStats.challenge && (
                          <div><span className="text-amber-500 font-bold">Challenge</span> <span className="text-stone-300">{entity.dndStats.challenge}</span></div>
                        )}
                        {entity.dndStats.proficiencyBonus && (
                          <div><span className="text-amber-500 font-bold">Proficiency Bonus</span> <span className="text-stone-300">{entity.dndStats.proficiencyBonus}</span></div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {entity?.statBlock && (
                <div data-color-mode="dark" className="prose prose-invert prose-stone max-w-none bg-transparent">
                  <MDEditor.Markdown source={entity.statBlock} className="!bg-transparent" components={markdownComponents} />
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-stone-800 flex justify-end gap-3 bg-stone-950/50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsStatBlockModalOpen(false)}
                className="px-6 py-2.5 bg-stone-800 hover:bg-stone-700 text-white rounded-xl font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md overflow-hidden"
          onClick={() => setSelectedImage(null)}
        >
          <button 
            className="absolute top-4 right-4 z-10 p-2 text-stone-400 hover:text-white bg-stone-900/50 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
            onClick={() => setSelectedImage(null)}
            aria-label="Close image"
          >
            <X size={24} />
          </button>
          <div 
            className={`w-full h-full overflow-auto flex ${isZoomed ? 'items-start justify-start cursor-zoom-out' : 'items-center justify-center cursor-zoom-in'}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsZoomed(!isZoomed);
            }}
          >
            <img 
              src={selectedImage} 
              alt="Fullscreen view" 
              className={`transition-all duration-300 origin-top-left ${isZoomed ? 'w-[200vw] md:w-[150vw] max-w-none h-auto' : 'max-w-full max-h-full object-contain rounded-lg shadow-2xl'}`}
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
