import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Dices, EyeOff, Flag, HelpCircle, Play, SkipForward, Square, Swords } from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { abilityMod, initiativeOrder, moveInOrder, nextTurnIn } from '../../lib/battle/geometry';
import { setCombat, setInitiativeOrder, setInitiatives, setTurn, updateScene, updateToken } from '../../lib/battle/sceneService';
import { rollD20 } from '../../lib/battle/table';
import type { Entity, Scene, Token } from '../../types';
import EncounterMeter from './EncounterMeter';
import { patchPlay, tableLive } from '../../lib/play/live';
import { colorOf, useTableColors } from '../../lib/chat/colorStore';
import { setInitiativeContext, useSittingOut } from '../../lib/battle/initiativeStore';
import { openTableChat } from '../chat/ChatDock';

interface Props {
  scene: Scene;
  tokens: Token[];
  /** The token list has loaded (until then an empty list means nothing). */
  tokensReady: boolean;
  uid: string;
  asDM: boolean;
  entityMap: Map<string, Entity>;
  onSelect: (id: string) => void;
  /** Pointing at a row (spotlights the token on the map). */
  onHover?: (id: string | null) => void;
  /** The token pointed at on the map: its row lights up. */
  highlightId?: string | null;
}

/** Phones: the tracker starts folded so it doesn't cover the map. */
const narrow = () => typeof window !== 'undefined' && window.innerWidth < 640;

