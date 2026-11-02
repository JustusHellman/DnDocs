import { useState, type ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { useToast } from '../../contexts/ToastContext';
import HitDialog from '../../components/battle/HitDialog';
import type { HitRequest } from '../../lib/battle/aimStore';
import { tokensInArea } from '../../lib/battle/templates';
import { tableChat } from '../../lib/chat/bus';
import { useTableEvent } from '../../lib/play/tableEvents';
import type { AreaHit } from '../../lib/play/ui';
import type { Entity, Scene, Token } from '../../types';
import type { PushUndo } from './useUndoStack';

/**
 * Damage and healing on the battle map, always shown before anything changes: an area spell's
 * creatures (placed here, or a player's from the chat), or chosen tokens (an attack's target, a
 * spell's, someone healed). A player's hit on someone they can't change goes to the chat for the DM
 * (healing: also for that character's player) instead.
 */
export function useHitDialogs(o: {
  scene: Scene;
  allTokens: Token[];
  entityOf: (t: Token) => Entity | undefined;
  secretHp: Record<string, { cur: number; max: number }>;
  pushUndo: PushUndo;
  enabled: boolean;
}) {
  const { scene, allTokens, entityOf, secretHp, pushUndo, enabled } = o;
  const { isDM } = useAuth();
  const { canEdit } = useCampaignData();
  const toast = useToast();
  const [area, setArea] = useState<{ spell: string; hit: AreaHit; caught: Token[] } | null>(null);
  const [ask, setAsk] = useState<{ req: HitRequest; caught: Token[]; send: boolean } | null>(null);

  // The DM pressed Apply on a player's area in the chat.
  useTableEvent(
    'area-apply',
    (ev) => {
      if (!isDM || ev.scene !== scene.id) return;
      const caught = tokensInArea(ev.shape.k, ev.shape.a, ev.shape.b, ev.shape.w, allTokens);
      if (caught.length) setArea({ spell: ev.spell, hit: ev.hit, caught });
      else toast.show(`Nobody is inside the ${ev.spell} any more.`);
    },
    enabled,
  );
  // Damage or healing for chosen tokens.
  useTableEvent(
    'hit',
    (req) => {
      const caught = req.tokenIds.map((id) => allTokens.find((t) => t.id === id)).filter((t): t is Token => !!t);
      if (!caught.length) return toast.show(req.fromChat ? 'That token isn’t on this map.' : 'Nobody to apply it to.');
      // A player can change only their own character; anything else goes to the DM.
      const send =
        !isDM &&
        !caught.every((t) => {
          const e = entityOf(t);
          return e?.type === 'character' && canEdit(e);
        });
      setAsk({ req, caught, send });
    },
    enabled,
  );

  const common = { scene, entityOf, statTextOf: (t: Token) => entityOf(t)?.statBlock ?? null, secretHp, onUndoable: pushUndo };
  const dialogs: ReactNode = (
    <>
      {area && <HitDialog {...common} spell={area.spell} hit={area.hit} caught={area.caught} onClose={() => setArea(null)} />}
      {ask && (
        <HitDialog
          {...common}
          spell={ask.req.title}
          hit={{ by: ask.req.by, dmg: ask.req.dmg, ty: ask.req.ty, total: ask.req.total, save: ask.req.save, dc: ask.req.dc, half: ask.req.half }}
          kind={ask.req.kind}
          caught={ask.caught}
          onClose={() => setAsk(null)}
          onSend={
            ask.send
              ? (items, total) =>
                  tableChat.event({
                    t: 'hit',
                    kind: ask.req.kind,
                    title: ask.req.title,
                    by: ask.req.by,
                    scene: scene.id,
                    ids: items.map((i) => i.token.id),
                    names: items.map((i) => i.token.name),
                    ents: items.filter((i) => i.entity?.type === 'character').map((i) => i.entity!.id),
                    total,
                    ...(ask.req.dmg ? { dmg: ask.req.dmg } : {}),
                    ...(ask.req.ty ? { ty: ask.req.ty } : {}),
                  })
              : undefined
          }
        />
      )}
    </>
  );
  /** An area spell placed by the DM: everyone inside, to apply. */
  const askArea = (spell: string, hit: AreaHit, caught: Token[]) => setArea({ spell, hit, caught });
  return { dialogs, askArea };
}
