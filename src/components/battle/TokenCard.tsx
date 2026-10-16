import { useCodexStat } from '../../hooks/useCodexStat';
import { type CatalogMonster, findInCatalog, hasStats, loadCatalog, toDndStats } from '../../lib/codex/catalog';
import { codexTokenPicture } from '../../lib/codex/plates';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Eye, EyeOff, HeartCrack, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import clsx from 'clsx';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { updateCharacterHp } from '../../lib/entityService';
import { applyHp, deathSavesAfter, deathState, hpToAttributes, readDeathSaves, readHp, rollDeathSave, writeDeathSaves, type DeathSaves, type HpChange } from '../../lib/hitPoints';
import { arrayRemove, arrayUnion, deleteField } from 'firebase/firestore';
import { deleteToken, patchToken, restoreToken, setTokenHp, updateToken } from '../../lib/battle/sceneService';
import { CONDITIONS, EFFECTS, INK_COLORS, rollD20, TOKEN_COLORS, TOKEN_SIZES } from '../../lib/battle/table';
import { compressImage } from '../../lib/media';
import { StatBlock, modifier } from '../entity/StatBlock';
import RevealButton from '../entity/RevealButton';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import type { Entity, SceneCombat, Token, User } from '../../types';

interface Props {
  token: Token;
  sceneId: string;
  asDM: boolean;
  uid: string;
  /** The linked entry, when the viewer can see it. */
  entity: Entity | undefined;
  canEditEntity: boolean;
  secretHp: { cur: number; max: number } | undefined;
  players: User[];
  onClose: () => void;
  onOpenEntry: (e: Entity) => void;
  /** Register an undo step for a change made here. */
  onUndoable?: (label: string, run: () => Promise<unknown>, announce?: boolean) => void;
  /** For timed conditions. */
  combat?: SceneCombat;
  feetPerSquare?: number;
}

/** What a token field was before a change (missing fields get their neutral value, so undo is valid). */
const NEUTRAL: Record<string, unknown> = { elevation: 0, timers: {}, conditions: [], aura: null, img: null, initiative: null, vision: 0, hidden: false, controlledBy: [] };

/** The aura's own timer lives next to the conditions' timers under this key. */
export const AURA_TIMER = '@aura';

const DURATIONS = [
  { value: 0, label: 'Until removed' },
  { value: 1, label: '1 round' },
  { value: 10, label: '1 minute' },
  { value: 100, label: '10 minutes' },
];

const HEALTH_WORD: Record<string, string> = { healthy: 'Unhurt', bloodied: 'Bloodied', down: 'Down' };

