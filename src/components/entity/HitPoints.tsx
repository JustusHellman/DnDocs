import { useState } from 'react';
import { Heart, HeartCrack, Plus, RotateCcw, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import clsx from 'clsx';
import { useToast } from '../../contexts/ToastContext';
import { updateCharacterHp } from '../../lib/entityService';
import { applyHp, deathSavesAfter, deathState, hpToAttributes, readDeathSaves, readHp, rollDeathSave, writeDeathSaves, type HpChange } from '../../lib/hitPoints';
import { rollD20 } from '../../lib/battle/table';
import type { Entity } from '../../types';

interface Props {
  entity: Entity;
  /** Maximum HP text from the stat block, when the viewer may see it. */
  maxText: unknown;
  editable: boolean;
}

/** Current / max / temporary HP with quick damage and healing for the DM and the character's player. */
export function HitPoints({ entity, maxText, editable }: Props) {
  const toast = useToast();
  const { currentCampaign } = useAuth();
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const hp = readHp(entity.attributes, maxText);

  const change = async (kind: HpChange, value: number) => {
    if (saving) return;
    setSaving(true);
    try {
      const next = applyHp(hp, kind, value);
      const saves = readDeathSaves(entity.attributes);
      // Same rules as on the battle map (hit at 0 HP, massive damage, back above 0).
      const { deathSaves, massive } = deathSavesAfter(hp, next, kind, value, saves, currentCampaign?.houseRules?.massiveDamage !== false);
      if (massive) toast.show(`Massive damage: ${entity.name} dies outright (massive damage rule; the DM can switch it off under Members).`);
      if (kind === 'damage' && value > 0 && /concentrat/i.test(String(entity.attributes?.conditions ?? ''))) {
        toast.show(`Concentrating: Constitution save DC ${Math.max(10, Math.floor(value / 2))} to keep the spell.`);
      }
      await updateCharacterHp(entity.id, { ...hpToAttributes(next), deathSaves });
      setAmount('');
    } catch (err) {
      toast.error(err, 'Update HP');
    } finally {
      setSaving(false);
    }
  };
  const n = parseInt(amount, 10);
  const valid = Number.isFinite(n) && n >= 0;

  const pct = hp.max && hp.current !== null ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : null;
  const tempPct = hp.max ? Math.min(100, (hp.temp / hp.max) * 100) : 0;
  const down = hp.current === 0;
  const tone = pct === null ? 'bg-stone-500' : pct > 50 ? 'bg-emerald-600' : pct > 25 ? 'bg-amber-500' : 'bg-rose-600';

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="section-title">Hit points</h2>
        {down && (
          <span className="chip text-rose-200 bg-rose-500/10 ring-rose-500/30">
            <HeartCrack size={11} /> Down
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <Heart size={18} className="shrink-0 self-center text-rose-500" aria-hidden />
        <span className="font-display text-3xl font-semibold tabular-nums text-stone-50">{hp.current ?? '–'}</span>
        {hp.max !== null && <span className="text-lg tabular-nums text-stone-400">/ {hp.max}</span>}
        {hp.temp > 0 && (
          <span className="chip ml-1 text-sky-200 bg-sky-500/10 ring-sky-500/30" title="Temporary hit points">
            <Shield size={11} /> +{hp.temp} temp
          </span>
        )}
      </div>

      {pct !== null && (
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-stone-800" role="meter" aria-valuemin={0} aria-valuemax={hp.max ?? 0} aria-valuenow={hp.current ?? 0} aria-label="Hit points">
          <span className={clsx('block h-full transition-[width]', tone)} style={{ width: `${pct}%` }} />
          {tempPct > 0 && <span className="block h-full bg-sky-500/80" style={{ width: `${Math.min(tempPct, 100 - pct)}%` }} />}
        </div>
      )}
      {hp.max === null && editable && <p className="hint">Add hit points to the stat block to set the maximum.</p>}

      {editable && (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) change('damage', n);
          }}
        >
          <div className="flex gap-2">
            <input
              className="input w-20 text-center tabular-nums"
              inputMode="numeric"
              placeholder="0"
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            />
            <button type="submit" className="btn btn-secondary btn-sm flex-1" disabled={!valid || saving}>
              <HeartCrack size={14} /> Damage
            </button>
            <button type="button" className="btn btn-secondary btn-sm flex-1" disabled={!valid || saving} onClick={() => change('heal', n)}>
              <Plus size={14} /> Heal
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm flex-1" disabled={!valid || saving} onClick={() => change('temp', n)}>
              <Shield size={13} /> Temp HP
            </button>
            <button type="button" className="btn btn-ghost btn-sm flex-1" disabled={!valid || saving} onClick={() => change('set', n)}>
              Set to
            </button>
            {hp.max !== null && (
              <button type="button" className="btn btn-ghost btn-sm flex-1" disabled={saving || (hp.current === hp.max && hp.temp === 0)} onClick={() => change('full', 0)} title="Long rest: full HP, temporary HP removed">
                <RotateCcw size={13} /> Full
              </button>
            )}
          </div>
        </form>
      )}
      {hp.current === 0 && (
        <DeathSavesRow entity={entity} editable={editable} />
      )}
    </section>
  );
}

function DeathSavesRow({ entity, editable }: { entity: Entity; editable: boolean }) {
  const toast = useToast();
  const saves = readDeathSaves(entity.attributes);
  const state = deathState(saves);
  const write = (deathSaves: string, currentHp?: string) =>
    updateCharacterHp(entity.id, { currentHp: currentHp ?? String(entity.attributes?.currentHp ?? '0'), tempHp: String(entity.attributes?.tempHp ?? ''), deathSaves }).catch((err) => toast.error(err, 'Death save'));
  const roll = () => {
    const r = rollD20();
    const out = rollDeathSave(saves, r);
    toast.show(`Death save: ${r}${out.regain ? ' — back with 1 HP!' : r === 1 ? ' — two failures.' : r >= 10 ? ' — success.' : ' — failure.'}`);
    write(out.regain ? '' : writeDeathSaves(out.saves), out.regain ? '1' : undefined);
  };
  return (
    <div className="mt-4 rounded-lg border border-rose-900/50 bg-rose-950/20 p-3">
      <div className="flex items-center justify-between">
        <span className="label mb-0">Death saves</span>
        <span className={clsx('text-xs font-semibold', state === 'dead' ? 'text-rose-400' : state === 'stable' ? 'text-emerald-400' : 'text-stone-300')}>{state === 'dead' ? 'Dead' : state === 'stable' ? 'Stable' : 'Dying'}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
        {(['successes', 'failures'] as const).map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="text-stone-400">{k === 'successes' ? 'Successes' : 'Failures'}</span>
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                disabled={!editable}
                aria-label={`${k} ${i + 1}`}
                onClick={() => write(writeDeathSaves({ ...saves, [k]: saves[k] > i ? i : i + 1 }))}
                className={clsx('size-4 rounded-full ring-2', saves[k] > i ? (k === 'successes' ? 'bg-emerald-500 ring-emerald-400' : 'bg-rose-600 ring-rose-500') : 'ring-stone-600')}
              />
            ))}
          </div>
        ))}
        {editable && state === 'dying' && (
          <button type="button" className="btn btn-secondary btn-sm ml-auto" onClick={roll}>
            Roll death save
          </button>
        )}
      </div>
    </div>
  );
}
