import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { CLASS_IDS, className as classLabel, derive, ordinal, type Ability, type ClassLevel, type Counter, type PlayDef, type Recharge } from '../../lib/play/model';
import type { PlayerApi } from '../../lib/play/usePlayer';
import { useSpellIndex } from '../../lib/play/ui';

const ABILITIES: Ability[] = ['int', 'wis', 'cha', 'str', 'dex', 'con'];
const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Math.min(99, parseInt(v, 10) || 0)));

/**
 * Everything the tracker works out can be changed here: classes, slots, resources (or hide them),
 * hit dice, and counters of your own (a feat, a subclass feature, an item) that can be tied to a
 * spell so their uses cast it without a slot.
 */
export default function TrackerSettings({ p, onClose }: { p: PlayerApi; onClose: () => void }) {
  const [def, setDef] = useState<PlayDef>(() => JSON.parse(JSON.stringify(p.def)) as PlayDef);
  const [busy, setBusy] = useState(false);
  const spells = useSpellIndex(p.edition);
  // What the tables say without any of the overrides below (shown as placeholders).
  const base = useMemo(() => derive({ classLevel: p.entity.attributes?.classLevel, stats: p.entity.dndStats ?? undefined, def: { classes: def.classes }, edition: p.edition }), [def.classes, p]);
  const classes: ClassLevel[] = def.classes ?? [];
  const set = (patch: Partial<PlayDef>) => setDef((d) => ({ ...d, ...patch }));
  const save = async () => {
    setBusy(true);
    try {
      const clean: PlayDef = { ...def };
      if (!clean.classes?.length) delete clean.classes;
      if (clean.slots && !Object.keys(clean.slots).length) delete clean.slots;
      if (clean.res && !Object.keys(clean.res).length) delete clean.res;
      if (!clean.counters?.length) delete clean.counters;
      if (clean.hd && !clean.hd.die && !clean.hd.max) delete clean.hd;
      await p.saveDef(JSON.parse(JSON.stringify(clean)) as PlayDef);
      onClose();
    } catch {
      /* the toast says what went wrong */
    } finally {
      setBusy(false);
    }
  };
  const counters = def.counters ?? [];
  const setCounter = (i: number, patch: Partial<Counter>) => set({ counters: counters.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Set up · ${p.entity.name}`}
      description="Leave anything empty to use what the class tables say. Your changes win."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <div className="label">Classes</div>
          {!classes.length && (
            <p className="mb-2 text-sm text-stone-400">
              From “Class &amp; Level”: <b className="text-stone-200">{base.classes.map((c) => `${classLabel(c.cls)} ${c.lvl}`).join(' / ') || 'nothing found'}</b>. Add classes here to set them yourself.
            </p>
          )}
          <div className="space-y-1.5">
            {classes.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <select className="input max-w-48" value={c.cls} onChange={(e) => set({ classes: classes.map((x, j) => (j === i ? { ...x, cls: e.target.value } : x)) })} aria-label="Class">
                  {CLASS_IDS.map((id) => (
                    <option key={id} value={id}>
                      {classLabel(id)}
                    </option>
                  ))}
                </select>
                <input className="input w-20" type="number" min={1} max={20} value={c.lvl} onChange={(e) => set({ classes: classes.map((x, j) => (j === i ? { ...x, lvl: Math.max(1, Math.min(20, Number(e.target.value) || 1)) } : x)) })} aria-label="Level" />
                <button type="button" className="btn-icon-sm" aria-label="Remove class" onClick={() => set({ classes: classes.filter((_, j) => j !== i) })}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ classes: [...(classes.length ? classes : base.classes), ...(classes.length || !base.classes.length ? [{ cls: 'fighter', lvl: 1 }] : [])] })}>
              <Plus size={13} /> {classes.length || !base.classes.length ? 'Add a class' : 'Set classes myself'}
            </button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Spellcasting ability</span>
            <select className="input" value={def.ability ?? ''} onChange={(e) => set({ ability: (e.target.value || undefined) as Ability | undefined })}>
              <option value="">{base.ability ? `From the class (${base.ability.toUpperCase()})` : 'None'}</option>
              {ABILITIES.map((a) => (
                <option key={a} value={a}>
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="label">Hit dice</span>
            <div className="flex items-center gap-2">
              <input className="input w-20" inputMode="numeric" placeholder={String(base.hitDiceMax || 1)} value={def.hd?.max ?? ''} onChange={(e) => set({ hd: { ...def.hd, max: num(e.target.value) } })} aria-label="How many hit dice" />
              <span className="text-stone-500">d</span>
              <input className="input w-20" inputMode="numeric" placeholder={String(base.hitDice[0]?.die ?? 8)} value={def.hd?.die ?? ''} onChange={(e) => set({ hd: { ...def.hd, die: num(e.target.value) } })} aria-label="Hit die size" />
            </div>
          </div>
        </section>

        <section>
          <div className="label">Spell slots</div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">
            {Array.from({ length: 9 }, (_, i) => (
              <label key={i} className="text-center text-[11px] text-stone-500">
                {ordinal(i + 1)}
                <input
                  className="input mt-0.5 px-1 text-center"
                  inputMode="numeric"
                  placeholder={String(base.slots[i] ?? 0)}
                  value={def.slots?.[String(i + 1)] ?? ''}
                  onChange={(e) => {
                    const slots = { ...(def.slots ?? {}) };
                    const v = num(e.target.value);
                    if (v === undefined) delete slots[String(i + 1)];
                    else slots[String(i + 1)] = Math.min(9, v);
                    set({ slots });
                  }}
                />
              </label>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-stone-300">
            Pact slots
            <input
              className="input w-16 text-center"
              inputMode="numeric"
              placeholder={String(base.pact?.n ?? 0)}
              value={def.pact === undefined ? '' : def.pact?.n ?? 0}
              onChange={(e) => {
                const n = num(e.target.value);
                set({ pact: n === undefined ? undefined : { n, l: def.pact?.l ?? base.pact?.l ?? 1 } });
              }}
              aria-label="Pact slots"
            />
            of level
            <input
              className="input w-16 text-center"
              inputMode="numeric"
              placeholder={String(base.pact?.l ?? 1)}
              value={def.pact?.l ?? ''}
              onChange={(e) => set({ pact: { n: def.pact?.n ?? base.pact?.n ?? 1, l: Math.max(1, Math.min(9, num(e.target.value) ?? 1)) } })}
              aria-label="Pact slot level"
            />
          </div>
        </section>

        {base.resources.filter((r) => !r.custom).length > 0 && (
          <section>
            <div className="label">Class resources</div>
            <div className="space-y-1.5">
              {base.resources
                .filter((r) => !r.custom)
                .concat(Object.keys(def.res ?? {}).filter((k) => def.res?.[k]?.off && !base.resources.some((r) => r.key === k)).map((k) => ({ key: k, name: k, max: 0, rest: 'long' as Recharge })))
                .map((r) => {
                  const o = def.res?.[r.key] ?? {};
                  const put = (patch: { max?: number; off?: boolean }) => {
                    const next = { ...o, ...patch };
                    const res = { ...(def.res ?? {}) };
                    if (next.max === undefined && !next.off) delete res[r.key];
                    else res[r.key] = JSON.parse(JSON.stringify(next));
                    set({ res });
                  };
                  return (
                    <div key={r.key} className="flex items-center gap-2 text-sm">
                      <span className={o.off ? 'flex-1 text-stone-500 line-through' : 'flex-1 text-stone-200'}>{r.name}</span>
                      <input className="input w-20 text-center" inputMode="numeric" placeholder={String(r.max)} value={o.max ?? ''} onChange={(e) => put({ max: num(e.target.value) })} aria-label={`${r.name} maximum`} />
                      <label className="flex items-center gap-1 text-xs text-stone-400">
                        <input type="checkbox" className="accent-amber-500" checked={!!o.off} onChange={(e) => put({ off: e.target.checked || undefined })} /> hide
                      </label>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        <section>
          <div className="label">Your own counters</div>
          <p className="hint mb-2 not-italic">
            For anything the class tables don’t cover: subclass features, feats, magic items. Uses can be a number or follow your proficiency bonus or an ability modifier (so they grow with the character). Tie a counter to a spell and its uses cast that spell without a slot.
          </p>
          <div className="space-y-2">
            {counters.map((c, i) => {
              const always = !!(c.spell && def.spells?.always?.includes(c.spell));
              const setAlways = (on: boolean) => {
                if (!c.spell) return;
                const list = (def.spells?.always ?? []).filter((x) => x !== c.spell);
                set({ spells: { ...def.spells, always: on ? [...list, c.spell] : list } });
              };
              return (
                <div key={c.id} className="surface space-y-2 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="input min-w-40 flex-1" value={c.name} placeholder="Name (e.g. Misty Step from Fey Touched)" onChange={(e) => setCounter(i, { name: e.target.value.slice(0, 40) })} aria-label="Counter name" />
                    <button type="button" className="btn-icon-sm" aria-label="Remove counter" onClick={() => set({ counters: counters.filter((_, j) => j !== i) })}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-stone-300">
                    Uses
                    <select className="input w-auto py-1 text-sm" value={c.per ?? ''} onChange={(e) => setCounter(i, { per: (e.target.value || undefined) as Counter['per'] })} aria-label="How many uses">
                      <option value="">a number</option>
                      <option value="pb">= proficiency bonus ({base.pb})</option>
                      {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
                        <option key={a} value={a}>
                          = {a.toUpperCase()} modifier ({Math.max(1, base.mods[a])})
                        </option>
                      ))}
                    </select>
                    {!c.per && <input className="input w-16 py-1 text-center" inputMode="numeric" value={c.max} onChange={(e) => setCounter(i, { max: num(e.target.value) ?? 0 })} aria-label="Uses" />}
                    back on a
                    <select className="input w-auto py-1 text-sm" value={c.rest} onChange={(e) => setCounter(i, { rest: e.target.value as Recharge })} aria-label="Comes back on">
                      <option value="short">short rest</option>
                      <option value="long">long rest</option>
                      <option value="none">never (refill by hand)</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                    Casts the spell
                    <select className="input max-w-64 py-1 text-sm" value={c.spell ?? ''} onChange={(e) => setCounter(i, { spell: e.target.value || undefined })}>
                      <option value="">(no spell)</option>
                      {spells.all
                        .filter((s) => s.l > 0)
                        .map((s) => (
                          <option key={s.i} value={s.i}>
                            {s.n} ({ordinal(s.l)})
                          </option>
                        ))}
                    </select>
                    {c.spell && (
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" className="accent-amber-500" checked={always} onChange={(e) => setAlways(e.target.checked)} /> and it’s always prepared
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ counters: [...counters, { id: Date.now().toString(36), name: '', max: 1, rest: 'long' }] })}>
              <Plus size={13} /> Add a counter
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
