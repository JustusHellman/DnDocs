import { useEffect, useRef } from 'react';
import { arrayRemove, arrayUnion, deleteField } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AURA_TIMER } from '../../components/battle/TokenCard';
import { patchToken } from '../../lib/battle/sceneService';
import { patchPlay, useTableLive } from '../../lib/play/live';
import { playKey } from '../../lib/play/model';
import { editionOf } from '../../lib/play/rules';
import { turnState } from '../../lib/play/turn';
import { setCombatContext } from '../../lib/play/turnStore';
import type { Entity, Scene, Token } from '../../types';
import type { PushUndo } from './useUndoStack';

/**
 * Turns on the battle map: where each token's live state is kept (a character's own, or the
 * token's), its speed this turn and the feet marked as moved, and what the screens keep up for the
 * table — said on screen when it changes something:
 * - timed conditions end at the start of the turn they were set on, N rounds later (DM's screen, with an Undo);
 * - a character's tracker concentration and its token's "Concentrating" go on and off together;
 * - the chat, spellbook and turn helper know who's in the fight (the combat context);
 * - a player hears "Your turn" when their token comes up.
 * Movement is never counted by itself: dragging a token is just moving it.
 */
export function useTurnBookkeeping(o: {
  scene: Scene;
  allTokens: Token[];
  tokens: Token[];
  isDraft: boolean;
  asDM: boolean;
  isDM: boolean;
  uid: string;
  entityOf: (t: Token) => Entity | undefined;
  speedOf: (t: Token) => number | null;
  pushUndo: PushUndo;
}) {
  const { scene, allTokens, tokens, isDraft, asDM, isDM, uid, entityOf, speedOf, pushUndo } = o;
  const { currentCampaign } = useAuth();
  const toast = useToast();
  const table = useTableLive();
  const combat = scene.combat;
  const fighting = !!combat?.active && !isDraft;
  const dmId = currentCampaign?.dmId ?? uid;
  const edition = editionOf(currentCampaign);

  const keyOf = (t: Token) => {
    const e = entityOf(t);
    if (e?.type === 'character' || (t.entityId && table.play[playKey(t.entityId)])) return playKey(t.entityId);
    return playKey(null, t.id);
  };
  const ownerOf = (t: Token) => {
    const e = entityOf(t);
    return e?.type === 'character' ? e.playerId || dmId : (table.play[keyOf(t)]?.uid ?? dmId);
  };
  const onTurn = (t: Token) => fighting && combat?.turn === t.id;
  /** Its speed this turn (Dash, Grappled and the like), shown while dragging it. */
  const turnSpeed = (t: Token) => {
    const base = speedOf(t);
    return onTurn(t) ? turnState(table.play[keyOf(t)], { speed: base, conditions: t.conditions, edition }).speed : base;
  };
  /** The feet marked as moved this turn (by hand, on the turn dots). */
  const movedOf = (t: Token) => (onTurn(t) ? (table.play[keyOf(t)]?.mv ?? 0) : 0);

  // Timed conditions: the DM's screen takes them off (one write per token with something ending).
  const expiryKey = combat?.active ? `${combat.round}:${combat.turn}` : '';
  useEffect(() => {
    const c = scene.combat;
    if (!isDM || !c?.active || !c.turn) return;
    const order = c.order ?? [];
    const at = (id: string | null) => (id ? Math.max(0, order.indexOf(id)) : 0);
    const now = at(c.turn);
    for (const t of allTokens) {
      const ended = Object.entries(t.timers ?? {})
        .filter(([, tm]) => c.round > tm.round || (c.round === tm.round && now >= at(tm.turn)))
        .map(([name]) => name);
      if (!ended.length) continue;
      // The aura ends on its own timer, or with the concentration it came from.
      const auraEnds = !!t.aura && (ended.includes(AURA_TIMER) || (ended.includes('Concentrating') && !!t.aura.conc));
      const gone = [...ended, ...(auraEnds ? [AURA_TIMER] : [])];
      const conditionsEnded = ended.filter((n) => n !== AURA_TIMER);
      const names = [...conditionsEnded, ...(auraEnds ? ['aura'] : [])];
      // Only these conditions and timers: anything added meanwhile stays.
      const data: Record<string, unknown> = Object.fromEntries(gone.map((n) => [`timers.${n}`, deleteField()]));
      if (conditionsEnded.length) data.conditions = arrayRemove(...conditionsEnded);
      if (auraEnds) data.aura = null;
      // Said with an Undo (the timer comes back as it was).
      const back: Record<string, unknown> = Object.fromEntries(gone.map((n) => [`timers.${n}`, t.timers?.[n] ?? deleteField()]));
      if (conditionsEnded.length) back.conditions = arrayUnion(...conditionsEnded);
      if (auraEnds) back.aura = t.aura;
      patchToken(scene.id, t.id, data)
        .then(() => names.length && pushUndo(`${t.name}: ${names.join(', ')} ended (its time ran out)`, () => patchToken(scene.id, t.id, back), true))
        .catch(() => undefined);
      // A character's concentration ran out: its tracker says so too.
      const e = entityOf(t);
      const live = e?.type === 'character' ? table.play[playKey(e.id)] : undefined;
      if (ended.includes('Concentrating') && live?.conc && currentCampaign)
        patchPlay(currentCampaign.id, playKey(e!.id), live.uid ?? e!.playerId ?? uid, live.name ?? e!.name, { conc: null, cs: null }).catch(() => undefined);
    }
  }, [expiryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // One concentration: a character's tracker is the truth; its tokens show it as "Concentrating".
  const concKey = allTokens
    .map((t) => {
      const e = entityOf(t);
      return e?.type === 'character' && (asDM || t.controlledBy.includes(uid)) ? `${t.id}:${table.play[playKey(e.id)]?.conc ? 1 : 0}:${t.conditions.includes('Concentrating') ? 1 : 0}` : '';
    })
    .join('|');
  useEffect(() => {
    if (isDraft) return;
    for (const t of allTokens) {
      const e = entityOf(t);
      if (e?.type !== 'character' || !(asDM || t.controlledBy.includes(uid))) continue;
      const on = !!table.play[playKey(e.id)]?.conc;
      const shown = t.conditions.includes('Concentrating');
      if (on && !shown) patchToken(scene.id, t.id, { conditions: arrayUnion('Concentrating') }).catch(() => undefined);
      if (!on && shown)
        patchToken(scene.id, t.id, {
          conditions: arrayRemove('Concentrating'),
          'timers.Concentrating': deleteField(),
          ...(t.aura?.conc ? { aura: null, [`timers.${AURA_TIMER}`]: deleteField() } : {}),
        }).catch(() => undefined);
    }
  }, [concKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Who's in the fight, for the chat, the spellbook and the turn helper.
  const turnKey = fighting ? `${combat!.round}:${combat!.turn}:${allTokens.map((t) => `${t.id}=${keyOf(t)}`).join(',')}` : '';
  useEffect(() => {
    if (!fighting || !currentCampaign) return setCombatContext(null);
    setCombatContext({
      cid: currentCampaign.id,
      sceneId: scene.id,
      round: combat!.round,
      turn: combat!.turn,
      tokens: allTokens.map((t) => ({ id: t.id, key: keyOf(t), name: t.name, owner: ownerOf(t) })),
    });
  }, [turnKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setCombatContext(null), []);

  // "Your turn" for the player whose token comes up (not on opening the map: the initiative and the dots say so).
  const turn = combat?.active ? combat.turn : null;
  const lastTurn = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (turn && lastTurn.current !== undefined && turn !== lastTurn.current) {
      const t = tokens.find((x) => x.id === turn);
      if (t && t.controlledBy.includes(uid) && !asDM) toast.show(`Your turn: ${t.name}`);
    }
    lastTurn.current = turn;
  }, [turn]); // eslint-disable-line react-hooks/exhaustive-deps

  return { fighting, keyOf, ownerOf, turnSpeed, movedOf };
}