/** Initiative order and turns. The DM runs it; players roll for and pass their own tokens' turns. */
export default function InitiativeTracker({ scene, tokens, tokensReady, uid, asDM, entityMap, onSelect, onHover, highlightId }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const currentRow = useRef<HTMLLIElement | null>(null);
  // Folded away until combat starts (it would cover the map while setting up).
  const [open, setOpen] = useState(!!scene.combat?.active && !narrow());
  const [busy, setBusy] = useState(false);
  const combat = scene.combat ?? { active: false, round: 0, turn: null };
  const order = useMemo(() => initiativeOrder(tokens), [tokens]);
  const orderIds = order.map((t) => t.id);
  // Players only see (and roll for) their own tokens among those still to roll.
  const unrolled = tokens.filter((t) => (t.initiative === null || t.initiative === undefined) && (asDM || t.controlledBy.includes(uid)));
  const mine = (t: Token) => t.controlledBy.includes(uid);
  const tableColors = useTableColors();
  const mayRoll = (t: Token) => asDM || mine(t);
  const turnToken = tokens.find((t) => t.id === combat.turn);
  const myTurn = !!turnToken && mine(turnToken);
  useEffect(() => {
    if (combat.active && !narrow()) setOpen(true);
  }, [combat.active]);

  // A creature's reaction comes back at the start of its turn (the DM's screen does it, or the
  // player's own for their character).
  useEffect(() => {
    if (!combat.active || !turnToken || !(asDM || mine(turnToken))) return;
    const play = tableLive().play;
    const key = turnToken.entityId && play[`c_${turnToken.entityId}`] ? `c_${turnToken.entityId}` : `t_${turnToken.id}`;
    const live = play[key];
    if (live?.re && live.uid) patchPlay(scene.campaignId, key, live.uid, live.name ?? turnToken.name, { re: null }).catch(() => undefined);
  }, [combat.turn, combat.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // The DM's screen keeps the stored order in step with the rolls (players can't see hidden tokens).
  // Only the order field is written, so a turn a player just passed on is never overwritten.
  useEffect(() => {
    if (!asDM || !combat.active || !tokensReady) return;
    if (JSON.stringify(orderIds) !== JSON.stringify(combat.order ?? [])) {
      const patch: Record<string, unknown> = { 'combat.order': orderIds };
      // The token whose turn it was left the order (removed, or its roll cleared): the turn
      // moves on from where it stood, rather than back to the top.
      if (combat.turn && !orderIds.includes(combat.turn) && combat.order?.includes(combat.turn)) {
        const down = new Set(tokens.filter((t) => t.controlledBy.length === 0 && t.health === 'down').map((t) => t.id));
        const n = nextTurnIn(combat.order, combat.turn, combat.round, (id) => !orderIds.includes(id) || down.has(id));
        patch['combat.turn'] = n.turn === combat.turn ? orderIds[0] ?? null : n.turn;
        patch['combat.round'] = n.round;
      }
      updateScene(scene.id, patch).catch(() => undefined);
    }
  }, [asDM, combat.active, tokensReady, orderIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, what: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err, what);
    } finally {
      setBusy(false);
    }
  };

  const modOf = (t: Token) => {
    const e = t.entityId ? entityMap.get(t.entityId) : undefined;
    return e?.dndStats ? abilityMod(e.dndStats.dex) : 0;
  };
  // Rolling happens in the table chat (one place to roll); this tells it who still has to.
  const out = useSittingOut(scene.id);
  const sitting = (t: Token) => asDM && t.controlledBy.length === 0 && out.includes(t.id);
  const unrolledKey = unrolled.map((t) => `${t.id}:${t.name}:${modOf(t)}:${t.hidden ? 1 : 0}`).join('|');
  useEffect(() => {
    setInitiativeContext({
      sceneId: scene.id,
      sceneName: scene.name,
      asDM,
      combatActive: !!combat.active,
      unrolled: unrolled.map((t) => ({ id: t.id, name: t.name, mod: modOf(t), player: t.controlledBy.length > 0, mine: mine(t), hidden: !!t.hidden })),
    });
  }, [scene.id, scene.name, asDM, combat.active, unrolledKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setInitiativeContext(null), []);
  const rollInChat = () => openTableChat({ initiative: true });
  const canRollSome = unrolled.some((t) => mayRoll(t) && !sitting(t));

  const start = async () => {
    const waiting = tokens.filter((t) => t.controlledBy.length > 0 && (t.initiative === null || t.initiative === undefined));
    if (
      waiting.length &&
      !(await confirm({
        title: 'Start before everyone has rolled?',
        message: `${waiting.map((t) => t.name).join(', ')} ${waiting.length === 1 ? 'hasn’t' : 'haven’t'} rolled initiative yet. They join the order as soon as they roll.`,
        confirmLabel: 'Start anyway',
      }))
    )
      return;
    await begin();
  };
  const begin = () =>
    run(async () => {
      // Monsters the DM runs get rolled for automatically (not those sitting this fight out).
      const npcs = unrolled.filter((t) => t.controlledBy.length === 0 && !sitting(t));
      let all = tokens;
      if (npcs.length) {
        const rolls = Object.fromEntries(npcs.map((t) => [t.id, rollD20(modOf(t))]));
        await setInitiatives(scene.id, rolls);
        all = tokens.map((t) => (t.id in rolls ? { ...t, initiative: rolls[t.id] } : t));
      }
      const o = initiativeOrder(all);
      await setCombat(scene.id, { active: true, round: 1, turn: o[0]?.id ?? null, order: o.map((t) => t.id) });
    }, 'Start combat');

  const next = () =>
    run(async () => {
      // The stored order (players: it includes tokens they can't see). Monsters that are down and
      // tokens that were removed don't get a turn; characters at 0 HP still do (death saves).
      const ids = combat.order?.length ? combat.order : orderIds;
      const byId = new Map(tokens.map((t) => [t.id, t]));
      const skip = (id: string) => {
        const t = byId.get(id);
        if (!t) return asDM; // the DM sees every token, so a missing one was removed
        return t.controlledBy.length === 0 && t.health === 'down';
      };
      const n = nextTurnIn(ids, combat.turn, combat.round, skip);
      await setTurn(scene.id, n.turn, n.round);
    }, 'Next turn');

  // Keep the current turn in view when the list scrolls.
  useEffect(() => {
    currentRow.current?.scrollIntoView({ block: 'nearest' });
  }, [combat.turn, open]);

  const end = async () => {
    // Right next to "Next turn": a slip shouldn't throw away the turn order.
    if (!(await confirm({ title: 'End combat?', message: 'The turn order is cleared. Conditions stay on the tokens until removed.', confirmLabel: 'End combat' }))) return;
    await run(async () => {
      await setCombat(scene.id, { active: false, round: 0, turn: null, order: [] });
      // Round counts mean nothing outside combat: timed effects stay on, until removed by hand.
      await Promise.all(tokens.filter((t) => t.timers && Object.keys(t.timers).length).map((t) => updateToken(scene.id, t.id, { timers: {} })));
      // Reactions are a per-round thing: everyone on this map has theirs back when the fight ends.
      const play = tableLive().play;
      for (const t of tokens) {
        const key = t.entityId && play[`c_${t.entityId}`] ? `c_${t.entityId}` : `t_${t.id}`;
        const live = play[key];
        if (live?.re && live.uid) await patchPlay(scene.campaignId, key, live.uid, live.name ?? t.name, { re: null }).catch(() => undefined);
      }
    }, 'End combat');
  };
  // The DM's say on the order (ties the players talk out, or anything else): one place at a time.
  const move = (t: Token, dir: -1 | 1) => {
    const places = moveInOrder(order, t.id, dir);
    if (Object.keys(places).length) run(() => setInitiativeOrder(scene.id, places), 'Change the order');
  };
  const clear = () => run(() => setInitiatives(scene.id, Object.fromEntries(tokens.map((t) => [t.id, null]))), 'Clear initiative');

  const setValue = (t: Token, v: string) => {
    const n = v.trim() === '' ? null : Math.max(-10, Math.min(99, parseInt(v, 10)));
    if (n !== null && !Number.isFinite(n)) return;
    if (n === t.initiative) return;
    run(() => setInitiatives(scene.id, { [t.id]: n }), 'Set initiative');
  };

  // Players only list creatures the party knows about (their own side, and monsters once seen or
  // acting). When something unknown acts, they get a "?" in its place.
  const knownToParty = (t: Token) => t.controlledBy.length > 0 || !!t.known;
  type Row = { kind: 'token'; t: Token } | { kind: 'unknown'; id: string };
  const rows: Row[] = asDM
    ? order.map((t) => ({ kind: 'token', t }))
    : (() => {
        const byId = new Map(tokens.map((t) => [t.id, t]));
        const ids = combat.active && combat.order?.length ? combat.order : orderIds;
        const out: Row[] = [];
        for (const id of ids) {
          const t = byId.get(id);
          if (t && knownToParty(t) && t.initiative !== null && t.initiative !== undefined) out.push({ kind: 'token', t });
          else if (combat.active && id === combat.turn) out.push({ kind: 'unknown', id });
        }
        return out;
      })();
  const turnName = turnToken && (asDM || knownToParty(turnToken)) ? turnToken.name : null;
  const headline = combat.active
    ? `Round ${combat.round} · ${myTurn ? 'Your turn' : turnName ? `${turnName}’s turn` : asDM ? 'DM’s turn' : 'Something unseen acts'}`
    : 'Initiative';

  if (!asDM && !combat.active && order.length === 0 && !unrolled.some(mine)) return null;

  return (
    <div onMouseLeave={() => onHover?.(null)} className="w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-stone-700/80 bg-stone-950/92 text-sm shadow-xl backdrop-blur">
      <div className="flex items-center">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Swords size={15} className={combat.active ? 'text-amber-400' : 'text-stone-500'} />
          <span className={clsx('min-w-0 flex-1 truncate font-semibold', myTurn ? 'text-amber-300' : 'text-stone-100')}>{headline}</span>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {/* Folded, with someone of yours still to roll: the way to the roll stays one click away. */}
        {!open && canRollSome && !(combat.active && asDM) && (
          <button type="button" className="btn btn-primary btn-sm mr-1.5 px-2" onClick={rollInChat} title="Roll for initiative (in the table chat)">
            <Dices size={13} /> Roll
          </button>
        )}
        {/* Folded during a fight: moving the turn on doesn't need the whole list. */}
        {!open && combat.active && (asDM || myTurn) && (
          <button
            type="button"
            className="btn btn-primary btn-sm mr-1.5 shrink-0 px-2"
            onClick={next}
            disabled={busy}
            aria-label={asDM ? 'Next turn' : 'End my turn'}
            title={asDM ? 'Next turn' : 'End my turn'}
          >
            {asDM ? <SkipForward size={13} /> : <Flag size={13} />} {asDM ? 'Next' : 'Done'}
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-stone-800 px-2 pt-1.5 pb-2">
          {asDM && tokens.some((t) => t.controlledBy.length === 0) && <EncounterMeter tokens={tokens} entityMap={entityMap} compact />}
          {rows.length > 0 && (
            <ol className="scrollbar-thin max-h-56 space-y-0.5 overflow-y-auto">
              {rows.map((row, idx) => {
                if (row.kind === 'unknown')
                  return (
                    <li key={row.id} ref={currentRow} className="flex items-center gap-2 rounded-md bg-amber-500/15 px-1.5 py-1 ring-1 ring-amber-500/40">
                      <span className="w-9 text-center text-xs text-stone-500">?</span>
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-stone-400 italic">
                        <HelpCircle size={13} /> Something unseen
                      </span>
                    </li>
                  );
                const t = row.t;
                return (
                <li
                  key={t.id}
                  ref={t.id === combat.turn ? currentRow : undefined}
                  onMouseEnter={() => onHover?.(t.id)}
                  onMouseLeave={() => onHover?.(null)}
                  // Players' rows carry a thin stripe of their colour.
                  style={{ borderLeftColor: t.controlledBy.length ? colorOf(tableColors, t.controlledBy[0]) : 'transparent' }}
                  className={clsx(
                    'flex items-center gap-2 rounded-md border-l-[3px] px-1.5 py-1 transition-colors',
                    t.id === combat.turn && 'bg-amber-500/15 ring-1 ring-amber-500/40',
                    highlightId === t.id && 'bg-stone-700/60',
                  )}
                >
                  <input
                    aria-label={`Initiative for ${t.name}`}
                    className="w-9 rounded border border-stone-700 bg-stone-900 py-0.5 text-center text-xs tabular-nums text-stone-100 disabled:border-transparent disabled:bg-transparent"
                    defaultValue={t.initiative ?? ''}
                    key={`${t.id}-${t.initiative}`}
                    // The order is the DM's to adjust; players roll in the chat.
                    disabled={!asDM}
                    inputMode="numeric"
                    onBlur={(e) => setValue(t, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                  <button type="button" className={clsx('min-w-0 flex-1 truncate text-left', t.hidden ? 'text-stone-500 italic' : 'text-stone-200', mine(t) && 'font-semibold')} onClick={() => onSelect(t.id)}>
                    {t.name}
                  </button>
                  {asDM && !t.hidden && !knownToParty(t) && <span title="The players haven't seen this one yet"><EyeOff size={12} className="text-stone-500" /></span>}
                  {t.health === 'down' && <span className="text-[10px] text-rose-400 uppercase">down</span>}
                  {asDM && (
                    <span className="-my-1 flex shrink-0 flex-col">
                      <button type="button" className="text-stone-500 hover:text-amber-300 disabled:opacity-20" aria-label={`Move ${t.name} up`} title="Earlier in the order" disabled={busy || idx === 0} onClick={() => move(t, -1)}>
                        <ChevronUp size={12} />
                      </button>
                      <button type="button" className="text-stone-500 hover:text-amber-300 disabled:opacity-20" aria-label={`Move ${t.name} down`} title="Later in the order" disabled={busy || idx === rows.length - 1} onClick={() => move(t, 1)}>
                        <ChevronDown size={12} />
                      </button>
                    </span>
                  )}
                </li>
                );
              })}
            </ol>
          )}
          {asDM && rows.length > 1 && <p className="px-1.5 pt-1 text-[10px] text-stone-500">Ties: players first. ↑ ↓ to change the order.</p>}
          {unrolled.length > 0 && (
            <div className="mt-1.5">
              <div className="px-1.5 text-[10px] font-semibold tracking-wider text-stone-500 uppercase">Not rolled</div>
              <ul className="space-y-0.5">
                {unrolled.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-1.5 py-0.5">
                    <span className={clsx('min-w-0 flex-1 truncate', t.hidden ? 'text-stone-500 italic' : 'text-stone-300', sitting(t) && 'line-through opacity-50')}>{t.name}</span>
                    {sitting(t) && <span className="text-[10px] text-stone-500">sitting out</span>}
                  </li>
                ))}
              </ul>
              {canRollSome && (
                <button type="button" className="btn btn-secondary btn-sm mt-1 w-full" onClick={rollInChat}>
                  <Dices size={13} /> {asDM ? 'Roll initiative…' : 'Roll for initiative'}
                </button>
              )}
            </div>
          )}
          {tokens.length === 0 && <p className="px-1.5 py-2 text-xs text-stone-500">Add tokens to the map to track initiative.</p>}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {asDM && !combat.active && (
              <>
                <button type="button" className="btn btn-primary btn-sm flex-1" onClick={start} disabled={busy || tokens.length === 0}>
                  <Play size={13} /> Start combat
                </button>
                {order.length > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clear} disabled={busy} title="Clear all rolls">
                    Clear
                  </button>
                )}
              </>
            )}
            {combat.active && (asDM || myTurn) && (
              <button type="button" className="btn btn-primary btn-sm flex-1" onClick={next} disabled={busy}>
                {asDM ? <SkipForward size={13} /> : <Flag size={13} />} {asDM ? 'Next turn' : 'End my turn'}
              </button>
            )}
            {asDM && combat.active && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={end} disabled={busy} aria-label="End combat" title="End combat">
                <Square size={12} /> End
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
