import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User, OperationType } from '../types';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { Users, Shield, User as UserIcon, Edit2, X, Save } from 'lucide-react';
import { useAuth } from '../AuthContext';

export default function PlayersList() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentCampaign, user: currentUser } = useAuth();
  
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [photoURLInput, setPhotoURLInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!currentCampaign) return;
    
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as User).filter(u => currentCampaign.players.includes(u.uid) || currentCampaign.dmId === u.uid);
      setUsers(data);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => unsubscribe();
  }, [currentCampaign]);

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        photoURL: photoURLInput.trim()
      });
      setIsEditingProfile(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const openProfileEdit = () => {
    setPhotoURLInput(currentUser?.photoURL || '');
    setIsEditingProfile(true);
  };

  if (loading) return <div className="text-center py-12 text-stone-500">Loading players...</div>;

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-8 flex items-center gap-4">
        <Users className="text-amber-500" size={32} />
        <div>
          <h1 className="text-3xl font-black font-cinzel text-stone-100 tracking-wider mb-2">Campaign Members</h1>
          <p className="text-stone-400">View all players and Dungeon Masters in the campaign.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {users.map(user => (
          <div key={user.uid} className="bg-stone-900/80 backdrop-blur-md border border-stone-800/50 rounded-2xl p-6 flex items-center gap-5 shadow-xl relative group">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} className="w-16 h-16 rounded-full object-cover border border-amber-900/50 shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-amber-500 font-bold text-2xl shrink-0">
                {user.displayName?.[0] || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-stone-100 truncate">{user.displayName}</h3>
                {currentCampaign?.dmId === user.uid ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/30 text-amber-500 border border-amber-900/30 uppercase tracking-wider shrink-0">
                    <Shield size={10} /> DM
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-stone-800 text-stone-400 border border-stone-700 uppercase tracking-wider shrink-0">
                    <UserIcon size={10} /> Player
                  </span>
                )}
              </div>
              <p className="text-stone-500 text-sm truncate">{user.email}</p>
              <p className="text-stone-600 text-xs mt-2">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
            </div>
            {currentUser?.uid === user.uid && (
              <button 
                onClick={openProfileEdit}
                className="absolute top-4 right-4 p-2 text-stone-500 hover:text-amber-400 hover:bg-stone-800/50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Edit Profile"
              >
                <Edit2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {isEditingProfile && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 max-w-md w-full shadow-2xl relative">
            <button 
              onClick={() => setIsEditingProfile(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-100"
            >
              <X size={20} />
            </button>
            <h2 className="text-2xl font-black font-cinzel text-stone-100 tracking-wider mb-6">Edit Profile</h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-stone-400 mb-2">Profile Picture URL</label>
              <input
                type="text"
                value={photoURLInput}
                onChange={(e) => setPhotoURLInput(e.target.value)}
                placeholder="https://example.com/image.png"
                className="w-full px-4 py-3 bg-stone-950 border border-stone-800 rounded-xl text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all placeholder:text-stone-700"
              />
              <p className="text-xs text-stone-500 mt-2">Paste a direct link to an image to use as your profile picture.</p>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsEditingProfile(false)}
                className="px-4 py-2 text-stone-400 hover:text-stone-100 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex items-center gap-2 px-6 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-500 border border-amber-500/50 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
