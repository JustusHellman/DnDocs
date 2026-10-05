import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Eye, Globe, MonitorUp } from 'lucide-react';
import { Popover } from '../ui/Popover';
import { Avatar } from '../ui/bits';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { useToast } from '../../contexts/ToastContext';
import { explicitShare, revealEntity } from '../../lib/entityService';
import { upgradeSharing } from '../../lib/permissions';
import { permissionKeys } from '../../lib/entityTypes';
import type { Entity, FieldPermission } from '../../types';

function countLocked(perms: Record<string, FieldPermission>, type: string) {
  return permissionKeys(type).filter((k) => perms[k] && !perms[k].isPublic && !perms[k].allowedPlayers?.length).length;
}

/**
 * The DM's one button for "the party just found this": share it with everyone or chosen players
 * and (optionally) pop it up on their screens. Replaces the separate Share + Push steps.
 */
export default function RevealButton({ entity, compact }: { entity: Entity; compact?: boolean }) {
  const { players } = useCampaignData();
  const toast = useToast();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [everyone, setEveryone] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [show, setShow] = useState(true);
  const [busy, setBusy] = useState(false);

  const shared = entity.isPublic ? players.map((p) => p.uid) : entity.sharedWith ?? explicitShare(entity, players);
  const canSee = (uid: string) => entity.isPublic || shared.includes(uid) || !!entity.allowedPlayers?.includes(uid);

  useEffect(() => {
    if (!open) return;
    // Start from the players who can't see it yet (or everyone, if it's already public).
    const missing = players.filter((p) => !canSee(p.uid)).map((p) => p.uid);
    setEveryone(entity.isPublic || players.length === 0 || missing.length === players.length);
    setChosen(missing.length ? missing : players.map((p) => p.uid));
    setShow(true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fields that stay locked for chosen players (older shared entries keep their per-field setup).
  const lockedFor = (() => {
    if (everyone) return countLocked(entity.fieldPermissions ?? {}, entity.type);
    return countLocked(upgradeSharing(entity, shared, permissionKeys(entity.type)), entity.type);
  })();
  const newly = everyone ? !entity.isPublic : chosen.some((u) => !shared.includes(u));
  const nothing = !everyone && chosen.length === 0;
  const label = newly ? (show ? 'Reveal & show' : 'Reveal') : 'Show on screens';

  const submit = async () => {
    if (nothing || (!newly && !show)) return;
    setBusy(true);
    try {
      await revealEntity(entity, { everyone, players: chosen, show, allPlayers: players });
      const who = everyone ? 'everyone' : chosen.length === 1 ? players.find((p) => p.uid === chosen[0])?.displayName ?? '1 player' : `${chosen.length} players`;
      toast.success(newly ? `Revealed “${entity.name}” to ${who}` : `Showing “${entity.name}” to ${who}`);
      setOpen(false);
    } catch (err) {
      toast.error(err, 'Reveal');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (uid: string) => {
    // Picking a name while "Everyone" is on means "just this player".
    if (everyone) {
      setEveryone(false);
      setChosen([uid]);
      return;
    }
    setChosen((c) => (c.includes(uid) ? c.filter((x) => x !== uid) : [...c, uid]));
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((o) => !o)}
        aria-label="Reveal to players"
        title="Share with players and show it on their screens"
      >
        <Eye size={14} />
        <span className={clsx(compact ? 'hidden' : 'hidden @sm:inline')}>Reveal</span>
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={280}>
        <div className="px-2 pt-1 pb-2">
          <p className="font-display text-base font-semibold text-stone-100">Reveal to…</p>
          <p className="text-xs text-stone-500">They’ll see every field you haven’t locked.</p>
        </div>
        <button
          type="button"
          onClick={() => setEveryone(true)}
          className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-800', everyone ? 'text-amber-300' : 'text-stone-200')}
        >
          <Globe size={16} />
          <span className="flex-1">Everyone</span>
          {entity.isPublic && <span className="text-[11px] text-stone-500">already public</span>}
          {everyone && <Check size={14} />}
        </button>
        {players.length > 0 && <div className="mx-2 my-1 border-t border-stone-800" />}
        {players.map((p) => {
          const on = everyone || chosen.includes(p.uid);
          return (
            <button key={p.uid} type="button" onClick={() => toggle(p.uid)} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-stone-200 hover:bg-stone-800">
              <span className={clsx('flex size-4 shrink-0 items-center justify-center rounded border', on ? 'border-amber-500 bg-amber-500 text-stone-950' : 'border-stone-600')}>
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <Avatar user={p} size={20} />
              <span className="min-w-0 flex-1 truncate">{p.displayName}</span>
              {canSee(p.uid) && <span className="text-[11px] text-stone-500">sees it</span>}
            </button>
          );
        })}
        {players.length === 0 && <p className="px-3 py-1 text-xs text-stone-500">No players have joined yet.</p>}
        <label className="mx-1 mt-2 flex cursor-pointer items-center gap-2 rounded-lg border-t border-stone-800 px-2 pt-3 pb-1 text-sm text-stone-300">
          <input type="checkbox" className="size-4 accent-amber-600" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <MonitorUp size={15} className="text-stone-500" />
          Pop it up on their screens now
        </label>
        {lockedFor > 0 && (
          <p className="px-2 pt-2 text-xs text-amber-500">
            {lockedFor} field{lockedFor === 1 ? ' stays' : 's stay'} locked — unlock {lockedFor === 1 ? 'it' : 'them'} in Edit.
          </p>
        )}
        <div className="px-1 pt-2 pb-1">
          <button type="button" className="btn btn-primary w-full" disabled={busy || nothing || (!newly && !show)} onClick={submit}>
            {busy ? 'Revealing…' : label}
          </button>
        </div>
      </Popover>
    </>
  );
}
