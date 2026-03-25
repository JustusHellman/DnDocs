import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Entity, EntityType, User, OperationType, FieldPermission, DndStats } from '../types';
import { ENTITY_SCHEMAS, ENTITY_HIERARCHY, ENTITY_TYPES_ORDERED } from '../utils/entitySchemas';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { generateUniqueId } from '../utils/slugify';
import { useAuth } from '../AuthContext';
import { useEntities } from '../hooks/useEntities';
import { ArrowLeft, Save, Globe, Lock, Users, Image as ImageIcon, X, Link as LinkIcon, BookOpen, RefreshCw, Upload } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import clsx from 'clsx';
import SearchableDropdown from '../components/SearchableDropdown';
import FieldPermissionToggle from '../components/FieldPermissionToggle';
import LinkModal from '../components/LinkModal';
import QuickCreateModal from '../components/QuickCreateModal';
import AutoExpandingTextarea from '../components/AutoExpandingTextarea';
import MDEditor from '@uiw/react-md-editor';

export default function EntityEdit() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const defaultType = (searchParams.get('type') as EntityType) || 'npc';
  
  const navigate = useNavigate();
  const { user, isDM, currentCampaign } = useAuth();
  const { entities: allEntities, loading: entitiesLoading } = useEntities();
  
  const [loading, setLoading] = useState(id ? true : false);
  const [saving, setSaving] = useState(false);
  const [players, setPlayers] = useState<User[]>([]);
  const [availableLocations, setAvailableLocations] = useState<Entity[]>([]);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isStatBlockModalOpen, setIsStatBlockModalOpen] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState('');
  
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [customImagePrompt, setCustomImagePrompt] = useState('');

  const generateImage = async () => {
    if (!formData.name) {
      setImageError("Please enter a name first to generate an image.");
      return;
    }
    setGeneratingImage(true);
    setImageError('');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const descriptionPart = customImagePrompt.trim() 
        ? customImagePrompt.trim() 
        : (formData.content ? formData.content.substring(0, 300) : '');
      const prompt = `A high quality fantasy digital art illustration of a ${formData.type} named ${formData.name}. ${descriptionPart} D&D style, high detail.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64Data = `data:image/png;base64,${part.inlineData.data}`;
          
          // Compress the image to avoid Firestore 1MB limit
          const compressedBase64 = await new Promise<string>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const maxWidth = 512;
              let width = img.width;
              let height = img.height;

              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                resolve(base64Data);
                return;
              }
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = base64Data;
          });

          setFormData(prev => ({
            ...prev,
            imageUrls: [...(prev.imageUrls || []), compressedBase64]
          }));
          break;
        }
      }
    } catch (err: any) {
      console.error("Error generating image:", err);
      if (err.message && (err.message.includes("429") || err.message.toLowerCase().includes("quota") || err.message.toLowerCase().includes("exhausted"))) {
        setImageError("You have reached your daily image generation limit. Please try again tomorrow!");
      } else {
        setImageError(err.message || "Failed to generate image. Please try again.");
      }
    } finally {
      setGeneratingImage(false);
    }
  };

  useEffect(() => {
    setAvailableLocations(allEntities.filter(e => e.id !== id));
  }, [allEntities, id]);

  const handleQuickCreate = (newEntity: Entity) => {
    setAvailableLocations(prev => [...prev, newEntity]);
    setFormData(prev => ({ ...prev, locationId: newEntity.id }));
    setIsQuickCreateOpen(false);
  };
  
  const [formData, setFormData] = useState<Partial<Entity>>(() => {
    // Initialize with default values from schema
    const initialAttributes: Record<string, any> = {};
    if (ENTITY_SCHEMAS[defaultType]) {
      ENTITY_SCHEMAS[defaultType].forEach(field => {
        if (field.defaultValue !== undefined) {
          initialAttributes[field.key] = field.defaultValue;
        }
      });
    }

    return {
      type: defaultType,
      name: '',
      content: '',
      tags: [],
      isPublic: false,
      playerKnowledge: {},
      locationId: searchParams.get('locationId') || '',
      gender: '',
      imageUrls: [],
      attributes: initialAttributes,
      fieldPermissions: {},
    };
  });
  
  const [tagInput, setTagInput] = useState('');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [pendingRelationships, setPendingRelationships] = useState<{ targetId: string, label: string, reverseLabel: string, targetName: string }[]>([]);
  const [relSearch, setRelSearch] = useState('');
  const [relLabel, setRelLabel] = useState('');
  const [relReverseLabel, setRelReverseLabel] = useState('');
  const [otherFields, setOtherFields] = useState<Set<string>>(new Set());
  const [existingLabels, setExistingLabels] = useState<string[]>([]);

  const handleDndStatChange = (field: keyof DndStats, value: any) => {
    setFormData(prev => ({
      ...prev,
      dndStats: {
        ...(prev.dndStats || {
          armorClass: '',
          hitPoints: '',
          speed: '',
          str: 10,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
          skills: '',
          senses: '',
          languages: '',
          challenge: '',
          proficiencyBonus: ''
        }),
        [field]: value
      }
    }));
  };

  const calculateModifier = (score: number) => {
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  const typePriority: Record<EntityType, EntityType[]> = {
    npc: ['settlement', 'landmark', 'faction', 'country', 'geography', 'shop', 'note', 'npc', 'item', 'monster', 'quest'],
    item: ['npc', 'shop', 'settlement', 'landmark', 'faction', 'country', 'geography', 'note', 'item', 'monster', 'quest'],
    settlement: ['country', 'geography', 'landmark', 'faction', 'note', 'settlement', 'npc', 'shop', 'item', 'monster', 'quest'],
    landmark: ['country', 'geography', 'settlement', 'faction', 'note', 'landmark', 'npc', 'shop', 'item', 'monster', 'quest'],
    country: ['geography', 'note', 'country', 'settlement', 'landmark', 'faction', 'npc', 'shop', 'item', 'monster', 'quest'],
    faction: ['settlement', 'country', 'geography', 'landmark', 'note', 'faction', 'npc', 'shop', 'item', 'monster', 'quest'],
    shop: ['settlement', 'landmark', 'country', 'geography', 'faction', 'note', 'shop', 'npc', 'item', 'monster', 'quest'],
    note: ['note', 'npc', 'settlement', 'landmark', 'country', 'geography', 'faction', 'shop', 'item', 'monster', 'quest'],
    geography: ['geography', 'country', 'note', 'settlement', 'landmark', 'faction', 'npc', 'shop', 'item', 'monster', 'quest'],
    monster: ['monster', 'npc', 'settlement', 'landmark', 'faction', 'country', 'geography', 'shop', 'note', 'item', 'quest'],
    quest: ['quest', 'npc', 'settlement', 'landmark', 'faction', 'country', 'geography', 'shop', 'note', 'item', 'monster'],
  };

  const dropdownOptions = availableLocations
    .filter(loc => {
      const currentType = formData.type as EntityType;
      const locType = loc.type as EntityType;
      
      // Specific filtering based on common D&D hierarchy
      if (currentType === 'settlement') {
        return ['country', 'geography'].includes(locType);
      }
      if (currentType === 'geography') {
        return ['geography', 'country'].includes(locType);
      }
      if (currentType === 'npc') {
        return ['settlement', 'shop', 'landmark', 'country', 'geography', 'faction'].includes(locType);
      }
      if (currentType === 'shop') {
        return ['settlement', 'landmark', 'country', 'geography'].includes(locType);
      }
      if (currentType === 'landmark') {
        return ['settlement', 'country', 'geography'].includes(locType);
      }
      if (currentType === 'faction') {
        return ['country', 'settlement', 'geography'].includes(locType);
      }
      if (currentType === 'item') {
        return ['npc', 'shop', 'settlement', 'landmark'].includes(locType);
      }
      
      const currentLevel = ENTITY_HIERARCHY[currentType] || 0;
      const locLevel = ENTITY_HIERARCHY[locType] || 0;
      return locLevel > currentLevel || (locLevel === currentLevel && locType === currentType);
    })
    .sort((a, b) => {
      const priorities = typePriority[formData.type as EntityType] || [];
      const typeAIndex = priorities.indexOf(a.type);
      const typeBIndex = priorities.indexOf(b.type);
      
      if (typeAIndex !== typeBIndex) {
        return typeAIndex - typeBIndex;
      }
      return a.name.localeCompare(b.name);
    })
    .map(loc => ({
      id: loc.id,
      label: loc.name,
      type: loc.type
    }));

  useEffect(() => {
    if (!currentCampaign || !user) {
      navigate('/');
      return;
    }

    if (!isDM && !id && defaultType !== 'note') {
      navigate('/');
      return;
    }

    const fetchPlayers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        setPlayers(snapshot.docs.map(doc => doc.data() as User).filter(u => currentCampaign.players.includes(u.uid)));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    };
    fetchPlayers();

    const fetchLabels = async () => {
      try {
        const q = query(collection(db, 'relationships'), where('campaignId', '==', currentCampaign.id));
        const snap = await getDocs(q);
        const labels = new Set<string>();
        snap.docs.forEach(d => labels.add(d.data().label));
        setExistingLabels(Array.from(labels));
      } catch (error) {
        console.error("Error fetching relationship labels", error);
      }
    };
    fetchLabels();

    if (id && id !== 'new') {
      const fetchEntity = async () => {
        try {
          const docSnap = await getDoc(doc(db, 'entities', id));
          if (docSnap.exists()) {
            const data = docSnap.data() as Entity;
            if (!isDM && (data.type !== 'note' || data.ownerId !== user.uid)) {
              navigate('/');
              return;
            }
            setFormData(data);
          } else {
            navigate('/');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `entities/${id}`);
        } finally {
          setLoading(false);
        }
      };
      fetchEntity();
    } else if (id === 'new') {
      if (defaultType === 'note') {
        setFormData(prev => ({
          ...prev,
          attributes: {
            ...prev.attributes,
            date: new Date().toISOString().split('T')[0]
          }
        }));
      }
      setLoading(false);
    }
  }, [id, isDM, navigate, currentCampaign, user, defaultType]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentCampaign) return;
    if (!isDM && formData.type !== 'note') return;
    
    setSaving(true);
    try {
      let entityId = id;
      if (!entityId || entityId === 'new') {
        entityId = await generateUniqueId(formData.name || 'Untitled');
      }
      const now = new Date().toISOString();
      
      const allAllowedPlayers = new Set<string>();
      
      Object.keys(formData.playerKnowledge || {}).forEach(k => {
        if (formData.playerKnowledge![k].trim() !== '') {
          allAllowedPlayers.add(k);
        }
      });

      Object.values(formData.fieldPermissions || {}).forEach(perm => {
        if (perm.isPublic) {
          players.forEach(p => allAllowedPlayers.add(p.uid));
        } else if (perm.allowedPlayers) {
          perm.allowedPlayers.forEach(p => allAllowedPlayers.add(p));
        }
      });

      // If a player is saving a note, ensure they are the owner
      const ownerId = (!isDM && formData.type === 'note') ? user.uid : (formData.ownerId || user.uid);

      const entityData: Entity = {
        id: entityId,
        campaignId: currentCampaign.id,
        type: formData.type as EntityType,
        name: formData.name || 'Untitled',
        content: formData.content || '',
        tags: formData.tags || [],
        ownerId: ownerId,
        isPublic: formData.isPublic || false,
        allowedPlayers: Array.from(allAllowedPlayers),
        playerKnowledge: formData.playerKnowledge || {},
        locationId: formData.locationId || null,
        gender: formData.gender || null,
        imageUrls: formData.imageUrls || [],
        attributes: formData.attributes || {},
        fieldPermissions: formData.fieldPermissions || {},
        statBlock: formData.statBlock,
        dndStats: formData.dndStats,
        dmNotes: formData.dmNotes,
        createdAt: formData.createdAt || now,
        updatedAt: now,
      };

      // Remove undefined values to prevent Firestore errors
      Object.keys(entityData).forEach(key => {
        if ((entityData as any)[key] === undefined) {
          delete (entityData as any)[key];
        }
      });

      await setDoc(doc(db, 'entities', entityId), entityData);

      // Save pending relationships
      for (const rel of pendingRelationships) {
        const relId = `${entityId}_${rel.targetId}`;
        const reverseRelId = `${rel.targetId}_${entityId}`;
        
        const relationship = {
          id: relId,
          campaignId: currentCampaign.id,
          sourceId: entityId,
          targetId: rel.targetId,
          targetName: rel.targetName,
          label: rel.label,
          reverseId: reverseRelId,
          createdAt: now,
        };
        
        const reverseRelationship = {
          id: reverseRelId,
          campaignId: currentCampaign.id,
          sourceId: rel.targetId,
          targetId: entityId,
          targetName: formData.name,
          label: rel.reverseLabel || rel.label, // Fallback if empty
          reverseId: relId,
          createdAt: now,
        };
        
        await Promise.all([
          setDoc(doc(db, 'relationships', relId), relationship),
          setDoc(doc(db, 'relationships', reverseRelId), reverseRelationship)
        ]);
      }

      if (id === 'new' || !(window.history.state && window.history.state.idx > 0)) {
        navigate(`/entity/${entityId}`, { replace: true });
      } else {
        navigate(-1);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `entities/${id || 'new'}`);
    } finally {
      setSaving(false);
    }
  };

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!formData.tags?.includes(tagInput.trim())) {
        setFormData({ ...formData, tags: [...(formData.tags || []), tagInput.trim()] });
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags?.filter(t => t !== tagToRemove) });
  };

  const handleKnowledgeChange = (playerId: string, knowledge: string) => {
    setFormData(prev => ({
      ...prev,
      playerKnowledge: {
        ...(prev.playerKnowledge || {}),
        [playerId]: knowledge
      }
    }));
  };

  const removeImage = (urlToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      imageUrls: prev.imageUrls?.filter(url => url !== urlToRemove) || []
    }));
  };

  const handleAddImageUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrlInput.trim()) return;
    
    setFormData(prev => ({
      ...prev,
      imageUrls: [...(prev.imageUrls || []), imageUrlInput.trim()]
    }));
    setImageUrlInput('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      if (!base64Data) return;

      try {
        // Compress the image to avoid Firestore 1MB limit
        const compressedBase64 = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxWidth = 800;
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(base64Data);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.onerror = reject;
          img.src = base64Data;
        });

        setFormData(prev => ({
          ...prev,
          imageUrls: [...(prev.imageUrls || []), compressedBase64]
        }));
      } catch (err) {
        console.error("Error processing image:", err);
        setImageError("Failed to process the uploaded image.");
      }
    };
    reader.readAsDataURL(file);
    
    // Reset the input so the same file can be uploaded again if needed
    e.target.value = '';
  };

  const handleFieldPermissionChange = (field: string, permission: FieldPermission) => {
    setFormData(prev => {
      // If a field is shared with specific players, ensure they can also see the entity itself
      const newAllowedPlayers = new Set(prev.allowedPlayers || []);
      permission.allowedPlayers.forEach(p => newAllowedPlayers.add(p));
      
      return {
        ...prev,
        allowedPlayers: Array.from(newAllowedPlayers),
        fieldPermissions: {
          ...(prev.fieldPermissions || {}),
          [field]: permission
        }
      };
    });
  };

  const handleInsertLink = (text: string, entityId: string) => {
    const markdownLink = `[${text}](/entity/${entityId})`;
    setFormData(prev => ({ ...prev, content: (prev.content || '') + markdownLink }));
  };

  const setAllPermissions = (isPublic: boolean) => {
    const newPerms: Record<string, FieldPermission> = {};
    const perm = { isPublic, allowedPlayers: [] };
    
    newPerms['content'] = perm;
    newPerms['tags'] = perm;
    newPerms['locationId'] = perm;
    newPerms['gender'] = perm;
    newPerms['imageUrls'] = perm;
    
    if (formData.type && ENTITY_SCHEMAS[formData.type]) {
      ENTITY_SCHEMAS[formData.type].forEach(field => {
        newPerms[field.key] = perm;
      });
    }
    
    setFormData(prev => ({
      ...prev,
      isPublic, // Also set the entity's global isPublic
      fieldPermissions: newPerms
    }));
  };

  const renderLabel = (field: string, label: string, description?: string) => (
    <div className="flex flex-col mb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-medium text-stone-400">{label}</label>
          {description && (
            <div className="group relative">
              <div className="cursor-help text-stone-500 hover:text-stone-300">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div className="absolute bottom-full left-0 mb-2 w-64 p-2 bg-stone-800 text-stone-200 text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-stone-700">
                {description}
              </div>
            </div>
          )}
        </div>
        {isDM && (
          <FieldPermissionToggle
            permission={formData.fieldPermissions?.[field]}
            onChange={(perm) => handleFieldPermissionChange(field, perm)}
            players={players}
          />
        )}
      </div>
    </div>
  );

  const getSuggestions = (fieldKey: string) => {
    const values = new Set<string>();
    availableLocations.forEach(loc => {
      if (loc.attributes?.[fieldKey]) {
        values.add(loc.attributes[fieldKey]);
      }
    });
    return Array.from(values);
  };

  if (loading) return <div className="text-center py-12 text-stone-500">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="sticky top-0 z-40 -mx-6 px-6 md:-mx-10 md:px-10 -mt-6 md:-mt-10 pt-6 md:pt-10 pb-4 bg-stone-950/90 backdrop-blur-md border-b border-stone-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shadow-xl">
        <button 
          onClick={() => {
            if (window.history.state && window.history.state.idx > 0) {
              navigate(-1);
            } else if (id && id !== 'new') {
              navigate(`/entity/${id}`, { replace: true });
            } else {
              navigate(`/entities/${formData.type}`, { replace: true });
            }
          }} 
          className="flex items-center justify-center gap-2 px-4 py-2 text-stone-400 hover:text-stone-100 transition-colors text-sm font-medium bg-stone-900/50 border border-stone-800 rounded-lg sm:bg-transparent sm:border-0"
        >
          <ArrowLeft size={16} />
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-6 py-3 sm:py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg font-bold sm:font-medium transition-all shadow-lg shadow-amber-900/20 active:scale-95"
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Entity'}
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl p-8 shadow-xl">
          {isDM && (
            <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 pb-6 border-b border-stone-800 gap-4">
              <div className="flex-1">
                <h2 className="text-xl font-cinzel font-bold text-amber-500">Entity Visibility</h2>
                <p className="text-sm text-stone-400 mt-1 mb-4">Control who can see this entity and its basic information.</p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, isPublic: true, allowedPlayers: [] }))}
                    className={clsx(
                      "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium border",
                      formData.isPublic 
                        ? "bg-emerald-900/50 text-emerald-300 border-emerald-500/50" 
                        : "bg-stone-950/50 text-stone-400 border-stone-800 hover:bg-stone-800"
                    )}
                  >
                    <Globe size={16} />
                    Public (All Players)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, isPublic: false, allowedPlayers: [] }))}
                    className={clsx(
                      "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium border",
                      !formData.isPublic && (!formData.allowedPlayers || formData.allowedPlayers.length === 0)
                        ? "bg-red-900/50 text-red-300 border-red-500/50" 
                        : "bg-stone-950/50 text-stone-400 border-stone-800 hover:bg-stone-800"
                    )}
                  >
                    <Lock size={16} />
                    Secret (DM Only)
                  </button>
                </div>
                
                {players.length > 0 && !formData.isPublic && (
                  <div className="mt-4 p-4 bg-stone-950/50 border border-stone-800 rounded-xl">
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">Specific Players</label>
                    <div className="flex flex-wrap gap-2">
                      {players.map(player => {
                        const isAllowed = formData.allowedPlayers?.includes(player.uid);
                        return (
                          <button
                            key={player.uid}
                            type="button"
                            onClick={() => {
                              const newAllowed = isAllowed 
                                ? (formData.allowedPlayers || []).filter(id => id !== player.uid)
                                : [...(formData.allowedPlayers || []), player.uid];
                              setFormData(prev => ({ ...prev, allowedPlayers: newAllowed }));
                            }}
                            className={clsx(
                              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                              isAllowed
                                ? "bg-amber-900/30 text-amber-400 border-amber-700/50"
                                : "bg-stone-900 text-stone-400 border-stone-800 hover:bg-stone-800"
                            )}
                          >
                            <Users size={14} />
                            {player.displayName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex-1 md:pl-8 md:border-l border-stone-800">
                <h2 className="text-xl font-cinzel font-bold text-amber-500">Bulk Permissions</h2>
                <p className="text-sm text-stone-400 mt-1 mb-4">Set visibility for all individual fields at once.</p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setAllPermissions(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-950/30 text-emerald-400 border border-emerald-900/50 rounded-lg hover:bg-emerald-900/50 transition-colors text-sm font-medium"
                  >
                    <Globe size={16} />
                    Make All Fields Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllPermissions(false)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-950/30 text-red-400 border border-red-900/50 rounded-lg hover:bg-red-900/50 transition-colors text-sm font-medium"
                  >
                    <Lock size={16} />
                    Make All Fields Secret
                  </button>
                </div>
              </div>
            </div>
          )}

          {!isDM && (
            <div className="mb-8 pb-6 border-b border-stone-800">
              <label className="block text-sm font-medium text-stone-400 mb-2">Share Note With</label>
              <select
                value={(() => {
                  if (formData.isPublic) return 'all';
                  if (!formData.allowedPlayers || formData.allowedPlayers.length === 0) return 'private';
                  if (formData.allowedPlayers.includes(currentCampaign?.dmId || '')) {
                    if (formData.allowedPlayers.length > 1) return 'party';
                    return 'dm';
                  }
                  return 'private';
                })()}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'all') {
                    setFormData({ ...formData, isPublic: true, allowedPlayers: [] });
                  } else if (val === 'party') {
                    setFormData({ ...formData, isPublic: false, allowedPlayers: [...players.map(p => p.uid), currentCampaign?.dmId || ''] });
                  } else if (val === 'dm') {
                    setFormData({ ...formData, isPublic: false, allowedPlayers: [currentCampaign?.dmId || ''] });
                  } else {
                    setFormData({ ...formData, isPublic: false, allowedPlayers: [] });
                  }
                }}
                className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-medium appearance-none"
              >
                <option value="private">Private (Only Me)</option>
                <option value="dm">DM Only</option>
                <option value="party">Party (All Players + DM)</option>
                <option value="all">Public (Everyone)</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-stone-400 mb-2">Name</label>
              <AutoExpandingTextarea
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="font-semibold text-lg min-h-[52px]"
                placeholder="e.g. Neverwinter"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-400 mb-2">Type</label>
              <select
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as EntityType })}
                disabled={!isDM}
                className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-medium appearance-none disabled:opacity-50"
              >
                {ENTITY_TYPES_ORDERED.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>

          {formData.type === 'npc' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                {renderLabel('gender', 'Gender')}
                <select
                  value={formData.gender || ''}
                  onChange={e => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-medium appearance-none"
                >
                  <option value="">Not specified</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                {renderLabel('statBlock', 'Stat Block')}
                <button
                  type="button"
                  onClick={() => setIsStatBlockModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-300 hover:text-amber-400 hover:border-amber-900/50 transition-all font-medium"
                >
                  <BookOpen size={18} />
                  {formData.statBlock ? 'Edit Stat Block' : 'Add Stat Block'}
                </button>
              </div>
            </div>
          )}

          {formData.type === 'monster' && (
            <div className="mb-6">
              {renderLabel('statBlock', 'Stat Block')}
              <button
                type="button"
                onClick={() => setIsStatBlockModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-300 hover:text-amber-400 hover:border-amber-900/50 transition-all font-medium"
              >
                <BookOpen size={18} />
                {formData.statBlock ? 'Edit Stat Block' : 'Add Stat Block'}
              </button>
            </div>
          )}

          {formData.type && ENTITY_SCHEMAS[formData.type] && ENTITY_SCHEMAS[formData.type].length > 0 && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-stone-950/30 border border-stone-800/50 rounded-xl">
              <div className="col-span-full mb-2">
                <h3 className="text-lg font-semibold text-stone-100 font-cinzel tracking-wider">Specific Attributes</h3>
                <p className="text-sm text-stone-500">Fill out specific details for this {formData.type}.</p>
              </div>
              {ENTITY_SCHEMAS[formData.type].map(field => (
                <div key={field.key} className={field.type === 'textarea' ? 'col-span-full' : ''}>
                  {renderLabel(field.key, field.label, field.description)}
                  {field.type === 'text' && (
                    <>
                      <AutoExpandingTextarea
                        value={formData.attributes?.[field.key] || ''}
                        onChange={e => setFormData({ ...formData, attributes: { ...formData.attributes, [field.key]: e.target.value } })}
                        className="min-h-[52px]"
                        list={`suggestions-${field.key}`}
                      />
                      <datalist id={`suggestions-${field.key}`}>
                        {getSuggestions(field.key).map(val => (
                          <option key={val} value={val} />
                        ))}
                      </datalist>
                    </>
                  )}
                  {field.type === 'textarea' && (
                    <AutoExpandingTextarea
                      value={formData.attributes?.[field.key] || ''}
                      onChange={e => setFormData({ ...formData, attributes: { ...formData.attributes, [field.key]: e.target.value } })}
                      className="min-h-[100px]"
                    />
                  )}
                  {field.type === 'select' && field.options && (
                    <div className="relative">
                      <select
                        value={otherFields.has(field.key) ? 'CUSTOM_OTHER' : (formData.attributes?.[field.key] || '')}
                        onChange={e => {
                          if (e.target.value === 'CUSTOM_OTHER') {
                            setOtherFields(prev => new Set(prev).add(field.key));
                          } else {
                            setOtherFields(prev => {
                              const next = new Set(prev);
                              next.delete(field.key);
                              return next;
                            });
                            setFormData({ ...formData, attributes: { ...formData.attributes, [field.key]: e.target.value } });
                          }
                        }}
                        className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all appearance-none"
                      >
                        <option value="">Select...</option>
                        {field.options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                        <option value="CUSTOM_OTHER">Other...</option>
                      </select>
                      {otherFields.has(field.key) && (
                        <div className="mt-2">
                          <AutoExpandingTextarea
                            placeholder="Enter custom value..."
                            autoFocus
                            onChange={e => setFormData({ ...formData, attributes: { ...formData.attributes, [field.key]: e.target.value } })}
                            className="min-h-[52px]"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {field.type === 'entity-select' && (
                    <SearchableDropdown
                      options={availableLocations.filter(e => !field.targetType || e.type === field.targetType).map(e => ({ id: e.id, label: e.name, type: e.type }))}
                      value={formData.attributes?.[field.key] || ''}
                      onChange={val => setFormData({ ...formData, attributes: { ...formData.attributes, [field.key]: val } })}
                      placeholder={`Select ${field.targetType || 'entity'}...`}
                    />
                  )}
                  {field.type === 'boolean' && (
                    <div className="flex items-center justify-between p-4 bg-stone-950/50 border border-stone-800 rounded-xl hover:border-amber-500/50 transition-colors">
                      <span className="text-stone-100 font-medium">{field.label}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={formData.attributes?.[field.key] ?? field.defaultValue ?? false}
                        onClick={() => setFormData({ ...formData, attributes: { ...formData.attributes, [field.key]: !(formData.attributes?.[field.key] ?? field.defaultValue ?? false) } })}
                        className={clsx(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-stone-900",
                          (formData.attributes?.[field.key] ?? field.defaultValue ?? false) ? "bg-amber-500" : "bg-stone-700"
                        )}
                      >
                        <span
                          className={clsx(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            (formData.attributes?.[field.key] ?? field.defaultValue ?? false) ? "translate-x-6" : "translate-x-1"
                          )}
                        />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mb-6">
            {renderLabel('locationId', 'Located In (Optional)')}
            <SearchableDropdown
              options={dropdownOptions}
              value={formData.locationId || ''}
              onChange={(val) => setFormData({ ...formData, locationId: val })}
              placeholder="Select location..."
              onCreateNew={(name) => {
                setQuickCreateName(name);
                setIsQuickCreateOpen(true);
              }}
            />
          </div>

          <div className="mb-6">
            {renderLabel('imageUrls', 'Images & Maps')}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
              {formData.imageUrls?.map((url, index) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-stone-950/50 border border-stone-800 group">
                  <img src={url} alt={`Image ${index + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    className="absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2 mt-2">
              <AutoExpandingTextarea
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                placeholder="Paste a direct image URL (e.g., from Discord, Imgur)..."
                className="flex-1 text-sm min-h-[42px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddImageUrl(e as any);
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddImageUrl}
                disabled={!imageUrlInput.trim()}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-100 rounded-xl text-sm font-medium transition-colors"
              >
                Add URL
              </button>
              <label className="flex items-center justify-center px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-100 rounded-xl text-sm font-medium transition-colors cursor-pointer">
                <Upload size={16} className="mr-2" />
                Upload
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col items-start gap-4 p-4 bg-stone-900/50 border border-stone-800 rounded-xl">
              <div className="w-full flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-stone-200 flex items-center gap-2">
                    <ImageIcon size={16} className="text-amber-500" />
                    AI Image Generation
                  </h4>
                  <p className="text-xs text-stone-400 mt-1">
                    Generates an image based on the entity's Name, Type, and Content description.
                  </p>
                </div>
              </div>
              
              <div className="w-full flex flex-col sm:flex-row gap-2">
                <AutoExpandingTextarea
                  value={customImagePrompt}
                  onChange={(e) => setCustomImagePrompt(e.target.value)}
                  placeholder="Optional: Override description (e.g., 'A bustling street at night')"
                  className="flex-1 text-sm min-h-[42px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      generateImage();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={generateImage}
                  disabled={generatingImage || !formData.name}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-500 border border-amber-500/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {generatingImage ? (
                    <><RefreshCw size={16} className="animate-spin" /> Generating...</>
                  ) : (
                    <><ImageIcon size={16} /> Generate</>
                  )}
                </button>
              </div>

              {imageError && (
                <p className="text-red-400 text-xs">{imageError}</p>
              )}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              {renderLabel('content', 'Content')}
              <button
                type="button"
                onClick={() => setIsLinkModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-amber-400 rounded-lg text-xs font-medium transition-all border border-stone-700"
              >
                <LinkIcon size={14} />
                Add Entity Link
              </button>
            </div>
            <div data-color-mode="dark" className="rounded-xl overflow-hidden border border-stone-800">
              <MDEditor
                value={formData.content || ''}
                onChange={val => setFormData({ ...formData, content: val || '' })}
                height={400}
                preview="edit"
                className="!bg-stone-950/50 !border-none"
              />
            </div>
          </div>

          <div>
            {renderLabel('tags', 'Tags')}
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.tags?.map(tag => (
                <span key={tag} className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium bg-amber-950/30 text-amber-300 border border-amber-900/30">
                  #{tag}
                  <button type="button" onClick={() => removeTag(tag)} className="ml-1 text-amber-500 hover:text-amber-300">&times;</button>
                </span>
              ))}
            </div>
            <AutoExpandingTextarea
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={addTag}
              className="min-h-[52px]"
              placeholder="Type a tag and press Enter..."
            />
          </div>

          <div className="pt-6 border-t border-stone-800">
            <h3 className="text-lg font-semibold text-stone-100 font-cinzel tracking-wider mb-4">Relationships</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SearchableDropdown
                  options={availableLocations.map(e => ({ id: e.id, label: e.name, type: e.type }))}
                  value={relSearch}
                  onChange={(val) => setRelSearch(val)}
                  placeholder="Link to Faction, NPC, or Country..."
                />
                <div className="flex gap-2">
                  <div className="flex-1 relative flex flex-col gap-2">
                    <AutoExpandingTextarea
                      value={relLabel}
                      onChange={(e) => setRelLabel(e.target.value)}
                      placeholder="This entity is... (e.g. Member)"
                      className="min-h-[42px]"
                      list="rel-labels"
                    />
                    <AutoExpandingTextarea
                      value={relReverseLabel}
                      onChange={(e) => setRelReverseLabel(e.target.value)}
                      placeholder="Target entity is... (e.g. Faction)"
                      className="min-h-[42px]"
                      list="rel-labels"
                    />
                    <datalist id="rel-labels">
                      {existingLabels.map(l => <option key={l} value={l} />)}
                    </datalist>
                  </div>
                  <button
                    type="button"
                    disabled={!relSearch || !relLabel.trim() || !relReverseLabel.trim()}
                    onClick={() => {
                      if (relSearch && relLabel && relReverseLabel) {
                        const target = availableLocations.find(e => e.id === relSearch);
                        if (target) {
                          setPendingRelationships([...pendingRelationships, { targetId: relSearch, label: relLabel, reverseLabel: relReverseLabel, targetName: target.name }]);
                          setRelSearch('');
                          setRelLabel('');
                          setRelReverseLabel('');
                        }
                      }
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-medium transition-colors h-[42px] self-start disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingRelationships.map((rel, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-stone-800 border border-stone-700 rounded-lg text-sm">
                    <span className="text-stone-400">{rel.label}:</span>
                    <span className="text-amber-400 font-medium">{rel.targetName}</span>
                    <button
                      type="button"
                      onClick={() => setPendingRelationships(pendingRelationships.filter((_, i) => i !== idx))}
                      className="text-stone-500 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {isDM && (
          <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl p-8 shadow-xl mb-6">
            <div className="flex items-center gap-3 mb-6">
              <Lock className="text-red-400" size={24} />
              <h2 className="text-xl font-bold text-stone-100 font-cinzel tracking-wider">DM Secret Notes</h2>
            </div>
            <p className="text-stone-400 text-sm mb-6">
              These notes are strictly for you. Players will never see this section, even if the entity is public.
            </p>
            <div data-color-mode="dark" className="rounded-xl overflow-hidden border border-red-900/30">
              <MDEditor
                value={formData.dmNotes || ''}
                onChange={val => setFormData({ ...formData, dmNotes: val || '' })}
                height={300}
                preview="edit"
                className="!bg-stone-950/50 !border-none"
              />
            </div>
          </div>
        )}

        {isDM && (
          <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <Users className="text-amber-400" size={24} />
              <h2 className="text-xl font-bold text-stone-100 font-cinzel tracking-wider">Player Specific Knowledge</h2>
            </div>
            <p className="text-stone-400 text-sm mb-6">
              Add notes here that only specific players can see. This is useful for secrets, backstory connections, or individual discoveries.
            </p>
            
            {players.length === 0 ? (
              <div className="text-center py-6 text-stone-500 bg-stone-950/50 rounded-xl border border-stone-800">
                No players found in the database.
              </div>
            ) : (
              <div className="space-y-4">
                {players.map(player => (
                  <div key={player.uid} className="p-4 bg-stone-950/50 border border-stone-800 rounded-xl">
                    <label className="block text-sm font-semibold text-stone-300 mb-2">{player.displayName}</label>
                    <AutoExpandingTextarea
                      value={formData.playerKnowledge?.[player.uid] || ''}
                      onChange={e => handleKnowledgeChange(player.uid, e.target.value)}
                      className="text-sm min-h-[80px]"
                      placeholder={`What does ${player.displayName} know?`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      <LinkModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onInsert={handleInsertLink}
        entities={availableLocations}
        sourceEntityId={id && id !== 'new' ? id : undefined}
        sourceEntityName={formData.name}
      />

      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        onCreated={handleQuickCreate}
        initialName={quickCreateName}
      />

      {isStatBlockModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-stone-800">
              <div>
                <h2 className="text-xl font-cinzel font-bold text-stone-100">Stat Block</h2>
                <p className="text-sm text-stone-400">Edit the stat block for {formData.name || 'this NPC'}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsStatBlockModalOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-stone-950/50 p-4 rounded-xl border border-stone-800">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Armor Class</label>
                  <input type="text" value={formData.dndStats?.armorClass || ''} onChange={e => handleDndStatChange('armorClass', e.target.value)} className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none" placeholder="e.g. 16 (chain shirt, shield)" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Hit Points</label>
                  <input type="text" value={formData.dndStats?.hitPoints || ''} onChange={e => handleDndStatChange('hitPoints', e.target.value)} className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none" placeholder="e.g. 11 (2d8 + 2)" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Speed</label>
                  <input type="text" value={formData.dndStats?.speed || ''} onChange={e => handleDndStatChange('speed', e.target.value)} className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none" placeholder="e.g. 30 ft." />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 bg-stone-950/50 p-4 rounded-xl border border-stone-800">
                {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((stat) => (
                  <div key={stat} className="text-center">
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">{stat}</label>
                    <div className="flex flex-col items-center">
                      <input 
                        type="number" 
                        value={formData.dndStats?.[stat as keyof DndStats] ?? 10} 
                        onChange={e => handleDndStatChange(stat as keyof DndStats, parseInt(e.target.value) || 0)} 
                        className="w-16 bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-center text-lg font-bold text-amber-500 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none" 
                      />
                      <span className="text-sm text-stone-500 mt-1">
                        {calculateModifier(Number(formData.dndStats?.[stat as keyof DndStats]) || 10)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-stone-950/50 p-4 rounded-xl border border-stone-800">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Skills</label>
                  <input type="text" value={formData.dndStats?.skills || ''} onChange={e => handleDndStatChange('skills', e.target.value)} className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none" placeholder="e.g. Perception +2" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Senses</label>
                  <input type="text" value={formData.dndStats?.senses || ''} onChange={e => handleDndStatChange('senses', e.target.value)} className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none" placeholder="e.g. Passive Perception 12" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Languages</label>
                  <input type="text" value={formData.dndStats?.languages || ''} onChange={e => handleDndStatChange('languages', e.target.value)} className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none" placeholder="e.g. Common" />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Challenge</label>
                    <input type="text" value={formData.dndStats?.challenge || ''} onChange={e => handleDndStatChange('challenge', e.target.value)} className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none" placeholder="e.g. 1/8 (25 XP)" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Proficiency Bonus</label>
                    <input type="text" value={formData.dndStats?.proficiencyBonus || ''} onChange={e => handleDndStatChange('proficiencyBonus', e.target.value)} className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none" placeholder="e.g. +2" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-300 mb-2">Actions, Traits, & Description</label>
                <div data-color-mode="dark" className="rounded-xl overflow-hidden border border-stone-800 min-h-[300px]">
                  <MDEditor
                    value={formData.statBlock || ''}
                    onChange={val => setFormData({ ...formData, statBlock: val || '' })}
                    height={300}
                    preview="edit"
                    className="!bg-stone-950/50 !border-none"
                  />
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-stone-800 flex justify-end gap-3 bg-stone-950/50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsStatBlockModalOpen(false)}
                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
