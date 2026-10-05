import { useEffect, useState } from 'react';
import { Crown, LogIn, LogOut, Plus, Swords, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { createCampaign, fetchMyCampaigns, joinCampaignByCode } from '../lib/entityService';
import { friendlyError } from '../lib/errors';
import type { Campaign } from '../types';
import { Avatar, EmptyState, Skeleton } from '../components/ui/bits';

export default function CampaignDashboard() {
  const { user, setCurrentCampaign, logout } = useAuth();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchMyCampaigns(user.uid)
      .then(setCampaigns)
      .catch((err) => {
        setLoadError(friendlyError(err, 'Could not load your campaigns.'));
        setCampaigns([]);
      });
  }, [user]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newName.trim()) return;
    setBusy('create');
    setFormError('');
    try {
      const c = await createCampaign(newName, user);
      toast.success(`Campaign “${c.name}” created`);
      setCurrentCampaign(c);
    } catch (err) {
      setFormError(friendlyError(err, 'Could not create the campaign.'));
    } finally {
      setBusy(null);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy('join');
    setFormError('');
    try {
      setCurrentCampaign(await joinCampaignByCode(joinCode, user));
    } catch (err) {
      setFormError(friendlyError(err, 'Could not join that campaign.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-dvh">
      <header className="leather leather-edge-b pt-safe">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <span className="font-display text-xl font-bold text-amber-400">DnDocs</span>
          <div className="ml-auto flex items-center gap-3">
            <Avatar user={user} size={30} />
            <span className="hidden text-sm text-stone-300 sm:inline">{user?.displayName}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="font-display text-3xl font-semibold text-stone-50">Your campaigns</h1>
        <p className="mt-1 mb-8 text-stone-400">Pick up where you left off, or start a new adventure.</p>

        {loadError && <p className="mb-6 rounded-lg border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">{loadError}</p>}

        {campaigns === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState icon={Swords} title="No campaigns yet">
            Create one as a Dungeon Master, or join your group with the code your DM gave you.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => {
              const dm = c.dmId === user?.uid;
              const coDm = c.coDms?.includes(user?.uid ?? '');
              return (
                <button
                  key={c.id}
                  onClick={() => setCurrentCampaign(c)}
                  className="card group flex flex-col p-5 text-left transition hover:-translate-y-0.5 hover:border-amber-500/40"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-700 font-display text-xl font-bold text-stone-950">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-lg font-semibold text-stone-50 group-hover:text-amber-300">{c.name}</h3>
                      <p className="flex items-center gap-1 text-xs text-stone-400">
                        {dm || coDm ? <Crown size={12} className="text-amber-400" /> : null}
                        {dm ? 'Dungeon Master' : coDm ? 'Co-DM' : 'Player'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-auto flex items-center gap-1.5 text-xs text-stone-500">
                    <Users size={13} /> {c.players.length} {c.players.length === 1 ? 'player' : 'players'}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <form onSubmit={join} className="card p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold text-stone-50">
              <LogIn size={18} className="text-emerald-400" /> Join a campaign
            </h2>
            <p className="mb-4 text-sm text-stone-400">Enter the 6-character code from your DM.</p>
            <div className="flex gap-2">
              <input
                className="input font-mono tracking-[0.25em] uppercase"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={12}
                autoCapitalize="characters"
                autoComplete="off"
                aria-label="Join code"
              />
              <button className="btn btn-secondary shrink-0" disabled={busy !== null || !joinCode.trim()}>
                {busy === 'join' ? 'Joining…' : 'Join'}
              </button>
            </div>
          </form>
          <form onSubmit={create} className="card p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold text-stone-50">
              <Plus size={18} className="text-amber-400" /> New campaign
            </h2>
            <p className="mb-4 text-sm text-stone-400">You’ll be the Dungeon Master.</p>
            <div className="flex gap-2">
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Campaign name" aria-label="Campaign name" maxLength={80} />
              <button className="btn btn-primary shrink-0" disabled={busy !== null || !newName.trim()}>
                {busy === 'create' ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
        {formError && <p className="mt-4 rounded-lg border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">{formError}</p>}
      </main>
    </div>
  );
}
