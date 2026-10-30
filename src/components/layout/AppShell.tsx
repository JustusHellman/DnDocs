import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { History, Menu, Plus, Search, Swords, X } from 'lucide-react';
import { GiBookmarklet, GiOpenBook, GiTreasureMap } from 'react-icons/gi';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import CodexInbox from '../codex/CodexInbox';
import { ChatButton } from '../chat/ChatDock';
import { QuickBookButton } from '../play/QuickBook';
import { RunawayWarning } from '../DbUsageCard';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { usePeek } from '../../contexts/PeekContext';
import { useToast } from '../../contexts/ToastContext';
import { useIsDesktop, useMediaQuery } from '../../hooks/useMediaQuery';
import { menuTypes, playerCanCreate, TYPE_META } from '../../lib/entityTypes';
import { Spinner } from '../ui/bits';
import { useEscape, useScrollLock } from '../ui/Modal';
import { MenuItem, Popover } from '../ui/Popover';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import { Desk, PageDropZone, PeekSheet } from './PeekPanel';
import { DragProvider } from './drag';
import { ActiveScenesProvider, useActiveBattles } from '../../contexts/ActiveScenesContext';
import { JukeboxProvider } from '../../contexts/JukeboxContext';
import { JukeboxBanner, JukeboxButton } from '../jukebox/JukeboxControls';

function readCompact() {
  try {
    return localStorage.getItem('sidebar:compact') === '1';
  } catch {
    return false;
  }
}

/** Opens entities the DM pushed on the players' screens. */
function PushListener() {
  const { isDM, user } = useAuth();
  const { entities, canView } = useCampaignData();
  const { peek, isOpen } = usePeek();
  const toast = useToast();
  const seen = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    if (isDM) return;
    const first = seen.current === null;
    const map = seen.current ?? new Map<string, number>();
    const now = Date.now();
    for (const e of entities) {
      const pushed = e.lastPushedAt ?? 0;
      const prev = map.get(e.id);
      map.set(e.id, pushed);
      if (!pushed || !canView(e)) continue;
      if (e.lastPushedTo?.length && !(user && e.lastPushedTo.includes(user.uid))) continue;
      // On first load only react to very recent pushes; afterwards to any new push.
      const isNew = first ? now - pushed < 30_000 : prev !== undefined ? pushed > prev : now - pushed < 30_000;
      if (!isNew) continue;
      if (isOpen) {
        peek(e, { background: true, flash: true });
        toast.show(`The DM is showing you “${e.name}”`, { action: { label: 'View', onClick: () => peek(e) } });
      } else {
        peek(e, { flash: true });
        toast.show(`The DM is showing you “${e.name}”`);
      }
    }
    seen.current = map;
  }, [entities, isDM]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function NewButton({ compact }: { compact?: boolean }) {
  const { isDM } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const typeFromPath = location.pathname.match(/^\/entities\/([^/]+)/)?.[1];

  // Players can make notes and their own characters (unless the DM hid the character type).
  const choices = menuTypes().filter((t) => isDM || playerCanCreate(t.value));

  if (!isDM && choices.length <= 1) {
    return (
      <button type="button" className={compact ? 'btn-icon' : 'btn btn-primary'} onClick={() => navigate('/entity/new?type=note')} aria-label="New note">
        <Plus size={18} />
        {!compact && 'New note'}
      </button>
    );
  }
  return (
    <>
      <button ref={anchor} type="button" className={compact ? 'btn-icon' : 'btn btn-primary'} onClick={() => setOpen((o) => !o)} aria-label="Create new">
        <Plus size={18} />
        {!compact && 'New'}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={220}>
        {choices.map((t) => (
          <MenuItem
            key={t.value}
            icon={t.icon}
            active={t.value === typeFromPath}
            onClick={() => {
              setOpen(false);
              navigate(`/entity/new?type=${t.value}`);
            }}
          >
            {t.label}
          </MenuItem>
        ))}
      </Popover>
    </>
  );
}

