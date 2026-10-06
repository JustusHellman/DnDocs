import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Eye, Globe, MonitorUp } from 'lucide-react';
import { Popover } from '../ui/Popover';
import { Modal } from '../ui/Modal';
import { useIsPhone } from '../../hooks/useMediaQuery';
import { Avatar } from '../ui/bits';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { useToast } from '../../contexts/ToastContext';
import { revealEntity } from '../../lib/entityService';
import { defaultRevealed, fieldLabel } from '../../lib/entityTypes';
import { fieldKnowledge, initialRevealTicks, revealableKeys, toV3 } from '../../lib/sharing';
import type { Entity } from '../../types';

/**
 * The DM's one button for "the party just found this": choose who learns about it and what they
 * learn, and optionally pop it up on their screens. Press it again later to reveal more.
 */
/** A popover next to the button on larger screens, a bottom sheet on phones (long field lists). */
function Shell({ open, onClose, anchor, title, children }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLButtonElement | null>; title: string; children: React.ReactNode }) {
  const phone = useIsPhone();
  if (phone)
    return (
      <Modal open={open} onClose={onClose} title={title}>
        <div className="-mx-2">{children}</div>
      </Modal>
    );
  return (
    <Popover anchorRef={anchor} open={open} onClose={onClose} width={320}>
      <p className="px-2 pt-1 font-display text-base font-semibold text-stone-100">{title}</p>
      {children}
    </Popover>
  );
}

