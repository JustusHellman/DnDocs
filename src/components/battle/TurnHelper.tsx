import { useEffect, useMemo, useRef, useState } from 'react';
import { useDragPosition } from '../../hooks/useDragPosition';
import clsx from 'clsx';
import { arrayRemove, arrayUnion, deleteField } from 'firebase/firestore';
import { ChevronDown, ChevronUp, Dices, Footprints, GripHorizontal, Minus, Plus, Swords, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useCodexStat } from '../../hooks/useCodexStat';
import { nextTurnIn } from '../../lib/battle/geometry';
import { patchToken } from '../../lib/battle/sceneService';
import { tableChat } from '../../lib/chat/bus';
import { toChatRoll } from '../../lib/chat/rolls';
import { hasStats, toDndStats } from '../../lib/codex/catalog';
import { parseFormula, rollFormula } from '../../lib/dice';
import { castTime, spellTone, useColoring } from '../../lib/play/coloring';
import { patchPlay, useTableLive } from '../../lib/play/live';
import { resourceLeft, type PlayLive } from '../../lib/play/model';
import { openPlay, readySpells, useSpellIndex } from '../../lib/play/ui';
import { usePlayer } from '../../lib/play/usePlayer';
import { useSpellRule } from '../../lib/play/useSpellRule';
import { attacksPerAction, basicOptions, classOptions, counterOptions, COST_LABEL, statBlockOptions, turnState, walkSpeed, type Cost, type TurnOption } from '../../lib/play/turn';
import type { Spell } from '../../lib/play/spells';
import type { Entity, Scene, Token } from '../../types';
import SpellGlyph from '../play/SpellGlyph';
import { openQuickBook } from '../play/QuickBook';
import { openTableChat } from '../chat/ChatDock';

type Mode = 'open' | 'bar' | 'mini';
const MODE_KEY = 'dndocs-turn-helper';
const readMode = (): Mode => {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'open' || v === 'mini' ? v : 'bar';
  } catch {
    return 'bar';
  }
};

interface Props {
  scene: Scene;
  /** The tokens this viewer sees. */
  tokens: Token[];
  /** Whose options to show (picked by the battle map). */
  subject: Token;
  entity: Entity | undefined;
  /** Where its live state is kept, and who may write it. */
  liveKey: string;
  owner: string;
  asDM: boolean;
  /** Its walking speed (null: not known). */
  speed: number | null;
  /** Where the dots go, and where the list opens (positions on the map). */
  barClass: string;
  panelClass: string;
}

/**
 * The turn helper: what a creature can do on its turn and what it has used — action, bonus
 * action, reaction and movement — as three dots and a meter that experienced players can leave at
 * that, and a cheat-sheet underneath for everyone still learning: every option, by what it costs,
 * where it comes from, and a tap to do it (cast, Dash, Dodge, an opportunity attack…).
 */
