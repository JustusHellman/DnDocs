import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crown, Edit3, MoreVertical, QrCode, Shield, ShieldOff, UserMinus, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData } from '../contexts/CampaignDataContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { removePlayer, renameCampaign, setCoDm, setHouseRules, updateProfile } from '../lib/entityService';
import type { User } from '../types';
import { Avatar, Page, PageHeader, Segmented, Toggle } from '../components/ui/bits';
import { partyRest } from '../lib/play/usePlayer';
import { tableLive } from '../lib/play/live';
import { GiMeepleGroup } from 'react-icons/gi';
import { Modal } from '../components/ui/Modal';
import { MenuItem, Popover } from '../components/ui/Popover';
import InviteModal from '../components/InviteModal';
import DeleteCampaignCard from '../components/DeleteCampaignCard';
import ColorPicker from '../components/chat/ColorPicker';

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
  const { members, refreshMembers, reloadFromServer } = useCampaignData();
  const names = Object.fromEntries(members.map((m) => [m.uid, m.displayName]));
  // Names and pictures are cached for a day elsewhere; this page shows them fresh.
  useEffect(() => {
    refreshMembers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
              <div className="relative">
                <Avatar user={m} size={44} />
                {/* Their colour at the table (dice, pings, chat): yours to change, or anyone's for a DM. */}
                {currentCampaign && (
                  <span className="absolute -right-0.5 -bottom-0.5">
                    <ColorPicker campaignId={currentCampaign.id} uid={m.uid} canEdit={me || isDM} names={names} size={16} />
                  </span>
                )}
              </div>
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
          <div className="mt-4 flex items-start gap-3 border-t border-stone-800 pt-4">
            <div className="min-w-0 flex-1">
              <div className="text-stone-100">Massive damage kills outright</div>
              <p className="text-xs text-stone-500">
                5e rule: when damage takes a character to 0 HP and what's left over is at least their hit point maximum, they die. Off: they just fall unconscious.
              </p>
            </div>
            <Toggle
              label="Massive damage kills outright"
              checked={currentCampaign?.houseRules?.massiveDamage !== false}
              onChange={(on) =>
                currentCampaign &&
                setHouseRules(currentCampaign.id, { ...(currentCampaign.houseRules ?? {}), massiveDamage: on }).catch((err) => toast.error(err, 'Table rules'))
              }
            />
          </div>
          <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-stone-800 pt-4">
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-stone-100">Rules edition</div>
              <p className="text-xs text-stone-500">
                Which free rules the spells, class tables and rests follow. 2014 (SRD 5.1): a long rest gives back half your hit dice. 2024 (SRD 5.2.1): all of them, and the 2024 spell texts.
              </p>
            </div>
            <Segmented
              size="sm"
              value={currentCampaign?.houseRules?.edition === '2024' ? '2024' : '2014'}
              onChange={(edition) => currentCampaign && setHouseRules(currentCampaign.id, { ...(currentCampaign.houseRules ?? {}), edition }).catch((err) => toast.error(err, 'Table rules'))}
              options={[
                { value: '2014', label: '2014' },
                { value: '2024', label: '2024' },
              ]}
            />
          </div>
          <PartyRest />
          <div className="mt-4 border-t border-stone-800 pt-4">
            <div className="text-xs text-stone-500">Join code</div>
            <div className="font-mono text-lg tracking-[0.25em] text-amber-300">{currentCampaign?.joinCode}</div>
          </div>
        </section>
      )}

      <section className="card mt-6 flex flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="section-title mb-1">This device</h2>
          <p className="text-sm text-stone-400">
            Keeps a copy of the campaign and only downloads what changed since your last visit. If anything looks out of date, reload it.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            reloadFromServer();
            refreshMembers();
            toast.success('Reloading the campaign from the server');
          }}
        >
          Reload campaign data
        </button>
      </section>

      {isOwner && <DeleteCampaignCard />}

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

/** The DM rests every player's character at once (they don't have to do anything). */
function PartyRest() {
  const { currentCampaign } = useAuth();
  const { entities } = useCampaignData();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const chars = entities.filter((e) => e.type === 'character' && e.playerId);
  const rest = async (kind: 'short' | 'long') => {
    if (!currentCampaign) return;
    const ok = await confirm({
      title: kind === 'long' ? 'Long rest for the whole party?' : 'Short rest for the whole party?',
      message:
        kind === 'long'
          ? `${chars.map((c) => c.name).join(', ')}: hit points, spell slots and resources back, and hit dice as the rules say. It shows in the chat.`
          : `${chars.map((c) => c.name).join(', ')}: short-rest resources and pact slots back. Everyone can still spend hit dice with Short rest on their own tracker.`,
      confirmLabel: kind === 'long' ? 'Long rest' : 'Short rest',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await partyRest(currentCampaign.id, currentCampaign.dmId, chars, currentCampaign.houseRules?.edition === '2024' ? '2024' : '2014', kind, tableLive().play);
      toast.success(kind === 'long' ? 'The party is rested' : 'Short rest done');
    } catch (err) {
      toast.error(err, 'Party rest');
    } finally {
      setBusy(false);
    }
  };
  if (!chars.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-stone-800 pt-4">
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-stone-100">Party rest</div>
        <p className="text-xs text-stone-500">Rests every player’s character straight away (also /rest party long in the chat).</p>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => rest('short')}>
        Short rest
      </button>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => rest('long')}>
        Long rest
      </button>
    </div>
  );
}
