import { useEffect, useRef, useState } from 'react';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { usePlayer } from '../../lib/play/usePlayer';
import { useSpellIndex, type PlayOpen } from '../../lib/play/ui';
import CastDialog from './CastDialog';
import RestDialog from './RestDialog';
import SpellBook from './SpellBook';
import TrackerSettings from './TrackerSettings';
import CreatureCastDialog from './CreatureCastDialog';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Shows whichever play dialog was asked for (cast, rest, spells, set-up), from anywhere: the chat
 * commands, the token card, the character page. Mounted once, with the chat.
 */
export default function PlayHost() {
  const [open, setOpen] = useState<PlayOpen | null>(null);
  // A cast started from the spellbook goes back to the spellbook when it's done or cancelled.
  const back = useRef<PlayOpen | null>(null);
  // The DM casting a spell for a creature.
  const [creature, setCreature] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setCreature((e as CustomEvent<{ spellId: string }>).detail.spellId);
    window.addEventListener('dndocs:npccast', on);
    return () => window.removeEventListener('dndocs:npccast', on);
  }, []);
  useEffect(() => {
    const on = (e: Event) => {
      const next = (e as CustomEvent<PlayOpen>).detail;
      setOpen((cur) => {
        back.current = next.kind === 'cast' && cur?.kind === 'spells' && cur.entityId === next.entityId ? cur : null;
        return next;
      });
    };
    // Placing a spell's area: everything out of the way of the map.
    const away = () => {
      back.current = null;
      setOpen(null);
    };
    window.addEventListener('dndocs:play', on);
    window.addEventListener('dndocs:cast-area', away);
    return () => {
      window.removeEventListener('dndocs:play', on);
      window.removeEventListener('dndocs:cast-area', away);
    };
  }, []);
  const { entities } = useCampaignData();
  const entity = open ? entities.find((e) => e.id === open.entityId) ?? null : null;
  const p = usePlayer(entity);
  if (creature) return <CreatureHost spellId={creature} onClose={() => setCreature(null)} />;
  if (!open || !p) return null;
  const close = () => {
    setOpen(back.current);
    back.current = null;
  };
  switch (open.kind) {
    case 'spells':
      return <SpellBook key={entity!.id} p={p} onClose={close} initialTab={open.tab} />;
    case 'rest':
      return <RestDialog p={p} kind={open.rest} onClose={close} />;
    case 'settings':
      return <TrackerSettings p={p} onClose={close} />;
    case 'cast':
      return <CastHost p={p} spellId={open.spellId} level={open.level} onClose={close} />;
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
  const edition = currentCampaign?.houseRules?.edition === '2024' ? '2024' : '2014';
  const index = useSpellIndex(edition);
  const sp = index.byId.get(spellId);
  if (!sp) return null;
  return <CreatureCastDialog sp={sp} edition={edition} onClose={onClose} />;
}