export default function TurnHelper({ scene, tokens, subject, entity, liveKey, owner, asDM, speed, barClass, panelClass }: Props) {
  const { currentCampaign } = useAuth();
  const toast = useToast();
  const table = useTableLive();
  const coloring = useColoring();
  const [mode, setModeState] = useState<Mode>(readMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };
  const [tab, setTab] = useState<Cost>('action');
  // The list can be dragged anywhere on bigger screens (remembered on this device).
  const listBox = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition('dndocs-turn-list-pos', listBox, 352);
  const phone = typeof window !== 'undefined' && window.innerWidth < 640;
  const moved = !phone && drag.pos;
  const [moveOpen, setMoveOpen] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  useEffect(() => setOpenRow(null), [subject.id]);
  // The list opens on what's useful now: actions on your turn, reactions while waiting.
  const myTurnNow = scene.combat?.turn === subject.id;
  const liveNow = table.play[liveKey];
  // On your turn: the first of action, bonus action, reaction that's still there.
  const firstFree: Cost = !myTurnNow ? 'reaction' : (liveNow?.ac ?? 0) < 1 + (liveNow?.ax ?? 0) ? 'action' : !liveNow?.ba ? 'bonus' : 'reaction';
  useEffect(() => setTab(firstFree), [subject.id, myTurnNow, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const combat = scene.combat!;
  const isTurn = combat.turn === subject.id;
  const edition = currentCampaign?.houseRules?.edition === '2024' ? '2024' : '2014';
  const character = entity?.type === 'character' ? entity : null;
  const p = usePlayer(character);
  const live: PlayLive = table.play[liveKey] ?? {};
  // A codex monster's speed comes with its SRD stat block (loaded below).
  const [srdSpeed, setSrdSpeed] = useState<number | null>(null);
  const walk = speed ?? srdSpeed;
  const state = turnState(live, {
    speed: walk,
    conditions: subject.conditions,
    edition,
    spells: currentCampaign?.houseRules?.spellsPerTurn,
  });
  const canWrite = asDM || (p?.canEdit ?? subject.controlledBy.length > 0);
  const who = subject.name.length <= 14 ? subject.name : subject.name.split(' ')[0];

  // A creature's stat block (the DM's monsters): its own actions, bonus actions and reactions.
  const own = entity && hasStats(entity.dndStats) ? (entity.statBlock ?? '') : null;
  const codexRef = subject.codexRef || (typeof entity?.attributes?.codexRef === 'string' ? entity.attributes.codexRef : null);
  const srd = useCodexStat(!character && own === null && asDM && codexRef ? codexRef : null);
  const statText = character ? null : (own ?? (srd ? toDndStats(srd).statBlock : null));
  useEffect(() => setSrdSpeed(srd ? walkSpeed(srd.speed) : null), [srd]);
  const block = useMemo(() => statBlockOptions(statText), [statText]);

  // A character's ready spells, by what they take.
  const index = useSpellIndex(edition, !!p);
  const spells = useMemo(() => (p ? readySpells(p.def, p.d, index.byId) : []), [p?.def, p?.d, index.byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const spellsBy = (c: Cost) => spells.filter((s) => castTime(s) === c);
  const rule = useSpellRule(p);

  const options = useMemo(() => {
    if (p) {
      const costs = Object.fromEntries((p.def.counters ?? []).map((c) => [`x_${c.id}`, c.cost]));
      const caster = spells.length > 0 || p.d.casterClasses.length > 0;
      return [...basicOptions(edition, attacksPerAction(p.d)).filter((o) => o.id !== 'cast' || caster), ...classOptions(edition, p.d), ...counterOptions(p.d.resources, costs)];
    }
    // A creature: its stat block first; the general options a monster uses (no spell or potion
    // lines unless it has them).
    const keep = new Set(['dash', 'disengage', 'dodge', 'help', 'hide', 'ready', 'search', 'oa', 'readied', ...(block.options.some((o) => o.hit !== undefined) ? [] : ['attack'])]);
    if (/spellcasting/i.test(statText ?? '')) keep.add('cast');
    return [...block.options, ...basicOptions(edition).filter((o) => keep.has(o.id))];
  }, [p, spells.length, edition, block, statText]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentCampaign) return null;
  const cid = currentCampaign.id;

  // ---- what's allowed right now --------------------------------------------------------------
  const left = (c: Cost) => (c === 'action' ? state.actions - state.actionsTaken : c === 'bonus' ? (state.bonusTaken ? 0 : 1) : c === 'reaction' ? (state.reactionTaken ? 0 : 1) : 1);
  const why = (c: Cost): string | null => {
    if (state.cantAct && c !== 'free') return `${state.cantAct}: no actions or reactions`;
    if ((c === 'action' || c === 'bonus') && !isTurn) return 'Only on your turn';
    if (left(c) <= 0) return `${COST_LABEL[c]} already taken`;
    return null;
  };
  const resOf = (o: TurnOption) => (o.res ? p?.d.resources.find((r) => r.key === o.res) : undefined);
  const noUses = (o: TurnOption) => {
    const r = resOf(o);
    return !!r && (o.n ?? 1) > 0 && resourceLeft(r, live) < (o.n ?? 1);
  };

  // ---- writing ---------------------------------------------------------------------------------
  const patch = (data: Record<string, unknown>) => patchPlay(cid, liveKey, live.uid ?? owner, live.name ?? subject.name, data).catch((err) => toast.error(err, 'Turn'));
  const toggle = (c: Cost) => {
    if (!canWrite) return;
    if (c === 'action')
      patch({
        ac: state.actionsTaken >= state.actions ? Math.max(0, state.actionsTaken - 1) || null : state.actionsTaken + 1,
      });
    else if (c === 'bonus') patch({ ba: state.bonusTaken ? null : 1 });
    else if (c === 'reaction') patch({ re: state.reactionTaken ? null : 1 });
  };
  const mark = (c: Cost, extra: Record<string, unknown> = {}) => {
    const d: Record<string, unknown> = { ...extra };
    if (c === 'action') d.ac = state.actionsTaken + 1;
    else if (c === 'bonus') d.ba = 1;
    else if (c === 'reaction') d.re = 1;
    return Object.keys(d).length ? patch(d) : Promise.resolve();
  };
  const order = combat.order ?? [];
  /** A condition on the token, ending at the start of a turn (or kept until removed). */
  const addCondition = (name: string, until: { round: number; turn: string | null } | null) =>
    patchToken(scene.id, subject.id, {
      conditions: arrayUnion(name),
      [`timers.${name}`]: until ?? deleteField(),
    }).catch((err) => toast.error(err, name));
  const dropCondition = (name: string) =>
    subject.conditions.includes(name) &&
    patchToken(scene.id, subject.id, {
      conditions: arrayRemove(name),
      [`timers.${name}`]: deleteField(),
    }).catch(() => undefined);
  const untilMyNextTurn = { round: combat.round + 1, turn: subject.id };
  const untilEndOfTurn = (() => {
    const n = nextTurnIn(order, subject.id, combat.round, (id) => !tokens.some((t) => t.id === id) && !asDM);
    return { round: n.round, turn: n.turn };
  })();
  // A token hidden from the players acts without a line in the chat.
  const say = async (what: string, cost: Cost, note?: string) => {
    if (!subject.hidden) await tableChat.event({ t: 'act', who, what, cost, ...(note ? { note } : {}) });
  };
  const roll = (f: string, label: string) => {
    const parsed = parseFormula(f);
    if (parsed) tableChat.roll(toChatRoll(rollFormula(parsed), label));
  };

  /** What the chat says someone did. */
  const phrase = (o: TurnOption) =>
    (
      ({
        attack: 'attacks',
        oa: 'makes an opportunity attack',
        ready: 'readies an action',
        readied: 'uses a readied action',
        offhand: 'makes an off-hand attack',
        potion: 'drinks a potion',
        object: 'uses an object',
        interact: 'interacts with an object',
      }) as Record<string, string>
    )[o.id] ?? ((o.from === undefined && !o.id.startsWith('sb-')) || o.id.startsWith('cunning-') ? `takes the ${o.name.replace(/^Cunning Action: /, '')} action` : `uses ${o.name}`);

  const run = async (o: TurnOption) => {
    if (!canWrite) return;
    try {
      // A creature's attack from its stat block: roll to hit and damage. The first one on its turn
      // takes the action; the others are part of it (Multiattack). Off its turn (an opportunity
      // attack, a readied one) it just rolls.
      if (o.hit !== undefined) {
        if (state.cantAct) return toast.show(`${state.cantAct}: no attacks`);
        if (isTurn && o.cost !== 'free' && left(o.cost) > 0 && !(o.cost === 'action' && state.actionsTaken > 0)) await mark(o.cost);
        await dropCondition('Hidden');
        roll(`1d20${o.hit >= 0 ? '+' : ''}${o.hit}`, `${o.name} to hit`);
        for (const d of o.dmg ?? []) roll(d.f, `${o.name} ${d.ty}`);
        return;
      }
      const blocked = why(o.cost);
      if (blocked) return toast.show(blocked);
      const r = resOf(o);
      // Spells: the cast dialog spends the slot (or the counter) and marks what the spell takes.
      if (o.does === 'cast') {
        if (p) {
          if (r?.spell) openPlay({ kind: 'cast', entityId: p.entity.id, spellId: r.spell });
          else openQuickBook({ entityId: p.entity.id });
        } else await mark(o.cost).then(() => say('casts a spell', o.cost));
        return;
      }
      if (noUses(o)) return toast.show(`No ${r?.name ?? 'uses'} left`);
      // Pools (Lay on Hands, Font of Magic): how much is up to you, in the spellbook panel.
      if (r && o.n === 0) openQuickBook({ entityId: entity?.id });
      else if (r && p && !(await p.spendRes(r, o.n ?? 1, o.name === r.name ? undefined : o.name))) return;
      const extra: Record<string, unknown> = {};
      switch (o.does) {
        case 'dash':
          extra.dx = (live.dx ?? 0) + 1;
          break;
        case 'surge':
          extra.ax = (live.ax ?? 0) + 1;
          break;
        case 'dodge':
          await addCondition('Dodging', untilMyNextTurn);
          break;
        case 'disengage':
          await addCondition('Disengaged', untilEndOfTurn);
          break;
        case 'hide':
          await addCondition('Hidden', null);
          break;
        case 'ready':
          await addCondition('Readied', untilMyNextTurn);
          break;
        case 'rage':
          await addCondition('Rage', {
            round: combat.round + 10,
            turn: subject.id,
          });
          break;
        case 'attack':
        case 'oa':
          await dropCondition('Hidden');
          if (p) openTableChat({ dice: true });
          break;
      }
      if (o.id === 'readied') await dropCondition('Readied');
      // Free things that do nothing by themselves (Sneak Attack, talking…): just explain.
      if (o.cost === 'free' && !r && !Object.keys(extra).length) {
        setOpenRow(openRow === o.id ? null : o.id);
        return;
      }
      await mark(o.cost, extra);
      // The table hears about it (spending a counter already put a line in the chat).
      if (!r && o.cost !== 'free') await say(phrase(o), o.cost);
    } catch (err) {
      toast.error(err, o.name);
    }
  };

  /** A creature's opportunity attack with one of its attacks: the reaction, and the rolls. */
  const opportunity = async (o: TurnOption) => {
    const blocked = why('reaction');
    if (blocked) return toast.show(blocked);
    await mark('reaction');
    await dropCondition('Hidden');
    await say('makes an opportunity attack', 'reaction', o.name);
    roll(`1d20${o.hit! >= 0 ? '+' : ''}${o.hit}`, `${o.name} to hit`);
    for (const d of o.dmg ?? []) roll(d.f, `${o.name} ${d.ty}`);
  };

  // ---- movement --------------------------------------------------------------------------------
  const prone = subject.conditions.some((c) => c.toLowerCase() === 'prone');
  const standUp = async () => {
    if (!canWrite) return;
    await dropCondition('Prone');
    if (walk !== null) await patch({ mv: state.moved + Math.floor(walk / 2) });
  };
  const nudge = (ft: number) => canWrite && patch({ mv: Math.max(0, state.moved + ft) || null });
  const showMove = state.speed !== null || state.moved > 0;
  const moveLabel = state.speed === null ? `Moved ${state.moved} ft` : `${Math.max(0, state.speed - state.moved)} ft left`;

  // ---- the bar ---------------------------------------------------------------------------------
  const Dot = ({ c, short }: { c: Cost; short: string }) => {
    const n = c === 'action' ? state.actions : 1;
    const taken = c === 'action' ? state.actionsTaken : c === 'bonus' ? Number(state.bonusTaken) : Number(state.reactionTaken);
    const off = !!state.cantAct || ((c === 'action' || c === 'bonus') && !isTurn);
    return (
      <button
        type="button"
        disabled={!canWrite}
        onClick={() => toggle(c)}
        className={clsx(
          'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ring-1 transition-colors',
          taken >= n ? 'text-stone-500 ring-stone-700 line-through' : off ? 'text-stone-400 ring-stone-700' : 'text-stone-100 ring-amber-500/60',
        )}
        title={taken >= n ? `${COST_LABEL[c]} taken — tap to undo` : `${COST_LABEL[c]}: tap when you've taken it`}
        aria-label={`${COST_LABEL[c]}: ${taken >= n ? 'taken' : 'not taken'}`}
      >
        <span className="flex gap-0.5">
          {Array.from({ length: n }, (_, i) => (
            <span
              key={i}
              className={clsx(
                'size-2.5 rounded-full ring-1',
                i < n - taken
                  ? off
                    ? 'bg-stone-500 ring-stone-500'
                    : c === 'reaction'
                      ? 'bg-rose-400 ring-rose-300'
                      : c === 'bonus'
                        ? 'bg-sky-400 ring-sky-300'
                        : 'bg-amber-400 ring-amber-300'
                  : 'ring-stone-600',
              )}
            />
          ))}
        </span>
        <span className="hidden sm:inline">{short}</span>
        <span className="sm:hidden">{short[0]}</span>
      </button>
    );
  };

  if (mode === 'mini') {
    return (
      <div className={clsx('pointer-events-none absolute flex justify-center', barClass)}>
        <button
          type="button"
          onClick={() => setMode('bar')}
          className={clsx(
            'flex items-center gap-1.5 rounded-full border bg-stone-950/92 px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur',
            isTurn ? 'border-amber-500/70 text-amber-200' : 'border-stone-600/70 text-stone-300',
          )}
          title="Show the turn helper"
        >
          <Swords size={13} /> {isTurn ? `${who}’s turn` : who}
          <span className="flex gap-0.5">
            {(['action', 'bonus', 'reaction'] as const).map((c) => (
              <span
                key={c}
                className={clsx('size-2 rounded-full', left(c) > 0 && !why(c) ? (c === 'reaction' ? 'bg-rose-400' : c === 'bonus' ? 'bg-sky-400' : 'bg-amber-400') : 'bg-stone-700')}
              />
            ))}
          </span>
        </button>
      </div>
    );
  }

  const column = (c: Cost) => {
    const list = options.filter((o) => o.cost === c);
    const casts = p ? spellsBy(c) : [];
    const blocked = why(c);
    return (
      <div key={c} className={clsx('min-w-0 space-y-1', tab !== c && 'hidden')}>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'text-[11px] font-semibold tracking-wide uppercase',
              c === 'reaction' ? 'text-rose-300' : c === 'bonus' ? 'text-sky-300' : c === 'free' ? 'text-stone-400' : 'text-amber-300',
            )}
          >
            {c === 'free' ? 'Free & on a hit' : COST_LABEL[c]}
          </span>
          {c !== 'free' && blocked && <span className="truncate text-[11px] text-stone-500">{blocked}</span>}
        </div>
        {c === 'free' && prone && (
          <Row
            o={{
              id: 'stand',
              name: 'Stand up',
              cost: 'free',
              text: walk !== null ? `Costs half your speed (${Math.floor(walk / 2)} ft).` : 'Costs half your speed.',
            }}
            onRun={standUp}
            dim={!isTurn}
          />
        )}
        {list.map((o) => (
          <div key={o.id}>
            <Row
              o={o}
              onRun={() => run(o)}
              dim={o.hit !== undefined ? !!state.cantAct : !!blocked}
              empty={noUses(o)}
              open={openRow === o.id}
              onInfo={() => setOpenRow(openRow === o.id ? null : o.id)}
            />
            {o.does === 'cast' && casts.length > 0 && !o.res && (
              <SpellChips
                spells={casts}
                tone={(s) => spellTone(s, coloring)}
                onCast={(s) =>
                  p &&
                  openPlay({
                    kind: 'cast',
                    entityId: p.entity.id,
                    spellId: s.i,
                  })
                }
                dim={!!blocked}
                rule={rule}
              />
            )}
          </div>
        ))}
        {/* Bonus-action and reaction spells sit in their own columns. */}
        {c !== 'action' && c !== 'free' && casts.length > 0 && (
          <div>
            <div className="px-1 pt-1 text-[11px] text-stone-500">{c === 'bonus' ? 'Bonus-action spells' : 'Reaction spells'}</div>
            <SpellChips spells={casts} tone={(s) => spellTone(s, coloring)} onCast={(s) => p && openPlay({ kind: 'cast', entityId: p.entity.id, spellId: s.i })} dim={!!blocked} rule={rule} />
          </div>
        )}
        {c === 'reaction' && !p && block.options.some((o) => o.hit !== undefined && o.cost === 'action') && (
          <div>
            <div className="px-1 pt-1 text-[11px] text-stone-500">Opportunity attack with…</div>
            <div className="flex flex-wrap gap-1 px-1 pb-1">
              {block.options
                .filter((o) => o.hit !== undefined && o.cost === 'action')
                .map((o) => (
                  <button key={o.id} type="button" disabled={!canWrite || !!blocked} onClick={() => opportunity(o)} className="flex items-center gap-1 rounded-full bg-stone-900 px-2 py-0.5 text-xs text-stone-200 ring-1 ring-stone-700 hover:ring-stone-500 disabled:opacity-45">
                    <Dices size={11} className="text-amber-300" /> {o.name} {o.hit! >= 0 ? '+' : ''}
                    {o.hit}
                  </button>
                ))}
            </div>
          </div>
        )}
        {c === 'reaction' && block.legendary.length > 0 && (
          <div>
            <div className="px-1 pt-1 text-[11px] text-stone-500">Legendary actions (at the end of another creature’s turn)</div>
            {block.legendary.map((o) => (
              <Row key={o.id} o={o} onRun={() => run(o)} open={openRow === o.id} onInfo={() => setOpenRow(openRow === o.id ? null : o.id)} />
            ))}
          </div>
        )}
        {!list.length && !casts.length && !(c === 'free' && prone) && <p className="px-1 text-xs text-stone-500 italic">Nothing here.</p>}
      </div>
    );
  };

  return (
    <>
      {mode === 'open' && (
        <div
          ref={listBox}
          style={moved ? { left: drag.pos!.x, top: drag.pos!.y, maxHeight: `min(70vh, calc(100vh - ${drag.pos!.y + 12}px))` } : undefined}
          className={clsx(
            'z-10 flex w-[min(22rem,calc(100%-1rem))] flex-col overflow-hidden rounded-xl border border-stone-700/80 bg-stone-950/95 shadow-2xl backdrop-blur',
            moved ? 'fixed' : clsx('absolute', panelClass),
          )}
          role="region"
          aria-label={`What ${who} can do`}
        >
          <div className={clsx('flex items-center gap-2 border-b border-stone-800 px-3 py-2', !phone && 'cursor-grab touch-none select-none active:cursor-grabbing')} {...drag.handle(!phone)}>
            {!phone && <GripHorizontal size={15} className="shrink-0 text-stone-500" />}
            <span className="min-w-0 flex-1 truncate text-sm text-stone-300">
              <b className="text-stone-100">{subject.name}</b> {isTurn ? '· it’s their turn' : '· waiting (reactions only)'}
            </span>
            <button type="button" className="btn-icon-sm" aria-label="Fold the list away" title="Just the dots" onClick={() => setMode('bar')}>
              <ChevronDown size={16} />
            </button>
          </div>
          {/* One kind at a time (the map stays visible). */}
          <div className="flex gap-1 border-b border-stone-800 px-2 py-1.5" role="tablist">
            {(['action', 'bonus', 'reaction', 'free'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={tab === c}
                onClick={() => setTab(c)}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold',
                  tab === c ? 'bg-stone-800 text-stone-100' : 'text-stone-400 hover:text-stone-200',
                )}
              >
                {c !== 'free' && (
                  <span className={clsx('size-2 rounded-full', left(c) > 0 && !why(c) ? (c === 'reaction' ? 'bg-rose-400' : c === 'bonus' ? 'bg-sky-400' : 'bg-amber-400') : 'bg-stone-600')} />
                )}
                {c === 'bonus' ? 'Bonus' : c === 'free' ? 'Free' : COST_LABEL[c]}
              </button>
            ))}
          </div>
          {(state.cantAct || state.spellNote || state.stuck) && (
            <div className="space-y-0.5 border-b border-stone-800 px-3 py-1.5 text-xs text-amber-200">
              {state.cantAct && <p>{state.cantAct}: can’t take actions or reactions.</p>}
              {state.stuck && !state.cantAct && <p>{state.stuck}: speed 0.</p>}
              {state.spellNote && <p>{state.spellNote}</p>}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {column('action')}
            {column('bonus')}
            {column('reaction')}
            {column('free')}
          </div>
        </div>
      )}
      <div className={clsx('pointer-events-none absolute flex justify-center', barClass)}>
        <div
          className={clsx(
            'pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border bg-stone-950/92 py-1 pr-1 pl-2.5 shadow-lg backdrop-blur sm:gap-1.5 sm:rounded-full sm:pl-3',
            isTurn ? 'border-amber-500/70' : 'border-stone-600/70',
          )}
        >
          <span className={clsx('max-w-20 sm:max-w-28 truncate text-xs font-semibold', isTurn ? 'text-amber-200' : 'text-stone-300')} title={subject.name}>
            {isTurn ? `${who}’s turn` : who}
          </span>
          <Dot c="action" short="Action" />
          <Dot c="bonus" short="Bonus" />
          <Dot c="reaction" short="Reaction" />
          {showMove && (
            <span className="relative">
              <button
                type="button"
                onClick={() => setMoveOpen((o) => !o)}
                className={clsx(
                  'flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ring-1 tabular-nums',
                  state.speed !== null && state.moved > state.speed ? 'text-amber-300 ring-amber-500/60' : 'text-stone-200 ring-stone-700',
                )}
                title="Movement this turn (counted as the token moves on its turn)"
              >
                <Footprints size={12} /> {moveLabel}
              </button>
              {moveOpen && (
                <div className="absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded-lg border border-stone-700 bg-stone-950/95 p-2 text-xs text-stone-300 shadow-xl">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span>
                      Moved <b className="text-stone-100">{state.moved} ft</b>
                      {state.speed !== null && <> of {state.speed}</>}
                    </span>
                    <button type="button" className="btn-icon-sm" aria-label="Close" onClick={() => setMoveOpen(false)}>
                      <X size={13} />
                    </button>
                  </div>
                  {state.stuck && <p className="mb-1 text-amber-200">{state.stuck}: speed 0.</p>}
                  {(live.dx ?? 0) > 0 && <p className="mb-1 text-stone-400">Dashing ×{live.dx}: speed counted again.</p>}
                  <div className="flex items-center gap-1">
                    <button type="button" className="btn btn-secondary btn-sm min-h-7 flex-1 px-1" disabled={!canWrite || !state.moved} onClick={() => nudge(-(scene.grid.feet || 5))}>
                      <Minus size={12} /> {scene.grid.feet || 5}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm min-h-7 flex-1 px-1" disabled={!canWrite} onClick={() => nudge(scene.grid.feet || 5)}>
                      <Plus size={12} /> {scene.grid.feet || 5}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm min-h-7 px-2" disabled={!canWrite || !state.moved} onClick={() => patch({ mv: null })}>
                      Reset
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-stone-500">Moving the token on its turn counts by itself. These are for moves made off the map.</p>
                </div>
              )}
            </span>
          )}
          <button
            type="button"
            onClick={() => setMode(mode === 'open' ? 'bar' : 'open')}
            className={clsx('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', mode === 'open' ? 'bg-stone-800 text-stone-100' : 'bg-amber-500 text-stone-950')}
            aria-expanded={mode === 'open'}
          >
            {mode === 'open' ? <ChevronDown size={13} /> : <ChevronUp size={13} />} <span className="hidden sm:inline">{mode === 'open' ? 'Less' : 'What can I do?'}</span>
          <span className="sm:hidden">{mode === 'open' ? 'Less' : 'More'}</span>
          </button>
          <button type="button" className="btn-icon-sm size-7" aria-label="Make the turn helper small" title="Make it small (tap it to bring it back)" onClick={() => setMode('mini')}>
            <Minus size={14} />
          </button>
        </div>
      </div>
    </>
  );
}

function Row({ o, onRun, dim, empty, open, onInfo }: { o: TurnOption; onRun: () => void; dim?: boolean; empty?: boolean; open?: boolean; onInfo?: () => void }) {
  const attack = o.hit !== undefined;
  return (
    <div className={clsx('rounded-md ring-1 ring-transparent', open && 'bg-stone-900 ring-stone-800')}>
      <div className="flex items-start gap-1">
        <button type="button" onClick={onRun} className={clsx('min-w-0 flex-1 rounded-md px-1.5 py-1 text-left hover:bg-stone-900', (dim || empty) && 'opacity-45')} title={o.text}>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-100">
            {attack && <Dices size={12} className="shrink-0 text-amber-300" />}
            <span className="truncate">{o.name}</span>
            {o.recharge && <span className="shrink-0 text-[10px] font-normal text-stone-500">recharge {o.recharge}</span>}
          </span>
          {o.from && <span className="block truncate text-[10px] tracking-wide text-stone-500 uppercase">{o.from}</span>}
          {attack && (
            <span className="block text-[11px] text-stone-400">{`${o.hit! >= 0 ? '+' : ''}${o.hit} to hit${o.dmg?.length ? ` · ${o.dmg.map((d) => `${d.f} ${d.ty}`).join(' + ')}` : ''}`}</span>
          )}
        </button>
        {onInfo && (
          <button type="button" className="mt-1 shrink-0 rounded px-1 text-[11px] text-stone-500 hover:text-stone-200" aria-expanded={open} onClick={onInfo}>
            {open ? 'less' : 'what?'}
          </button>
        )}
      </div>
      {open && <p className="px-1.5 pb-1.5 text-xs leading-snug text-stone-300">{o.text}</p>}
    </div>
  );
}

function SpellChips({ spells, tone, onCast, dim, rule }: { spells: Spell[]; tone: (s: Spell) => string; onCast: (s: Spell) => void; dim?: boolean; rule: (s: Spell) => string | null }) {
  return (
    <div className={clsx('flex flex-wrap gap-1 px-1 pb-1', dim && 'opacity-45')}>
      {spells.map((s) => {
        // Ruled out by the spells-per-turn rule: greyed, with the reason (still castable: the DM decides).
        const no = rule(s);
        return (
        <button
          key={s.i}
          type="button"
          onClick={() => onCast(s)}
          className={clsx('flex items-center gap-1 rounded-full bg-stone-900 py-0.5 pr-2 pl-0.5 text-xs ring-1 ring-stone-700 hover:ring-stone-500', no ? 'text-stone-500 line-through opacity-60' : 'text-stone-200')}
          title={no ?? `Cast ${s.n}`}
        >
          <SpellGlyph sp={s} tone={tone(s)} size={20} />
          {s.n}
        </button>
        );
      })}
    </div>
  );
}
