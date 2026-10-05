import { useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ChevronsLeft, ChevronsRight, LogOut, QrCode, UserCog } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useVisibleEntities } from '../../contexts/CampaignDataContext';
import { Avatar } from '../ui/bits';
import { MenuItem, Popover } from '../ui/Popover';
import InviteModal from '../InviteModal';
import { navGroups } from './nav';

interface SidebarProps {
  /** 'rail' shows icons only (tablets / collapsed desktop). */
  compact?: boolean;
  onToggleCompact?: () => void;
  onNavigate?: () => void;
}

export default function Sidebar({ compact, onToggleCompact, onNavigate }: SidebarProps) {
  const { user, logout, isDM, currentCampaign, setCurrentCampaign } = useAuth();
  const visible = useVisibleEntities();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const userAnchor = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    visible.forEach((e) => (c[e.type] = (c[e.type] ?? 0) + 1));
    return c;
  }, [visible]);

  return (
    <div className="flex h-full flex-col">
      {/* Campaign header */}
      <div className={clsx('flex shrink-0 items-center gap-2 border-b border-stone-800/70 pt-safe', compact ? 'h-16 justify-center px-2' : 'h-16 px-4')}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-700 font-display text-lg font-bold text-stone-950 shadow-md shadow-amber-950/50">
          {currentCampaign?.name?.[0]?.toUpperCase() ?? 'D'}
        </div>
        {!compact && (
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-semibold text-stone-50" title={currentCampaign?.name}>
              {currentCampaign?.name}
            </div>
            <div className="text-[11px] font-medium tracking-wider text-stone-500 uppercase">{isDM ? 'Dungeon Master' : 'Player'}</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        {navGroups().map((group, gi) => {
          const items = group.items.filter((i) => !i.dmOnly || isDM);
          if (!items.length) return null;
          return (
            <div key={gi} className={gi > 0 ? 'mt-4' : undefined}>
              {group.label &&
                (compact ? (
                  <div className="mx-3 mb-2 border-t border-stone-800" />
                ) : (
                  <div className="mb-1 px-3 text-[10px] font-bold tracking-[0.14em] text-stone-500 uppercase">{group.label}</div>
                ))}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onNavigate}
                      title={compact ? item.label : undefined}
                      className={({ isActive }) =>
                        clsx(
                          'group flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                          compact ? 'mx-auto size-10 justify-center' : 'px-3 py-2',
                          isActive ? 'bg-amber-500/10 text-amber-300' : 'text-stone-400 hover:bg-stone-800/70 hover:text-stone-100',
                        )
                      }
                    >
                      <item.icon size={18} className="shrink-0" />
                      {!compact && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.type && counts[item.type] ? <span className="text-xs tabular-nums text-stone-600 group-hover:text-stone-400">{counts[item.type]}</span> : null}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={clsx('shrink-0 space-y-1 border-t border-stone-800/70 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]')}>
        {isDM && (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            title={compact ? 'Invite players' : undefined}
            className={clsx('btn btn-ghost w-full text-amber-300', compact ? 'px-0' : 'justify-start')}
          >
            <QrCode size={18} />
            {!compact && 'Invite players'}
          </button>
        )}
        <button
          ref={userAnchor}
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className={clsx('flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-stone-800/70', compact && 'justify-center')}
          aria-label="Account menu"
        >
          <Avatar user={user} size={32} />
          {!compact && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-stone-100">{user?.displayName}</div>
              <div className="truncate text-xs text-stone-500">{user?.email}</div>
            </div>
          )}
        </button>
        {onToggleCompact && (
          <button type="button" onClick={onToggleCompact} className={clsx('btn btn-ghost btn-sm w-full text-stone-500', !compact && 'justify-start')} title={compact ? 'Expand sidebar' : undefined}>
            {compact ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            {!compact && 'Collapse'}
          </button>
        )}
        <Popover anchorRef={userAnchor} open={menuOpen} onClose={() => setMenuOpen(false)} align="start" width={230}>
          <MenuItem icon={UserCog} onClick={() => (setMenuOpen(false), onNavigate?.(), navigate('/players?profile=1'))}>
            Edit profile
          </MenuItem>
          <MenuItem icon={ArrowLeftRight} onClick={() => (setMenuOpen(false), setCurrentCampaign(null))}>
            Switch campaign
          </MenuItem>
          <MenuItem icon={LogOut} onClick={() => (setMenuOpen(false), logout())}>
            Sign out
          </MenuItem>
        </Popover>
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
