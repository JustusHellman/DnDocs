import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { joinCampaignByCode } from '../lib/entityService';
import { friendlyError } from '../lib/errors';
import { FullPageSpinner } from '../components/ui/bits';

export default function JoinCampaign() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, setCurrentCampaign } = useAuth();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!user || !code || started.current) return;
    started.current = true;
    joinCampaignByCode(code, user)
      .then((campaign) => {
        setCurrentCampaign(campaign);
        navigate('/search', { replace: true });
      })
      .catch((err) => setError(friendlyError(err, 'Could not join that campaign.')));
  }, [code, user, navigate, setCurrentCampaign]);

  if (!error) return <FullPageSpinner label="Joining campaign…" />;

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 text-center">
        <h1 className="mb-2 font-display text-xl font-semibold text-rose-300">Couldn’t join</h1>
        <p className="mb-6 text-sm text-stone-400">{error}</p>
        <button className="btn btn-primary w-full" onClick={() => navigate('/', { replace: true })}>
          Go to my campaigns
        </button>
      </div>
    </div>
  );
}
