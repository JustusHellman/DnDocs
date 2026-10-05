import { useRef, useState } from 'react';
import { Check, Globe, Lock, Users } from 'lucide-react';
import clsx from 'clsx';
import { Popover } from '../ui/Popover';
import type { FieldPermission, User } from '../../types';

interface Props {
  permission: FieldPermission | undefined;
  onChange: (permission: FieldPermission) => void;
  players: User[];
  /** What an unset permission means (inherits the entity's visibility). */
  inheritsPublic: boolean;
  fieldLabel: string;
}

/** Per-field "who can see this" control shown next to each label for DMs. */
export default function FieldPermissionToggle({ permission, onChange, players, inheritsPublic, fieldLabel }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const perm = permission ?? { isPublic: inheritsPublic, allowedPlayers: [] };
  const state = perm.isPublic ? 'public' : perm.allowedPlayers.length ? 'some' : 'secret';

  const toggle = (uid: string) => {
    const next = perm.allowedPlayers.includes(uid) ? perm.allowedPlayers.filter((p) => p !== uid) : [...perm.allowedPlayers, uid];
    onChange({ isPublic: false, allowedPlayers: next });
  };

  const Icon = state === 'public' ? Globe : state === 'some' ? Users : Lock;
  const label = state === 'public' ? 'Visible to players' : state === 'some' ? `Visible to ${perm.allowedPlayers.length}` : 'Hidden from players';

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${fieldLabel}: ${label}. Change visibility`}
        title={label}
        className={clsx(
          'inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset transition-colors',
          state === 'public' && 'text-emerald-300 ring-emerald-600/40 hover:bg-emerald-950/40',
          state === 'some' && 'text-sky-300 ring-sky-600/40 hover:bg-sky-950/40',
          state === 'secret' && 'text-stone-500 ring-stone-700 hover:bg-stone-800 hover:text-stone-300',
        )}
      >
        <Icon size={12} />
        <span className="hidden sm:inline">{state === 'public' ? 'Players' : state === 'some' ? perm.allowedPlayers.length : 'DM'}</span>
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={250}>
        <div className="px-2 pt-1 pb-2 text-xs text-stone-400">Who can see “{fieldLabel}”?</div>
        {[
          { key: 'public', icon: Globe, text: 'All players', on: () => onChange({ isPublic: true, allowedPlayers: [] }) },
          { key: 'secret', icon: Lock, text: 'Only the DM', on: () => onChange({ isPublic: false, allowedPlayers: [] }) },
        ].map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => {
              o.on();
              setOpen(false);
            }}
            className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-800', state === o.key ? 'text-amber-300' : 'text-stone-200')}
          >
            <o.icon size={15} />
            <span className="flex-1">{o.text}</span>
            {state === o.key && <Check size={14} />}
          </button>
        ))}
        {players.length > 0 && (
          <>
            <div className="mt-1 border-t border-stone-800 px-2 pt-2 pb-1 text-[10px] font-bold tracking-wider text-stone-500 uppercase">Specific players</div>
            {players.map((p) => {
              const on = !perm.isPublic && perm.allowedPlayers.includes(p.uid);
              return (
                <button key={p.uid} type="button" onClick={() => toggle(p.uid)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-stone-200 hover:bg-stone-800">
                  <span className={clsx('flex size-4 items-center justify-center rounded border', on ? 'border-amber-500 bg-amber-500 text-stone-950' : 'border-stone-600')}>
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  {p.displayName}
                </button>
              );
            })}
          </>
        )}
      </Popover>
    </>
  );
}
