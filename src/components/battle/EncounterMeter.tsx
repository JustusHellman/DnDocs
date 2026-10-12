import clsx from 'clsx';
import { levelOf, partyBudget, rate, xpForCr, type Difficulty } from '../../lib/battle/encounter';
import type { Entity, Token } from '../../types';

const LOOK: Record<Difficulty, { label: string; cls: string }> = {
  trivial: { label: 'Trivial', cls: 'text-stone-300 bg-stone-500/10 ring-stone-500/30' },
  low: { label: 'Low', cls: 'text-emerald-200 bg-emerald-500/10 ring-emerald-500/30' },
  moderate: { label: 'Moderate', cls: 'text-amber-200 bg-amber-500/10 ring-amber-500/30' },
  high: { label: 'High', cls: 'text-orange-200 bg-orange-500/15 ring-orange-500/40' },
  deadly: { label: 'Deadly', cls: 'text-rose-200 bg-rose-500/15 ring-rose-500/40' },
};

const crOf = (e: Entity) => e.dndStats?.challenge || e.attributes?.challengeRating;

/**
 * Encounter difficulty (2024 Dungeon Master's Guide): the monsters' XP against the party's budget.
 * The party is the characters on the map (or every player character, before anyone is placed).
 */
export default function EncounterMeter({ tokens, entityMap, adding, compact }: { tokens: Token[]; entityMap: Map<string, Entity>; adding?: { entity: Entity; count: number } | null; compact?: boolean }) {
  const ent = (t: Token) => (t.entityId ? entityMap.get(t.entityId) : undefined);
  let xp = 0;
  let unrated = 0;
  for (const t of tokens) {
    if (t.controlledBy.length || t.health === 'down') continue;
    const e = ent(t);
    const v = e ? xpForCr(crOf(e)) : null;
    if (v === null) unrated++;
    else xp += v;
  }
  if (adding && !['character'].includes(adding.entity.type)) {
    const v = xpForCr(crOf(adding.entity));
    if (v === null) unrated += adding.count;
    else xp += v * adding.count;
  }
  const onMap = tokens.map(ent).filter((e): e is Entity => !!e && e.type === 'character');
  const party = (onMap.length ? onMap : [...entityMap.values()].filter((e) => e.type === 'character'))
    .map((e) => levelOf(e.attributes?.classLevel))
    .filter((l): l is number => l !== null);
  if (!party.length) return compact ? null : <p className="hint">Give the player characters a level (Class &amp; Level) to see how hard the fight is.</p>;
  const budget = partyBudget(party);
  const d = rate(xp, budget);
  const levels = [...new Set(party)].length === 1 ? `${party.length} × level ${party[0]}` : `${party.length} characters`;
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs', compact ? 'px-1.5 py-1' : 'mt-3')}>
      <span className={clsx('chip font-semibold', LOOK[d].cls)}>{LOOK[d].label}</span>
      <span className="text-stone-400">
        {xp.toLocaleString()} XP · {levels}: low {budget.low.toLocaleString()}, moderate {budget.moderate.toLocaleString()}, high {budget.high.toLocaleString()}
        {unrated > 0 && ` · ${unrated} without a CR not counted`}
      </span>
    </div>
  );
}

