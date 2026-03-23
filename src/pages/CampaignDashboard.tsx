import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, setDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { Campaign, OperationType } from '../types';
import { useAuth } from '../AuthContext';
import { handleFirestoreError } from '../utils/firebaseUtils';
import { Plus, LogIn, Swords, LogOut } from 'lucide-react';
import AutoExpandingTextarea from '../components/AutoExpandingTextarea';

export default function CampaignDashboard() {
  const { user, setCurrentCampaign, logout } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [newCampaignName, setNewCampaignName] = useState('');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;

    const fetchCampaigns = async () => {
      try {
        // Fetch all campaigns and filter client-side to avoid complex index requirements
        // and "Missing or insufficient permissions" errors when querying with multiple where clauses
        const q = query(collection(db, 'campaigns'));
        const snap = await getDocs(q);
        
        const allCampaigns = snap.docs.map(d => d.data() as Campaign);
        
        // Filter campaigns where user is DM or a player
        const userCampaigns = allCampaigns.filter(
          c => c.dmId === user.uid || c.players.includes(user.uid)
        );
        
        setCampaigns(userCampaigns);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'campaigns');
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, [user]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newCampaignName.trim()) return;
    
    setCreating(true);
    setError('');
    try {
      const id = crypto.randomUUID();
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const newCampaign: Campaign = {
        id,
        name: newCampaignName.trim(),
        dmId: user.uid,
        players: [],
        joinCode: code,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'campaigns', id), newCampaign);
      setCampaigns(prev => [...prev, newCampaign]);
      setNewCampaignName('');
      setCurrentCampaign(newCampaign);
    } catch (err) {
      setError('Failed to create campaign.');
      handleFirestoreError(err, OperationType.CREATE, 'campaigns');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinCode.trim()) return;

    setJoining(true);
    setError('');
    try {
      const q = query(collection(db, 'campaigns'), where('joinCode', '==', joinCode.trim().toUpperCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setError('Invalid join code.');
        setJoining(false);
        return;
      }

      const campaignDoc = snap.docs[0];
      const campaign = campaignDoc.data() as Campaign;

      if (campaign.dmId === user.uid || campaign.players.includes(user.uid)) {
        setCurrentCampaign(campaign);
        return;
      }

      const updatedPlayers = [...campaign.players, user.uid];

      await updateDoc(doc(db, 'campaigns', campaign.id), {
        players: arrayUnion(user.uid)
      });

      const updatedCampaign = { ...campaign, players: updatedPlayers };
      setCampaigns(prev => [...prev, updatedCampaign]);
      setCurrentCampaign(updatedCampaign);
    } catch (err) {
      setError('Failed to join campaign.');
      handleFirestoreError(err, OperationType.UPDATE, 'campaigns');
    } finally {
      setJoining(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-stone-400">Loading Campaigns...</div>;

  return (
    <div className="min-h-screen text-stone-100 p-6 md:p-12 bg-transparent">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-display font-bold text-amber-500 mb-2 truncate">Your Campaigns</h1>
            <p className="text-stone-400 text-sm md:text-base">Select a campaign to continue, or start a new adventure.</p>
          </div>
          <button onClick={logout} className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-900/50 border border-stone-800 rounded-xl text-stone-400 hover:text-amber-500 transition-colors text-sm font-medium shrink-0">
            <LogOut size={18} /> Sign Out
          </button>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-950/30 border border-red-900/50 text-red-400 rounded-xl">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Create Campaign */}
          <div className="bg-stone-900/60 backdrop-blur-sm border border-stone-800/50 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-display font-bold text-stone-100 mb-4 flex items-center gap-2">
              <Plus className="text-amber-400" /> Create Campaign
            </h2>
            <form onSubmit={handleCreateCampaign}>
              <AutoExpandingTextarea
                placeholder="Campaign Name"
                value={newCampaignName}
                onChange={e => setNewCampaignName(e.target.value)}
                className="mb-4 focus:ring-2 focus:ring-amber-500 outline-none min-h-[52px]"
                required
              />
              <button
                type="submit"
                disabled={creating}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 rounded-xl font-bold transition-colors"
              >
                {creating ? 'Creating...' : 'Create as DM'}
              </button>
            </form>
          </div>

          {/* Join Campaign */}
          <div className="bg-stone-900/60 backdrop-blur-sm border border-stone-800/50 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-display font-bold text-stone-100 mb-4 flex items-center gap-2">
              <LogIn className="text-emerald-400" /> Join Campaign
            </h2>
            <form onSubmit={handleJoinCampaign}>
              <AutoExpandingTextarea
                placeholder="Enter Join Code"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                className="mb-4 focus:ring-2 focus:ring-emerald-500 outline-none uppercase min-h-[52px]"
                required
              />
              <button
                type="submit"
                disabled={joining}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-stone-950 rounded-xl font-bold transition-colors"
              >
                {joining ? 'Joining...' : 'Join as Player'}
              </button>
            </form>
          </div>
        </div>

        {/* Existing Campaigns */}
        <div>
          <h2 className="text-2xl font-display font-bold text-amber-500 mb-6">Existing Campaigns</h2>
          {campaigns.length === 0 ? (
            <div className="text-center py-12 bg-stone-900/40 backdrop-blur-sm border border-stone-800/50 rounded-2xl text-stone-500">
              You are not part of any campaigns yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCurrentCampaign(c)}
                  className="text-left p-5 bg-stone-900/60 backdrop-blur-sm border border-stone-800/50 rounded-xl hover:border-amber-500/50 hover:bg-stone-800/60 transition-all group"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-stone-950/80 rounded-lg text-amber-400 group-hover:text-amber-300">
                      <Swords size={20} />
                    </div>
                    <h3 className="text-lg font-display font-bold text-stone-100 truncate">{c.name}</h3>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-stone-400">
                      {c.dmId === user?.uid ? 'Dungeon Master' : 'Player'}
                    </span>
                    <span className="text-stone-500">{c.players.length} players</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
