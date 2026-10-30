import { useState } from 'react';
import { Crosshair, Wand2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import SpellCard from './SpellCard';
import RollField, { type RollOutcome } from './RollField';
import { tableChat } from '../../lib/chat/bus';
import { ordinal } from '../../lib/play/model';
import { abilityName, castSummary, dmgAt, fromSelf, healAt, type Spell } from '../../lib/play/spells';
import { canPlaceArea, pickedToken, placeCastArea } from '../../lib/play/ui';
import { spellTone, useColoring } from '../../lib/play/coloring';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The DM casts a spell for a creature (or reads it up): no slots to track, the save DC and attack
 * bonus from its stat block are typed in, rolls as always (here, typed, or not at all), the area
 * can be placed from the token picked on the map, and the table can be told — or not.
 */
export default function CreatureCastDialog({ sp, edition, onClose }: { sp: Spell; edition: string; onClose: () => void }) {
  const picked = pickedToken();
  const [who, setWho] = useState(picked?.name ?? '');
  const [dc, setDc] = useState('13');
  const [atk, setAtk] = useState('5');
  const [slot, setSlot] = useState(Math.max(1, sp.l));
  const [tell, setTell] = useState(true);
  const [rolls, setRolls] = useState<Record<string, RollOutcome | null>>({});
  const tone = spellTone(sp, useColoring());
  const lvl = Math.max(sp.l, slot);
  const dmg = dmgAt(sp, sp.l === 0 ? 1 : lvl, 5);
  const heal = healAt(sp, lvl)?.replace(/\s*\+\s*MOD/i, '');
  const name = who.trim() || 'A creature';
  const setRoll = (label: string) => (v: RollOutcome | null) => {
    setRolls((r) => ({ ...r, [label]: v }));
    if (v?.roll) tableChat.roll(v.roll);
  };
  const finish = async (place: boolean) => {
    if (tell) {
      const extra = sp.sv ? ` · DC ${dc}` : sp.at ? ` · ${signed(Number(atk) || 0)} to hit` : '';
      await tableChat.event({ t: 'cast', who: name, spell: sp.n, id: sp.i, lvl: sp.l, slot: sp.l === 0 ? 0 : lvl, via: 'creature', sum: castSummary(sp, sp.l === 0 ? 0 : lvl) + extra, ...(sp.k ? { conc: 1 as const } : {}) });
      const typed = Object.entries(rolls).filter(([, v]) => v && !v.roll) as [string, RollOutcome][];
      if (typed.length) await tableChat.event({ t: 'castres', who: name, spell: sp.n, parts: typed.map(([l, v]) => ({ l, v: v.total })) });
    }
    if (place && sp.a) placeCastArea({ spell: sp.n, area: sp.a, fromSelected: fromSelf(sp), color: '#8b2a1c' });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Wand2 size={18} style={{ color: tone }} /> {sp.n} for a creature
        </span>
      }
      description="No slots to keep track of: type the numbers from the creature's stat block."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {sp.a && canPlaceArea() && (
            <button type="button" className="btn btn-secondary" onClick={() => finish(true)} title={fromSelf(sp) ? 'From the token picked on the map' : undefined}>
              Place it on the map
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => finish(false)}>
            Done
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SpellCard sp={sp} charLevel={5} edition={edition} />
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="label">Cast by</span>
            <input className="input" value={who} onChange={(e) => setWho(e.target.value.slice(0, 40))} placeholder="e.g. Goblin shaman" />
          </label>
          <div className="flex flex-wrap gap-3">
            {sp.sv && (
              <label className="block text-sm">
                <span className="label">Save DC</span>
                <input className="input w-20 text-center" inputMode="numeric" value={dc} onChange={(e) => setDc(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </label>
            )}
            {sp.at && (
              <label className="block text-sm">
                <span className="label">Spell attack</span>
                <input className="input w-20 text-center" inputMode="numeric" value={atk} onChange={(e) => setAtk(e.target.value.replace(/[^\d-]/g, '').slice(0, 3))} />
              </label>
            )}
            {sp.l > 0 && sp.l < 9 && (
              <label className="block text-sm">
                <span className="label">At level</span>
                <select className="input w-auto" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
                  {Array.from({ length: 10 - sp.l }, (_, i) => sp.l + i).map((l) => (
                    <option key={l} value={l}>
                      {ordinal(l)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {sp.sv && (
            <p className="flex items-center gap-2 text-sm text-stone-300">
              <Crosshair size={15} className="text-amber-400" /> Targets make a <b className="text-stone-100">{abilityName(sp.sv)}</b> save, DC {dc || '?'}
              {sp.sh === 'half' ? ' (half on a success)' : ''}.
            </p>
          )}
          {sp.at && <RollField label="Spell attack" formula={`1d20${signed(Number(atk) || 0)}`} value={rolls['Spell attack'] ?? null} onChange={setRoll('Spell attack')} compact />}
          {dmg && <RollField label={`Damage${sp.dm?.ty ? ` (${sp.dm.ty.toLowerCase()})` : ''}`} formula={dmg} value={rolls.Damage ?? null} onChange={setRoll('Damage')} compact />}
          {heal && <RollField label="Healing" formula={heal} value={rolls.Healing ?? null} onChange={setRoll('Healing')} compact />}
          <label className="flex items-center gap-1.5 text-sm text-stone-300">
            <input type="checkbox" className="accent-amber-500" checked={tell} onChange={(e) => setTell(e.target.checked)} /> Tell the table (the spell shows in the chat)
          </label>
          {fromSelf(sp) && sp.a && <p className="hint not-italic">The area starts at the token you picked on the map{picked ? ` (${picked.name})` : ''}.</p>}
        </div>
      </div>
    </Modal>
  );
}
