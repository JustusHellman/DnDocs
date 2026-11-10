import { Component, Suspense, useRef, useState, type ReactNode } from 'react';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { usePlayer } from '../../lib/play/usePlayer';
import { useSpellIndex, type PlayOpen } from '../../lib/play/ui';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { editionOf } from '../../lib/play/rules';
import { lazyPage } from '../../lib/lazyPage';
import { useTableEvent } from '../../lib/play/tableEvents';

// The dialogs load when first opened, so pages that never open one don't download them.
const CastDialog = lazyPage(() => import('./CastDialog'));
const RestDialog = lazyPage(() => import('./RestDialog'));
const SpellBook = lazyPage(() => import('./SpellBook'));
const TrackerSettings = lazyPage(() => import('./TrackerSettings'));
const CreatureCastDialog = lazyPage(() => import('./CreatureCastDialog'));
const LevelUpDialog = lazyPage(() => import('./LevelUpDialog'));

/** A dialog's code that couldn't be fetched (offline, or a new version out): say so and close. */
class LoadBoundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    this.props.onError(e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Shows whichever play dialog was asked for (cast, rest, spells, set-up), from anywhere: the chat
 * commands, the token card, the character page. Mounted once, with the chat.
 */
export default function PlayHost() {
  const toast = useToast();
  const [open, setOpen] = useState<PlayOpen | null>(null);
  // A cast started from the spellbook goes back to the spellbook when it's done or cancelled.
  const back = useRef<PlayOpen | null>(null);
  // The DM casting a spell for a creature.
  const [creature, setCreature] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  useTableEvent('npccast', (d) => setCreature(d.spellId));
  useTableEvent('play', (next) =>
    setOpen((cur) => {
      back.current = next.kind === 'cast' && cur?.kind === 'spells' && cur.entityId === next.entityId ? cur : null;
      return next;
    }),
  );
  // Placing a spell's area: everything out of the way of the map.
  useTableEvent('cast-area', () => {
    back.current = null;
    setOpen(null);
  });
  const { entities } = useCampaignData();
  const entity = open ? (entities.find((e) => e.id === open.entityId) ?? null) : null;
  const current = usePlayer(entity);
  // The character being saved can be missing for a moment while the list reloads: the dialog
  // stays open (and on its tab) with what it had, instead of closing and opening again.
  const last = useRef(current);
  if (current) last.current = current;
  const p = current ?? (open && last.current?.entity.id === open.entityId ? last.current : null);
  const wrap = (node: ReactNode) => (
    <LoadBoundary
      key={failures}
      onError={(e) => {
        toast.error(e, 'Open');
        setOpen(null);
        setCreature(null);
        setFailures((n) => n + 1);
      }}
    >
      <Suspense fallback={null}>{node}</Suspense>
    </LoadBoundary>
  );
  if (creature) return wrap(<CreatureHost spellId={creature} onClose={() => setCreature(null)} />);
  if (!open || !p) return null;
  const close = () => {
    setOpen(back.current);
    back.current = null;
  };
  switch (open.kind) {
    case 'spells':
      return wrap(<SpellBook key={open.entityId} p={p} onClose={close} tab={open.tab ?? 'ready'} onTab={(tab) => setOpen({ ...open, tab })} />);
    case 'rest':
      return wrap(<RestDialog p={p} kind={open.rest} onClose={close} />);
    case 'settings':
      return wrap(<TrackerSettings p={p} onClose={close} />);
    case 'levelup':
      return wrap(<LevelUpDialog p={p} onClose={close} />);
    case 'cast':
      return wrap(<CastHost p={p} spellId={open.spellId} level={open.level} onClose={close} />);
  }
}

function CastHost({ p, spellId, level, onClose }: { p: NonNullable<ReturnType<typeof usePlayer>>; spellId?: string; level?: number; onClose: () => void }) {
  const index = useSpellIndex(p.edition);
  if (index.loading) return null;
  const sp = spellId ? index.byId.get(spellId) : undefined;
  if (!sp) return null;
  return <CastDialog p={p} sp={sp} level={level} onClose={onClose} />;
}

function CreatureHost({ spellId, onClose }: { spellId: string; onClose: () => void }) {
  const { currentCampaign } = useAuth();
  const edition = editionOf(currentCampaign);
  const index = useSpellIndex(edition);
  const sp = index.byId.get(spellId);
  if (!sp) return null;
  return <CreatureCastDialog sp={sp} edition={edition} onClose={onClose} />;
}
