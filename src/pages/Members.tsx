import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crown, Edit3, MoreVertical, QrCode, Shield, ShieldOff, UserMinus, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData } from '../contexts/CampaignDataContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { removePlayer, renameCampaign, setCoDm, updateProfile } from '../lib/entityService';
import type { User } from '../types';
import { Avatar, Page, PageHeader } from '../components/ui/bits';
import { GiMeepleGroup } from 'react-icons/gi';
import { Modal } from '../components/ui/Modal';
import { MenuItem, Popover } from '../components/ui/Popover';
import InviteModal from '../components/InviteModal';

function MemberMenu({ member }: { member: User }) {
  const { currentCampaign } = useAuth();
  const { refreshMembers } = useCampaignData();
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const isCoDm = !!currentCampaign?.coDms?.includes(member.uid);

  const toggleCoDm = async () => {
    setOpen(false);
    try {
      await setCoDm(currentCampaign!.id, member.uid, !isCoDm);
      toast.success(isCoDm ? `${member.displayName} is now a player` : `${member.displayName} is now a co-DM`);
    } catch (err) {
      toast.error(err, 'Co-DM');
    }
  };

  const kick = async () => {
    setOpen(false);
    const ok = await confirm({
      title: `Remove ${member.displayName}?`,
      message: 'They lose access to this campaign. Their notes stay. They can rejoin with the join code.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await removePlayer(currentCampaign!.id, member.uid);
      refreshMembers();
      toast.success(`${member.displayName} was removed`);
    } catch (err) {
      toast.error(err, 'Remove player');
    }
  };

  return (
    <>
      <button ref={anchor} type="button" className="btn-icon-sm" aria-label={`Manage ${member.displayName}`} onClick={() => setOpen((o) => !o)}>
        <MoreVertical size={16} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={220}>
        <MenuItem icon={isCoDm ? ShieldOff : Shield} onClick={toggleCoDm}>
          {isCoDm ? 'Make a player' : 'Make co-DM'}
        </MenuItem>
        <MenuItem icon={UserMinus} danger onClick={kick}>
          Remove from campaign
        </MenuItem>
      </Popover>
    </>
  );
}

export default function Members() {
  const { currentCampaign, user, isOwner, isDM } = useAuth();
  const { members, refreshMembers } = useCampaignData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState('');
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [campaignName, setCampaignName] = useState('');

  useEffect(() => {
    if (params.get('profile')) {
      openProfile();
      params.delete('profile');
      setParams(params, { replace: true });
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const openProfile = () => {
    setName(user?.displayName ?? '');
    setPhoto(user?.photoURL ?? '');
    setProfileOpen(true);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      await updateProfile(user.uid, { displayName: name.trim(), photoURL: photo.trim() });
      refreshMembers();
      toast.success('Profile updated');
      setProfileOpen(false);
    } catch (err) {
      toast.error(err, 'Update profile');
    } finally {
      setSaving(false);
    }
  };

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCampaign || !campaignName.trim()) return;
    try {
      await renameCampaign(currentCampaign.id, campaignName);
      toast.success('Campaign renamed');
      setRenaming(false);
    } catch (err) {
      toast.error(err, 'Rename campaign');
    }
  };

  const role = (m: User) =>
    m.uid === currentCampaign?.dmId ? 'owner' : currentCampaign?.coDms?.includes(m.uid) ? 'codm' : 'player';
  const sorted = [...members].sort((a, b) => ['owner', 'codm', 'player'].indexOf(role(a)) - ['owner', 'codm', 'player'].indexOf(role(b)) || a.displayName.localeCompare(b.displayName));

  return (
    <Page>
      <PageHeader
        icon={<div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25"><GiMeepleGroup size={28} /></div>}
        title="Members"
        subtitle={`${members.length} ${members.length === 1 ? 'person' : 'people'} in ${currentCampaign?.name}`}
        actions={
          isDM && (
            <button type="button" className="btn btn-primary" onClick={() => setInviteOpen(true)}>
              <QrCode size={16} /> Invite
            </button>
          )
        }
      />

      <div className="card divide-y divide-stone-800/70">
        {sorted.map((m) => {
          const r = role(m);
          const me = m.uid === user?.uid;
          return (
            <div key={m.uid} className="flex items-center gap-3 p-4">
              <Avatar user={m} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-stone-100">{m.displayName}</span>
                  {me && <span className="text-xs text-stone-500">(you)</span>}
                  {r === 'owner' && (
                    <span className="chip text-amber-200 bg-amber-500/10 ring-amber-500/30">
                      <Crown size={11} /> DM
                    </span>
                  )}
                  {r === 'codm' && (
                    <span className="chip text-amber-200 bg-amber-500/10 ring-amber-500/30">
                      <Shield size={11} /> Co-DM
                    </span>
                  )}
                </div>
                <div className="truncate text-sm text-stone-500">{isDM || me ? m.email : `Joined ${new Date(m.createdAt).toLocaleDateString()}`}</div>
              </div>
              {me && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={openProfile}>
                  <Edit3 size={14} /> <span className="hidden sm:inline">Edit profile</span>
                </button>
              )}
              {isOwner && !me && r !== 'owner' && <MemberMenu member={m} />}
            </div>
          );
        })}
      </div>

      {isOwner && (
        <section className="card mt-6 p-5">
          <h2 className="section-title mb-3">Campaign settings</h2>
          {renaming ? (
            <form onSubmit={saveName} className="flex gap-2">
              <input autoFocus className="input" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} maxLength={80} />
              <button className="btn btn-primary">Save</button>
              <button type="button" className="btn btn-ghost" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-stone-500">Name</div>
                <div className="text-stone-100">{currentCampaign?.name}</div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setCampaignName(currentCampaign?.name ?? ''), setRenaming(true))}>
                Rename
              </button>
            </div>
          )}
          <div className="mt-4 border-t border-stone-800 pt-4">
            <div className="text-xs text-stone-500">Join code</div>
            <div className="font-mono text-lg tracking-[0.25em] text-amber-300">{currentCampaign?.joinCode}</div>
          </div>
        </section>
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Your profile"
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setProfileOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="profile-form" className="btn btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form id="profile-form" onSubmit={saveProfile} className="space-y-4">
          <div className="flex justify-center">
            <Avatar user={{ displayName: name, photoURL: photo }} size={72} />
          </div>
          <div>
            <label className="label" htmlFor="p-name">
              Display name
            </label>
            <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </div>
          <div>
            <label className="label" htmlFor="p-photo">
              Picture URL
            </label>
            <input id="p-photo" type="url" inputMode="url" className="input" value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" />
            <p className="hint">Paste a direct link to an image.</p>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