/** "Join battle" for everyone while the DM has a battle map switched on. */
function BattleBanner() {
  const battles = useActiveBattles();
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const battle = battles.find((b) => !dismissed.includes(b.id) && location.pathname !== `/battle/${b.id}`);
  if (!battle) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-amber-700/40 bg-amber-500/15 px-3 py-1.5 text-sm text-amber-100 sm:px-4">
      <Swords size={16} className="shrink-0 text-amber-400" />
      <span className="min-w-0 flex-1 truncate">
        {battle.combat?.active ? 'Combat' : 'A battle'} at <strong>{battle.name}</strong>
        {battle.combat?.active && battle.combat.round > 0 ? ` · round ${battle.combat.round}` : ''}
      </span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/battle/${battle.id}`)}>
        Join battle
      </button>
      <button type="button" className="btn-icon-sm" aria-label="Hide" onClick={() => setDismissed((d) => [...d, battle.id])}>
        <X size={15} />
      </button>
    </div>
  );
}

function RecentButton() {
  const { items, activate, isOpen } = usePeek();
  if (!items.length || isOpen) return null;
  const flashing = items.some((i) => i.flash);
  return (
    <button
      type="button"
      className={clsx('btn-icon relative', flashing && 'text-amber-300')}
      onClick={() => activate((items.find((i) => i.flash) ?? items[0]).id)}
      aria-label="Open quick view"
      title="Recently viewed"
    >
      <History size={19} />
      {flashing && <span className="absolute top-2 right-2 size-2 rounded-full bg-amber-400" />}
    </button>
  );
}

function BottomNav({ onMenu }: { onMenu: () => void }) {
  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium';
  const cls = ({ isActive }: { isActive: boolean }) => clsx(item, isActive ? 'text-amber-300' : 'text-stone-400');
  const Quest = TYPE_META.quest.icon;
  const Note = TYPE_META.note.icon;
  return (
    <nav aria-label="Primary" className="leather leather-edge-t fixed inset-x-0 bottom-0 z-40 flex pb-safe md:hidden">
      <NavLink to="/search" className={cls}>
        <GiOpenBook size={22} /> Home
      </NavLink>
      <NavLink to="/map" className={cls}>
        <GiTreasureMap size={22} /> Map
      </NavLink>
      <NavLink to="/entities/quest" className={cls}>
        <Quest size={22} /> Quests
      </NavLink>
      <NavLink to="/entities/note" className={cls}>
        <Note size={22} /> Notes
      </NavLink>
      <button type="button" onClick={onMenu} className={clsx(item, 'text-stone-400')}>
        <GiBookmarklet size={22} /> Browse
      </button>
    </nav>
  );
}

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useScrollLock(open);
  useEscape(open, onClose);
  return (
    <div className={clsx('fixed inset-0 z-[80] lg:hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div className={clsx('absolute inset-0 bg-black/60 transition-opacity', open ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
      <div
        className={clsx(
          'leather leather-edge-r absolute inset-y-0 left-0 w-[min(18rem,85vw)] shadow-2xl transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {open && <Sidebar onNavigate={onClose} />}
      </div>
    </div>
  );
}

export default function AppShell() {
  const { currentCampaign } = useAuth();
  const isDesktop = useIsDesktop();
  const isTablet = useMediaQuery('(min-width: 768px)');
  const [compact, setCompact] = useState(readCompact);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const { pageHidden, setPageHidden } = usePeek();

  // Scroll to top on navigation (the main column is the scroll container).
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setDrawerOpen(false);
    setPageHidden(false);
  }, [location.pathname]);

  // Ctrl/Cmd+K or "/" opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleCompact = () =>
    setCompact((c) => {
      try {
        localStorage.setItem('sidebar:compact', c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });

  // Tablet: icon rail. Desktop: full sidebar (collapsible). Phone: drawer + bottom nav.
  const railCompact = isDesktop ? compact : true;

  // The shell has its own scroll areas; keep the document itself from scrolling (and from being
  // scrolled by embedding pages), which otherwise can leave parts of the layout off-screen.
  useEffect(() => {
    document.documentElement.classList.add('app-locked');
    return () => document.documentElement.classList.remove('app-locked');
  }, []);

  return (
    <ActiveScenesProvider>
    <JukeboxProvider>
    <DragProvider>
    <div className="flex h-dvh overflow-hidden">
      {isTablet && (
        <aside className={clsx('leather leather-edge-r hidden shrink-0 md:block', railCompact ? 'w-[4.25rem]' : 'w-64')}>
          <Sidebar compact={railCompact} onToggleCompact={isDesktop ? toggleCompact : undefined} />
        </aside>
      )}

      <div className={clsx('relative flex min-w-0 flex-1 flex-col lg:min-w-[380px]', isDesktop && pageHidden && 'hidden')}>
        {/* Top bar */}
        <header className="leather leather-edge-b z-30 flex h-14 shrink-0 items-center gap-2 px-2 pt-safe sm:px-4 md:h-16">
          <button type="button" className="btn-icon md:hidden" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
            <Menu size={20} />
          </button>
          {!isTablet && <div className="min-w-0 flex-1 truncate font-display text-base font-semibold text-stone-100">{currentCampaign?.name}</div>}
          {isTablet && (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-10 w-full max-w-md items-center gap-2 rounded-md border border-stone-700 bg-stone-950/70 px-3 text-sm text-stone-400 italic transition-colors hover:border-stone-600 hover:text-stone-200"
            >
              <Search size={16} />
              <span className="flex-1 text-left">Search the campaign…</span>
              <kbd className="kbd">Ctrl K</kbd>
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            {!isTablet && (
              <button type="button" className="btn-icon" aria-label="Search" onClick={() => setPaletteOpen(true)}>
                <Search size={20} />
              </button>
            )}
            <QuickBookButton />
            <ChatButton />
            <JukeboxButton />
            <RecentButton />
            <NewButton compact={!isTablet} />
          </div>
        </header>

        <BattleBanner />
        <JukeboxBanner />
        <main ref={mainRef} id="main" className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pb-0">
          <Suspense fallback={<Spinner className="py-24" />}>
            <Outlet />
          </Suspense>
        </main>
        {isDesktop && <PageDropZone />}
      </div>

      {isDesktop ? <Desk /> : <PeekSheet />}
      {!isTablet && <BottomNav onMenu={() => setDrawerOpen(true)} />}
      {!isDesktop && <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <PushListener />
      <CodexInbox />
      <RunawayWarning />
    </div>
    </DragProvider>
    </JukeboxProvider>
    </ActiveScenesProvider>
  );
}
