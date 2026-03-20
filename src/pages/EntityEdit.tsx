import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, getDocs, query, where, or } from 'firebase/firestore';
import { db } from '../firebase';
import { Entity, EntityType, User, OperationType, FieldPermission } from '../types';
import { ENTITY_SCHEMAS } from '../utils/entitySchemas';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { useAuth } from '../AuthContext';
import { ArrowLeft, Save, Globe, Lock, Users, Image as ImageIcon, X } from 'lucide-react';
import clsx from 'clsx';
import SearchableDropdown from '../components/SearchableDropdown';
import FieldPermissionToggle from '../components/FieldPermissionToggle';

export default function EntityEdit() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const defaultType = (searchParams.get('type') as EntityType) || 'npc';
  
  const navigate = useNavigate();
  const { user, isDM, currentCampaign } = useAuth();
  
  const [loading, setLoading] = useState(id ? true : false);
  const [saving, setSaving] = useState(false);
  const [players, setPlayers] = useState<User[]>([]);
  const [availableLocations, setAvailableLocations] = useState<Entity[]>([]);
  
  const [formData, setFormData] = useState<Partial<Entity>>({
    type: defaultType,
    name: '',
    content: '',
    tags: [],
    isPublic: false,
    playerKnowledge: {},
    locationId: searchParams.get('locationId') || '',
    gender: '',
    imageUrls: [],
    attributes: {},
    fieldPermissions: {},
  });
  
  const [tagInput, setTagInput] = useState('');
  const [imageUrlInput, setImageUrlInput] = useState('');

  const typePriority: Record<EntityType, EntityType[]> = {
    npc: ['settlement', 'landmark', 'faction', 'country', 'shop', 'note', 'npc', 'item'],
    item: ['npc', 'shop', 'settlement', 'landmark', 'faction', 'country', 'note', 'item'],
    settlement: ['country', 'landmark', 'faction', 'note', 'settlement', 'npc', 'shop', 'item'],
    landmark: ['country', 'settlement', 'faction', 'note', 'landmark', 'npc', 'shop', 'item'],
    country: ['note', 'country', 'settlement', 'landmark', 'faction', 'npc', 'shop', 'item'],
    faction: ['settlement', 'country', 'landmark', 'note', 'faction', 'npc', 'shop', 'item'],
    shop: ['settlement', 'landmark', 'country', 'faction', 'note', 'shop', 'npc', 'item'],
    note: ['note', 'npc', 'settlement', 'landmark', 'country', 'faction', 'shop', 'item'],
  };

  const getSortedLocations = () => {
    const currentType = formData.type as EntityType;
    const priorities = typePriority[currentType] || [];
    
    return [...availableLocations].sort((a, b) => {
      const typeAIndex = priorities.indexOf(a.type);
      const typeBIndex = priorities.indexOf(b.type);
      
      if (typeAIndex !== typeBIndex) {
        return typeAIndex - typeBIndex;
      }
      return a.name.localeCompare(b.name);
    });
  };

  const dropdownOptions = getSortedLocations().map(loc => ({
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

    const fetchLocations = async () => {
      try {
        let q;
        if (isDM) {
          q = query(collection(db, 'entities'), where('campaignId', '==', currentCampaign.id));
        } else {
          q = query(
            collection(db, 'entities'),
            where('campaignId', '==', currentCampaign.id),
            or(
              where('isPublic', '==', true),
              where('allowedPlayers', 'array-contains', user.uid),
              where('ownerId', '==', user.uid)
            )
          );
        }
        const snap = await getDocs(q);
        const locs = snap.docs.map(d => d.data() as Entity).filter(e => e.id !== id);
        setAvailableLocations(locs);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'entities');
      }
    };
    fetchLocations();

    if (id) {
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
    }
  }, [id, isDM, navigate, currentCampaign, user, defaultType]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentCampaign) return;
    if (!isDM && formData.type !== 'note') return;
    
    setSaving(true);
    try {
      const entityId = id || crypto.randomUUID();
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
        createdAt: formData.createdAt || now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'entities', entityId), entityData);
      navigate(`/entity/${entityId}`, { replace: true });
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

  const handleFieldPermissionChange = (field: string, permission: FieldPermission) => {
    setFormData(prev => ({
      ...prev,
      fieldPermissions: {
        ...(prev.fieldPermissions || {}),
        [field]: permission
      }
    }));
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

  const renderLabel = (field: string, label: string) => (
    <div className="flex items-center justify-between mb-2">
      <label className="block text-sm font-medium text-stone-400">{label}</label>
      {isDM && (
        <FieldPermissionToggle
          permission={formData.fieldPermissions?.[field]}
          onChange={(perm) => handleFieldPermissionChange(field, perm)}
          players={players}
        />
      )}
    </div>
  );

  if (loading) return <div className="text-center py-12 text-stone-500">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-6 flex items-center justify-between">
        <button 
          onClick={() => {
            if (id) {
              navigate(`/entity/${id}`);
            } else {
              navigate(`/entities/${formData.type}`);
            }
          }} 
          className="flex items-center gap-2 text-stone-400 hover:text-stone-100 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={16} />
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors shadow-lg shadow-amber-900/20"
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Entity'}
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <div className="bg-stone-900/80 backdrop-blur-md border border-stone-800 rounded-2xl p-8 shadow-xl">
          {isDM && (
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pb-6 border-b border-stone-800 gap-4">
              <div>
                <h2 className="text-xl font-cinzel font-bold text-amber-500">Global Visibility</h2>
                <p className="text-sm text-stone-400 mt-1">Set visibility for all fields at once.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setAllPermissions(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-950/30 text-emerald-400 border border-emerald-900/50 rounded-lg hover:bg-emerald-900/50 transition-colors text-sm font-medium"
                >
                  <Globe size={16} />
                  Make All Public
                </button>
                <button
                  type="button"
                  onClick={() => setAllPermissions(false)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-950/30 text-red-400 border border-red-900/50 rounded-lg hover:bg-red-900/50 transition-colors text-sm font-medium"
                >
                  <Lock size={16} />
                  Make All Secret
                </button>
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
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-semibold text-lg"
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
                <option value="npc">NPC</option>
                <option value="settlement">Settlement</option>
                <option value="landmark">Landmark</option>
                <option value="country">Country</option>
                <option value="faction">Faction</option>
                <option value="shop">Shop</option>
                <option value="item">Item</option>
                <option value="note">Note</option>
              </select>
            </div>
          </div>

          {formData.type === 'npc' && (
            <div className="mb-6">
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
          )}

          {formData.type && ENTITY_SCHEMAS[formData.type] && ENTITY_SCHEMAS[formData.type].length > 0 && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-stone-950/30 border border-stone-800/50 rounded-xl">
              <div className="col-span-full mb-2">
                <h3 className="text-lg font-semibold text-stone-100 font-cinzel tracking-wider">Specific Attributes</h3>
                <p className="text-sm text-stone-500">Fill out specific details for this {formData.type}.</p>
              </div>
              {ENTITY_SCHEMAS[formData.type].map(field => (
                <div key={field.key} className={field.type === 'textarea' ? 'col-span-full' : ''}>
                  {renderLabel(field.key, field.label)}
                  {field.type === 'text' && (
                    <input
                      type="text"
                      value={formData.attributes?.[field.key] || ''}
                      onChange={e => setFormData({ ...formData, attributes: { ...formData.attributes, [field.key]: e.target.value } })}
                      className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                    />
                  )}
                  {field.type === 'textarea' && (
                    <textarea
                      value={formData.attributes?.[field.key] || ''}
                      onChange={e => setFormData({ ...formData, attributes: { ...formData.attributes, [field.key]: e.target.value } })}
                      className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all min-h-[100px]"
                    />
                  )}
                  {field.type === 'select' && field.options && (
                    <select
                      value={formData.attributes?.[field.key] || ''}
                      onChange={e => setFormData({ ...formData, attributes: { ...formData.attributes, [field.key]: e.target.value } })}
                      className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all appearance-none"
                    >
                      <option value="">Select...</option>
                      {field.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                  {field.type === 'boolean' && (
                    <label className="flex items-center gap-3 p-3 bg-stone-950/50 border border-stone-800 rounded-xl cursor-pointer hover:border-amber-500/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.attributes?.[field.key] || false}
                        onChange={e => setFormData({ ...formData, attributes: { ...formData.attributes, [field.key]: e.target.checked } })}
                        className="w-5 h-5 rounded border-stone-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-stone-900 bg-stone-900"
                      />
                      <span className="text-stone-100 font-medium">{field.label}</span>
                    </label>
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
              <input
                type="url"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                placeholder="Or paste a direct image URL (e.g., from Discord, Imgur)..."
                className="flex-1 px-4 py-2 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddImageUrl(e);
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
            </div>
          </div>

          <div className="mb-6">
            {renderLabel('content', 'Content (Markdown supported)')}
            <textarea
              required
              rows={12}
              value={formData.content}
              onChange={e => setFormData({ ...formData, content: e.target.value })}
              className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-mono text-sm leading-relaxed"
              placeholder="Write the details here..."
            />
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
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={addTag}
              className="w-full px-4 py-3 bg-stone-950/50 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
              placeholder="Type a tag and press Enter..."
            />
          </div>
        </div>

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
                    <textarea
                      rows={3}
                      value={formData.playerKnowledge?.[player.uid] || ''}
                      onChange={e => handleKnowledgeChange(player.uid, e.target.value)}
                      className="w-full px-4 py-3 bg-stone-900/50 border border-stone-800 rounded-xl text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-sm"
                      placeholder={`What does ${player.displayName} know?`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