export default function TokenCard({ token: t, sceneId, asDM, uid, entity, canEditEntity, secretHp, players, onClose, onOpenEntry, onUndoable, combat, feetPerSquare = 5 }: Props) {
  const toast = useToast();
  const { currentCampaign } = useAuth();
  const confirm = useConfirm();
  const [amount, setAmount] = useState('');
  const [name, setName] = useState(t.name);
  const [busy, setBusy] = useState(false);
  const picFile = useRef<HTMLInputElement>(null);
  const { canViewField } = useCampaignData();
  useEffect(() => setName(t.name), [t.id, t.name]);

  const controller = t.controlledBy.includes(uid);
  // Stats: for the DM, whoever controls the token (a beast master's wolf) and anyone who may see that
  // entry's stat block (e.g. a player's own character).
  const mayRead = asDM || controller;
  const own = entity && hasStats(entity.dndStats) && (mayRead || canViewField(entity, 'statBlock')) ? { stats: entity.dndStats!, text: entity.statBlock ?? '' } : null;
  // No stat block of its own: the SRD one of the codex creature it stands for.
  const codexRef = t.codexRef || (typeof entity?.attributes?.codexRef === 'string' ? entity.attributes.codexRef : null);
  const srd = useCodexStat(mayRead && !own && codexRef ? codexRef : null);
  const fromSrd = srd ? toDndStats(srd) : null;
  const shown = own ?? (fromSrd ? { stats: fromSrd.dndStats, text: fromSrd.statBlock } : null);
  const stats = shown?.stats ?? null;
  const editConditions = asDM || controller;
  const isCharacter = entity?.type === 'character';
  const n = parseInt(amount, 10);
  const valid = Number.isFinite(n) && n >= 0;

  const run = async (fn: () => Promise<unknown>, what: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setAmount('');
    } catch (err) {
      toast.error(err, what);
    } finally {
      setBusy(false);
    }
  };
  const [newCondition, setNewCondition] = useState('');
  const [duration, setDuration] = useState(0);
  const save = (data: Partial<Token>, what = 'Update token') => {
    if (busy) return;
    const prev = Object.fromEntries(Object.keys(data).map((k) => [k, (t as unknown as Record<string, unknown>)[k] ?? NEUTRAL[k] ?? null]));
    onUndoable?.(`${what} (${t.name})`, () => updateToken(sceneId, t.id, prev as Partial<Token>));
    return run(() => updateToken(sceneId, t.id, data), what);
  };
  /**
   * Changes to single conditions and timers (not the whole list), so a player and the DM editing
   * the same token at once don't overwrite each other. `undo` is the exact opposite change.
   */
  const patch = (data: Record<string, unknown>, undo: Record<string, unknown>, what: string) => {
    if (busy) return;
    onUndoable?.(`${what} (${t.name})`, () => patchToken(sceneId, t.id, undo));
    return run(() => patchToken(sceneId, t.id, data), what);
  };
  const timerKey = (name: string) => `timers.${name}`;
  const timerOr = (name: string) => t.timers?.[name] ?? deleteField();
  const addCondition = (name: string) => {
    // Characters Firestore can't use in a field name are left out.
    const c = name.replace(/[.~*/[\]`]/g, '').trim().slice(0, 40);
    if (!c || t.conditions.includes(c)) return;
    // A timed condition runs out at the start of this same turn, that many rounds later.
    const timer = duration && combat?.active ? { round: combat.round + duration, turn: combat.turn } : null;
    patch({ conditions: arrayUnion(c), [timerKey(c)]: timer ?? deleteField() }, { conditions: arrayRemove(c), [timerKey(c)]: deleteField() }, `Add ${c}`);
    setNewCondition('');
  };
  const removeCondition = (c: string) => {
    // An aura that came from the concentration spell ends with it.
    const endsAura = c === 'Concentrating' && !!t.aura?.conc;
    patch(
      { conditions: arrayRemove(c), [timerKey(c)]: deleteField(), ...(endsAura ? { aura: null, [timerKey(AURA_TIMER)]: deleteField() } : {}) },
      { conditions: arrayUnion(c), [timerKey(c)]: timerOr(c), ...(endsAura ? { aura: t.aura, [timerKey(AURA_TIMER)]: timerOr(AURA_TIMER) } : {}) },
      `Remove ${c}`,
    );
  };
  /** null: not chosen in this card (changing the radius then keeps a running timer). */
  const [auraDuration, setAuraDuration] = useState<number | null>(null);
  const setAura = (aura: Token['aura'], chosen = auraDuration) => {
    const timer = !aura ? null : chosen && combat?.active ? { round: combat.round + chosen, turn: combat.turn } : chosen === null ? t.timers?.[AURA_TIMER] ?? null : null;
    patch({ aura, [timerKey(AURA_TIMER)]: timer ?? deleteField() }, { aura: t.aura ?? null, [timerKey(AURA_TIMER)]: timerOr(AURA_TIMER) }, 'Aura');
  };
  const auraLeft = t.timers?.[AURA_TIMER] && combat?.active ? Math.max(0, t.timers[AURA_TIMER].round - combat.round) : null;

  // HP: a character's own HP (shared with its sheet), or the DM's private number for a monster.
  const charHp = isCharacter ? readHp(entity!.attributes, entity!.dndStats?.hitPoints) : null;
  const saves = isCharacter ? readDeathSaves(entity!.attributes) : null;
  const charAttrs = () => ({
    currentHp: String(entity!.attributes?.currentHp ?? ''),
    tempHp: String(entity!.attributes?.tempHp ?? ''),
    deathSaves: String(entity!.attributes?.deathSaves ?? ''),
  });
  type Undo = (() => Promise<unknown>) | null;
  const writeChar = (next: { currentHp: string; tempHp: string; deathSaves?: string }, label: string, alsoUndo: Undo = null) => {
    if (busy) return;
    const before = charAttrs();
    onUndoable?.(`${label} (${t.name})`, () => Promise.all([updateCharacterHp(entity!.id, before), alsoUndo?.()]));
    return run(() => updateCharacterHp(entity!.id, next), 'Update HP');
  };
  /** Token changes that go with an HP change, written now and put back by the same undo. */
  const tokenSide = (conditions: string[], extra: Record<string, unknown> = {}, undoExtra: Record<string, unknown> = {}): Undo => {
    if (conditions.join('|') === t.conditions.join('|') && !Object.keys(extra).length) return null;
    patchToken(sceneId, t.id, { conditions, ...extra }).catch((err) => toast.error(err, 'Update token'));
    const before = t.conditions;
    return () => patchToken(sceneId, t.id, { conditions: before, ...undoExtra });
  };
  /** Dropping to 0 HP ends concentration (and its aura); a character also falls unconscious. */
  const knockOut = (): Undo => {
    const concentrating = t.conditions.includes('Concentrating');
    const auraGoes = concentrating && !!t.aura?.conc;
    const conditions = t.conditions.filter((c) => c !== 'Concentrating');
    if (isCharacter && !conditions.includes('Unconscious')) conditions.push('Unconscious');
    if (concentrating) toast.show(`${t.name} drops to 0 HP and loses concentration.`);
    return tokenSide(
      conditions,
      concentrating ? { [timerKey('Concentrating')]: deleteField(), ...(auraGoes ? { aura: null, [timerKey(AURA_TIMER)]: deleteField() } : {}) } : {},
      concentrating ? { [timerKey('Concentrating')]: timerOr('Concentrating'), ...(auraGoes ? { aura: t.aura, [timerKey(AURA_TIMER)]: timerOr(AURA_TIMER) } : {}) } : {},
    );
  };
  const wakeUp = (): Undo => (t.conditions.includes('Unconscious') ? tokenSide(t.conditions.filter((c) => c !== 'Unconscious')) : null);
  const changeHp = (kind: HpChange) => {
    if (busy) return;
    const concentrationCheck = () => {
      // Concentration: any damage means a Constitution save, DC 10 or half the damage.
      if (kind === 'damage' && n > 0 && t.conditions.includes('Concentrating')) {
        toast.show(`${t.name} is concentrating: Constitution save DC ${Math.max(10, Math.floor(n / 2))} to keep the spell.`);
      }
    };
    const label = kind === 'damage' ? `${n} damage` : kind === 'heal' ? `${n} healing` : 'HP';
    if (charHp && saves) {
      const next = applyHp(charHp, kind, n);
      const wasUp = (charHp.current ?? 1) > 0;
      const nowUp = (next.current ?? 1) > 0;
      let side: Undo = null;
      if (wasUp && !nowUp) side = knockOut();
      else if (!wasUp && nowUp) side = wakeUp();
      else concentrationCheck();
      const { deathSaves, massive } = deathSavesAfter(charHp, next, kind, n, saves, currentCampaign?.houseRules?.massiveDamage !== false);
      if (massive) toast.show(`Massive damage: ${t.name} dies outright (massive damage rule; the DM can switch it off under Members).`);
      return writeChar({ ...hpToAttributes(next), deathSaves }, label, side);
    }
    if (!asDM) return;
    if (!secretHp) {
      toast.show(`Set ${t.name}'s maximum HP first: type it and press Max.`);
      return;
    }
    const cur = secretHp;
    const state = applyHp({ current: cur.cur, temp: 0, max: cur.max || null }, kind, n);
    const side = cur.cur > 0 && (state.current ?? 0) <= 0 ? knockOut() : (concentrationCheck(), null);
    onUndoable?.(`${label} (${t.name})`, () => Promise.all([setTokenHp(sceneId, t.campaignId, t.id, cur, null), side?.()]));
    return run(() => setTokenHp(sceneId, t.campaignId, t.id, { cur: state.current ?? 0, max: cur.max }, t.health), 'Update HP');
  };
  const setSaves = (d: DeathSaves, regain = false) =>
    regain
      ? writeChar({ currentHp: '1', tempHp: String(entity!.attributes?.tempHp ?? ''), deathSaves: '' }, 'Death save', wakeUp())
      : writeChar({ ...charAttrs(), deathSaves: writeDeathSaves(d) }, 'Death save');
  const rollSave = () => {
    if (!saves) return;
    const roll = rollD20();
    const r = rollDeathSave(saves, roll);
    toast.show(`${t.name} rolls ${roll} on a death save${r.regain ? ' — back on their feet with 1 HP!' : roll === 1 ? ' — two failures.' : roll >= 10 ? ' — a success.' : ' — a failure.'}`);
    setSaves(r.saves, r.regain);
  };
  const setMax = () => valid && run(() => setTokenHp(sceneId, t.campaignId, t.id, { cur: secretHp ? Math.min(secretHp.cur, n) : n, max: n }, t.health), 'Set max HP');
  const canHp = charHp ? canEditEntity : asDM;

  const remove = async () => {
    const ok = await confirm({ title: `Remove “${t.name}” from the map?`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      const copy = { ...t };
      const hp = secretHp;
      onUndoable?.(`${t.name} removed`, () => restoreToken(sceneId, copy, asDM ? hp : undefined), true);
      await deleteToken(sceneId, t.id, asDM);
      onClose();
    } catch (err) {
      toast.error(err, 'Remove token');
    }
  };

  const hpText = charHp
    ? `${charHp.current ?? '–'}${charHp.max ? ` / ${charHp.max}` : ''}${charHp.temp ? ` (+${charHp.temp})` : ''}`
    : asDM && secretHp
      ? `${secretHp.cur} / ${secretHp.max}`
      : t.health
        ? HEALTH_WORD[t.health]
        : null;

  return (
    <div className="scrollbar-thin max-h-[min(70vh,34rem)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-stone-700/80 bg-stone-950/95 p-3 text-sm shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="size-4 shrink-0 rounded-full ring-2 ring-stone-700" style={{ background: t.color }} />
        {asDM ? (
          <input
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 font-semibold text-stone-50 hover:border-stone-700 focus:border-amber-500/60 focus:outline-none"
            value={name}
            aria-label="Token name"
            onChange={(e) => setName(e.target.value.slice(0, 110))}
            onBlur={() => name.trim() && name !== t.name && save({ name: name.trim() }, 'Rename token')}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate font-semibold text-stone-50">{t.name}</span>
        )}
        {t.hidden && <EyeOff size={14} className="text-stone-500" aria-label="Hidden from players" />}
        <button type="button" className="btn-icon-sm" aria-label="Close" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      {stats && (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-300">
            {stats.armorClass && (
              <span>
                <span className="text-stone-500">AC</span> {stats.armorClass}
              </span>
            )}
            {stats.speed && (
              <span>
                <span className="text-stone-500">Speed</span> {stats.speed}
              </span>
            )}
            <span className="tabular-nums">
              {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
                <span key={a} className="mr-1.5">
                  <span className="text-stone-500 uppercase">{a}</span> {modifier(stats[a])}
                </span>
              ))}
            </span>
          </div>
          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold text-amber-400 select-none">Full stat block</summary>
            <div className="mt-2">
              <StatBlock stats={shown!.stats} text={shown!.text} />
              {!own && <p className="mt-1 text-[11px] text-stone-500 italic">SRD stat block from the Scavenger’s Codex.</p>}
            </div>
          </details>
        </div>
      )}

      {(hpText || canHp) && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="label mb-0">Hit points</span>
            {hpText && <span className={clsx('font-semibold tabular-nums', t.health === 'down' ? 'text-rose-400' : 'text-stone-100')}>{hpText}</span>}
          </div>
          {canHp && (
            <div className="mt-1.5 flex gap-1.5">
              <input
                className="input min-h-8 w-14 py-1 text-center tabular-nums"
                inputMode="numeric"
                placeholder="0"
                aria-label="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                onKeyDown={(e) => e.key === 'Enter' && valid && changeHp('damage')}
              />
              <button type="button" className="btn btn-secondary btn-sm flex-1 px-1" disabled={!valid || busy} onClick={() => changeHp('damage')}>
                <HeartCrack size={13} /> Dmg
              </button>
              <button type="button" className="btn btn-secondary btn-sm flex-1 px-1" disabled={!valid || busy} onClick={() => changeHp('heal')}>
                <Plus size={13} /> Heal
              </button>
              {!charHp && (
                <button type="button" className="btn btn-ghost btn-sm px-1.5" disabled={!valid || busy} onClick={setMax} title="Set maximum HP">
                  Max
                </button>
              )}
            </div>
          )}
          {!charHp && asDM && <p className="hint">Exact numbers are only on your screen; players see “unhurt”, “bloodied” or “down”.</p>}
        </div>
      )}

      {charHp && saves && charHp.current === 0 && (
        <div className="mt-3 rounded-lg border border-rose-900/50 bg-rose-950/20 p-2.5">
          <div className="flex items-center justify-between">
            <span className="label mb-0">Death saves</span>
            <span className={clsx('text-xs font-semibold', deathState(saves) === 'dead' ? 'text-rose-400' : deathState(saves) === 'stable' ? 'text-emerald-400' : 'text-stone-300')}>
              {deathState(saves) === 'dead' ? 'Dead' : deathState(saves) === 'stable' ? 'Stable' : 'Dying'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            {(['successes', 'failures'] as const).map((k) => (
              <div key={k} className="flex items-center gap-1">
                <span className="w-14 text-stone-400">{k === 'successes' ? 'Successes' : 'Failures'}</span>
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={!canEditEntity || busy}
                    aria-label={`${k} ${i + 1}`}
                    onClick={() => setSaves({ ...saves, [k]: saves[k] > i ? i : i + 1 })}
                    className={clsx('size-4 rounded-full ring-2', saves[k] > i ? (k === 'successes' ? 'bg-emerald-500 ring-emerald-400' : 'bg-rose-600 ring-rose-500') : 'ring-stone-600')}
                  />
                ))}
              </div>
            ))}
          </div>
          {canEditEntity && deathState(saves) === 'dying' && (
            <button type="button" className="btn btn-secondary btn-sm mt-2 w-full" onClick={rollSave} disabled={busy}>
              Roll death save
            </button>
          )}
        </div>
      )}

      <div className="mt-3">
        <span className="label">Conditions &amp; effects</span>
        <div className="flex flex-wrap gap-1">
          {t.conditions.map((c) => {
            const timer = t.timers?.[c];
            const left = timer && combat?.active ? Math.max(0, timer.round - combat.round) : null;
            return (
              <span key={c} className="chip gap-1 text-violet-200 bg-violet-500/10 ring-violet-500/30" title={timer ? `Ends at the start of round ${timer.round}` : 'Until removed'}>
                {c}
                {left !== null && <span className="text-violet-300/70">· {left === 0 ? 'ends this round' : `${left} rd`}</span>}
                {editConditions && (
                  <button type="button" aria-label={`Remove ${c}`} onClick={() => removeCondition(c)}>
                    <X size={11} />
                  </button>
                )}
              </span>
            );
          })}
          {t.conditions.length === 0 && !editConditions && <span className="text-xs text-stone-500">None</span>}
        </div>
        {editConditions && (
          <form
            className="mt-1.5 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              addCondition(newCondition);
            }}
          >
            <input
              className="input min-h-8 min-w-0 flex-1 py-1 text-xs"
              list={`cond-${t.id}`}
              placeholder="Prone, Blessed, Hex…"
              aria-label="Condition or effect"
              value={newCondition}
              onChange={(e) => setNewCondition(e.target.value)}
            />
            <datalist id={`cond-${t.id}`}>
              {[...CONDITIONS, ...EFFECTS]
                .filter((c) => !t.conditions.includes(c))
                .map((c) => (
                  <option key={c} value={c} />
                ))}
            </datalist>
            {combat?.active && (
              <select className="input min-h-8 w-auto py-1 text-xs" value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Duration">
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" className="btn btn-secondary btn-sm px-2" disabled={!newCondition.trim() || busy} aria-label="Add">
              <Plus size={13} />
            </button>
          </form>
        )}
      </div>

      {editConditions && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="label mb-0 w-16">Aura</span>
            <select
              className="input min-h-8 w-auto py-1 text-xs"
              aria-label="Aura radius"
              value={t.aura?.radius ?? 0}
              onChange={(e) => {
                const radius = Number(e.target.value);
                const conc = t.aura ? !!t.aura.conc : t.conditions.includes('Concentrating');
                setAura(radius ? { radius, color: t.aura?.color ?? INK_COLORS[1], ...(conc ? { conc: true } : {}) } : null);
              }}
            >
              <option value={0}>None</option>
              {[5, 10, 15, 20, 30, 60].map((r) => (
                <option key={r} value={r}>
                  {r} ft
                </option>
              ))}
            </select>
            {t.aura &&
              [INK_COLORS[1], INK_COLORS[3], INK_COLORS[2], INK_COLORS[4]].map((c) => (
                <button key={c} type="button" aria-label={`Aura colour ${c}`} onClick={() => save({ aura: { ...t.aura!, color: c } }, 'Aura colour')} className={clsx('size-5 rounded-full ring-2', t.aura?.color === c ? 'ring-amber-400' : 'ring-stone-700')} style={{ background: c }} />
              ))}
          </div>
          {t.aura && (
            <div className="-mt-1 flex flex-wrap items-center gap-2 pl-[4.5rem] text-xs text-stone-400">
              {combat?.active && (
                <select
                  className="input min-h-7 w-auto py-0.5 text-xs"
                  aria-label="Aura duration"
                  value={auraDuration ?? 0}
                  onChange={(e) => {
                    const d = Number(e.target.value);
                    setAuraDuration(d);
                    setAura(t.aura!, d);
                  }}
                >
                  {DURATIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              )}
              {auraLeft !== null && <span>{auraLeft === 0 ? 'ends this round' : `${auraLeft} rd left`}</span>}
              {t.aura.conc && <span>ends with concentration</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="label mb-0 w-16">Height</span>
            <button type="button" className="btn btn-ghost btn-sm px-2" aria-label={`${feetPerSquare} ft lower`} onClick={() => save({ elevation: (t.elevation ?? 0) - feetPerSquare }, 'Height')}>
              −
            </button>
            <span className="w-14 text-center text-xs tabular-nums text-stone-200">{t.elevation ? `${t.elevation > 0 ? '↑' : '↓'} ${Math.abs(t.elevation)} ft` : 'Ground'}</span>
            <button type="button" className="btn btn-ghost btn-sm px-2" aria-label={`${feetPerSquare} ft higher`} onClick={() => save({ elevation: (t.elevation ?? 0) + feetPerSquare }, 'Height')}>
              +
            </button>
          </div>
        </div>
      )}

      {asDM && (
        <div className="mt-3 space-y-3 border-t border-stone-800 pt-3">
          <div className="flex items-center gap-2">
            <span className="label mb-0 w-16">Picture</span>
            {t.img ? <img src={t.img} alt="" className="size-8 rounded-full object-cover ring-2 ring-stone-700" /> : <span className="size-8 rounded-full ring-2 ring-stone-700" style={{ background: t.color }} />}
            <button type="button" className="btn btn-ghost btn-sm px-2" onClick={() => picFile.current?.click()}>
              <ImagePlus size={13} /> {t.img ? 'Change' : 'Upload'}
            </button>
            {codexRef && (
              <button
                type="button"
                className="btn btn-ghost btn-sm px-2"
                title="The Codex's picture for this kind of creature"
                onClick={async () => {
                  const cat = await loadCatalog().catch(() => null);
                  const m = cat ? (findInCatalog(cat, 'monster', codexRef) as CatalogMonster | undefined) : undefined;
                  const img = m ? await codexTokenPicture(m) : null;
                  if (img) save({ img }, 'Token picture');
                  else toast.show('The Codex picture isn’t available right now.');
                }}
              >
                Codex
              </button>
            )}
            {entity?.coverThumb && entity.coverThumb !== t.img && (
              <button type="button" className="btn btn-ghost btn-sm px-2" onClick={() => save({ img: entity.coverThumb }, 'Token picture')}>
                Entry’s
              </button>
            )}
            {t.img && (
              <button type="button" className="btn-icon-sm" aria-label="Remove picture" onClick={() => save({ img: null }, 'Token picture')}>
                <X size={13} />
              </button>
            )}
            <input
              ref={picFile}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const img = await compressImage(f, 240, 0.7, 40_000);
                  await save({ img }, 'Token picture');
                } catch (err) {
                  toast.error(err, 'Token picture');
                }
              }}
            />
          </div>
          {entity && entity.type !== 'character' && (
            <div className="flex items-center gap-2">
              <span className="label mb-0 w-16">Entry</span>
              <RevealButton entity={entity} compact />
              <span className="text-xs text-stone-500">Share what the party learns about {entity.name}.</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="label mb-0 w-16">Size</span>
            <select className="input min-h-8 flex-1 py-1 text-sm" value={t.size} onChange={(e) => save({ size: Number(e.target.value) })} aria-label="Size">
              {TOKEN_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="label mb-0 w-16">Colour</span>
            <div className="flex flex-wrap gap-1">
              {TOKEN_COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => save({ color: c })} className={clsx('size-5 rounded-full ring-2', t.color === c ? 'ring-amber-400' : 'ring-stone-700')} style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="label mb-0 w-16">Sight</span>
            <input
              className="input min-h-8 w-16 py-1 text-center"
              inputMode="numeric"
              defaultValue={t.vision || ''}
              key={`${t.id}-v${t.vision}`}
              placeholder="∞"
              aria-label="Vision range in squares"
              onBlur={(e) => {
                const v = Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0));
                if (v !== t.vision) save({ vision: v });
              }}
            />
            <span className="text-xs text-stone-500">squares (empty = unlimited)</span>
          </div>
          <div>
            <span className="label">Moved by</span>
            <div className="flex flex-wrap gap-1">
              {players.length === 0 && <span className="text-xs text-stone-500">No players yet.</span>}
              {players.map((p) => {
                const on = t.controlledBy.includes(p.uid);
                return (
                  <button
                    key={p.uid}
                    type="button"
                    aria-pressed={on}
                    onClick={() => save({ controlledBy: on ? t.controlledBy.filter((x) => x !== p.uid) : [...t.controlledBy, p.uid] })}
                    className={clsx('rounded-full border px-2 py-0.5 text-xs', on ? 'border-sky-500/60 bg-sky-500/10 text-sky-200' : 'border-stone-800 text-stone-400')}
                  >
                    {p.displayName}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm -ml-2" onClick={() => save({ hidden: !t.hidden }, t.hidden ? 'Reveal token' : 'Hide token')}>
            {t.hidden ? <Eye size={14} /> : <EyeOff size={14} />} {t.hidden ? 'Show to players' : 'Hide from players'}
          </button>
        </div>
      )}

      <div className="mt-3 flex gap-1.5 border-t border-stone-800 pt-3">
        {entity && (
          <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => onOpenEntry(entity)}>
            <BookOpen size={13} /> Open entry
          </button>
        )}
        {(asDM || controller) && (
          <button type="button" className="btn btn-ghost btn-sm text-rose-300" onClick={remove}>
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
