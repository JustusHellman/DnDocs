import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { Campaign, OperationType } from '../types';
import { useAuth } from '../AuthContext';
import { handleFirestoreError } from '../utils/firebaseUtils';

export default function JoinCampaign() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, setCurrentCampaign } = useAuth();
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(true);

  useEffect(() => {
    if (!user || !code) return;

    const joinCampaign = async () => {
      try {
        const q = query(collection(db, 'campaigns'), where('joinCode', '==', code.trim().toUpperCase()));
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
          navigate('/');
          return;
        }

        await updateDoc(doc(db, 'campaigns', campaign.id), {
          players: arrayUnion(user.uid)
        });

        const updatedCampaign = { ...campaign, players: [...campaign.players, user.uid] };
        setCurrentCampaign(updatedCampaign);
        navigate('/');
      } catch (err) {
        setError('Failed to join campaign.');
        handleFirestoreError(err, OperationType.UPDATE, 'campaigns');
        setJoining(false);
      }
    };

    joinCampaign();
  }, [code, user, navigate, setCurrentCampaign]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent text-stone-100 p-6">
        <div className="max-w-md w-full p-8 bg-stone-900/80 backdrop-blur-md rounded-2xl border border-stone-800 shadow-2xl text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4 font-cinzel">Error Joining Campaign</h1>
          <p className="text-stone-400 mb-8">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-medium transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent text-stone-400">
      Joining Campaign...
    </div>
  );
}