export default function RevealButton({ entity, compact }: { entity: Entity; compact?: boolean }) {
  const { players } = useCampaignData();
  const toast = useToast();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [everyone, setEveryone] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [ticks, setTicks] = useState<Set<string>>(new Set());
  const [show, setShow] = useState(true);
  const [busy, setBusy] = useState(false);

  const shared = entity.isPublic ? players.map((p) => p.uid) : toV3(entity).sharedWith ?? [];
  const canSee = (uid: string) => entity.isPublic || shared.includes(uid);

  useEffect(() => {
    if (!open) return;
    // Start from the players who can't see it yet (or everyone, if nobody or everybody can).
    const missing = players.filter((p) => !canSee(p.uid)).map((p) => p.uid);
    setEveryone(entity.isPublic || players.length === 0 || missing.length === players.length);
    setChosen(missing.length ? missing : players.map((p) => p.uid));
    setTicks(initialRevealTicks(entity, players));
    setShow(true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const audience = useMemo(() => ({ everyone, players: chosen }), [everyone, chosen]);
  const keys = useMemo(() => (open ? revealableKeys(entity) : []), [open, entity]);
  const known = useMemo(() => new Map(keys.map((k) => [k, fieldKnowledge(entity, k, audience, players)])), [keys, entity, audience, players]);
  const isOn = (k: string) => known.get(k) === 'all' || ticks.has(k);

  const newAccess = everyone ? !entity.isPublic : chosen.some((u) => !shared.includes(u));
  const newFields = keys.filter((k) => ticks.has(k) && known.get(k) !== 'all');
  const nothing = !everyone && chosen.length === 0;
  const revealing = newAccess || newFields.length > 0;
  const label = revealing ? (show ? 'Reveal & show' : 'Reveal') : 'Show on screens';
  const shownCount = keys.filter(isOn).length;

  const submit = async () => {
    if (nothing || (!revealing && !show)) return;
    setBusy(true);
    try {
      await revealEntity(entity, { everyone, players: chosen, fields: ticks, show, allPlayers: players });
      const who = everyone ? 'everyone' : chosen.length === 1 ? players.find((p) => p.uid === chosen[0])?.displayName ?? '1 player' : `${chosen.length} players`;
      toast.success(revealing ? `Revealed “${entity.name}” to ${who}` : `Showing “${entity.name}” to ${who}`);
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

  const tick = (k: string) =>
    setTicks((t) => {
      const next = new Set(t);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const preset = (mode: 'usual' | 'all' | 'none') =>
    setTicks(new Set(mode === 'none' ? [] : keys.filter((k) => mode === 'all' || defaultRevealed(entity.type, k))));

  const someKnowers = (k: string) =>
    players
      .filter((p) => (everyone || chosen.includes(p.uid)) && fieldKnowledge(entity, k, { everyone: false, players: [p.uid] }, players) === 'all')
      .map((p) => p.displayName);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((o) => !o)}
        aria-label="Reveal to players"
        title="Choose who learns about this and what they learn"
      >
        <Eye size={14} />
        <span className={clsx(compact ? 'hidden' : 'hidden @sm:inline')}>Reveal</span>
      </button>
      <Shell open={open} onClose={() => setOpen(false)} anchor={anchor} title={`Reveal “${entity.name}”`}>

        <p className="label mt-2 px-2">Who</p>
        <button
          type="button"
          onClick={() => setEveryone(true)}
          className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-stone-800', everyone ? 'text-amber-300' : 'text-stone-200')}
        >
          <Globe size={16} />
          <span className="flex-1">Everyone</span>
          {entity.isPublic && <span className="text-[11px] text-stone-500">already public</span>}
          {everyone && <Check size={14} />}
        </button>
        {players.map((p) => {
          const on = everyone || chosen.includes(p.uid);
          return (
            <button key={p.uid} type="button" onClick={() => toggle(p.uid)} className="flex w-full items-center gap-2 rounded-lg px-3 py-1 text-left text-sm text-stone-200 hover:bg-stone-800">
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

        <div className="mt-3 flex items-center gap-1 px-2">
          <p className="label mb-0 flex-1">What they learn</p>
          {(['usual', 'all', 'none'] as const).map((m) => (
            <button key={m} type="button" className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-stone-500 capitalize hover:bg-stone-800 hover:text-stone-200" onClick={() => preset(m)}>
              {m}
            </button>
          ))}
        </div>
        <ul className="max-h-56 overflow-y-auto px-1 max-md:max-h-none">
          <li className="flex items-center gap-2 px-2 py-1 text-sm text-stone-400">
            <span className="flex size-4 shrink-0 items-center justify-center rounded border border-stone-600 bg-stone-700 text-stone-950">
              <Check size={11} strokeWidth={3} />
            </span>
            Name
          </li>
          {keys.map((k) => {
            const state = known.get(k);
            const on = isOn(k);
            const some = state === 'some' ? someKnowers(k) : [];
            return (
              <li key={k}>
                <button
                  type="button"
                  disabled={state === 'all'}
                  onClick={() => tick(k)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-stone-200 enabled:hover:bg-stone-800 disabled:text-stone-500"
                >
                  <span
                    className={clsx(
                      'flex size-4 shrink-0 items-center justify-center rounded border',
                      on ? (state === 'all' ? 'border-stone-600 bg-stone-700 text-stone-950' : 'border-amber-500 bg-amber-500 text-stone-950') : 'border-stone-600',
                    )}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{fieldLabel(entity.type, k)}</span>
                  {state === 'all' && <span className="text-[11px] text-stone-500">known</span>}
                  {state === 'some' && <span className="max-w-28 truncate text-[11px] text-stone-500">{some.join(', ')} know{some.length === 1 ? 's' : ''}</span>}
                  {state === 'none' && !defaultRevealed(entity.type, k) && <span className="text-[11px] text-stone-500 italic">DM</span>}
                </button>
              </li>
            );
          })}
          {keys.length === 0 && <li className="px-2 py-1 text-xs text-stone-500">Nothing else is written in this entry yet.</li>}
        </ul>
        <p className="px-2 pt-1 text-[11px] text-stone-500">
          They’ll see the name{shownCount ? ` and ${shownCount} field${shownCount === 1 ? '' : 's'}` : ' only'}. Fields marked DM are usually kept back.
        </p>

        <label className="mx-1 mt-2 flex cursor-pointer items-center gap-2 border-t border-stone-800 px-2 pt-3 pb-1 text-sm text-stone-300">
          <input type="checkbox" className="size-4 accent-amber-600" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <MonitorUp size={15} className="text-stone-500" />
          Pop it up on their screens now
        </label>
        <div className="px-1 pt-2 pb-1">
          <button type="button" className="btn btn-primary w-full" disabled={busy || nothing || (!revealing && !show)} onClick={submit}>
            {busy ? 'Revealing…' : label}
          </button>
        </div>
      </Shell>
    </>
  );
}
