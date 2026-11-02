import { useState } from 'react';
import { Crosshair, Heart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { requestHit, tokenOfEntity, useAim } from '../../lib/battle/aimStore';
import { healCharacter } from '../../lib/battle/applyDamage';
import { applyHp, readHp } from '../../lib/hitPoints';
import { canPlaceArea } from '../../lib/play/ui';
import { tableChat } from '../../lib/chat/bus';

/**
 * A spell's damage for the target picked on the battle map: offered, never put on anyone by
 * itself. The map's dialog shows the hit points before → after and the amount can still change.
 */
export function DamageTarget({ title, by, byEntity, dmg, ty, total, save, dc, half }: { title: string; by: string; byEntity?: string | null; dmg?: string | null; ty?: string; total?: number; save?: string; dc?: number; half?: boolean }) {
  const aim = useAim();
  const mine = aim && (!byEntity || aim.byEntity === byEntity) ? aim : null;
  if (!canPlaceArea()) return null;
  if (!mine)
    return (
      <p className="flex items-center gap-1.5 text-xs text-stone-500">
        <Crosshair size={13} /> To put the damage on someone: <i>Pick target</i> in the turn helper first (nothing is applied by itself).
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-stone-300 ring-1 ring-rose-500/30">
      <Crosshair size={15} className="text-rose-300" />
      <span className="flex-1">
        Target <b className="text-stone-100">{mine.targetName}</b>
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => requestHit({ title, by, kind: 'damage', tokenIds: [mine.target], dmg: dmg?.replace(/\s+/g, '') ?? undefined, ty, total, save, dc, half })}
      >
        Apply damage…
      </button>
    </div>
  );
}

/**
 * Healing for one of the party: who, and their hit points before → after, then one press. On the
 * battle map it goes through the map's dialog; a character you can't change gets it from its
 * player or the DM (a line in the chat with "Apply…").
 */
export function HealSomeone({ title, by, selfId, amount }: { title: string; by: string; selfId: string; amount: number | null }) {
  const { isDM } = useAuth();
  const toast = useToast();
  const aim = useAim();
  const { entities, canEdit } = useCampaignData();
  const party = entities.filter((e) => e.type === 'character');
  const aimedChar = aim ? party.find((e) => tokenOfEntity(e.id)?.id === aim.target) : undefined;
  const [who, setWho] = useState(aimedChar?.id ?? selfId);
  const e = party.find((x) => x.id === who);
  if (!e) return null;
  const hp = readHp(e.attributes, e.dndStats?.hitPoints);
  const after = amount !== null ? applyHp(hp, 'heal', amount).current : null;
  const heal = async () => {
    if (amount === null) return;
    const tok = canPlaceArea() ? tokenOfEntity(e.id) : null;
    if (tok) return requestHit({ title, by, kind: 'heal', tokenIds: [tok.id], total: amount });
    try {
      if (isDM || canEdit(e)) {
        const { undo } = await healCharacter(e, amount);
        toast.show(`${title}: ${e.name} +${amount} HP — done`, { action: { label: 'Undo', onClick: () => void undo() }, duration: 8000 });
      } else {
        await tableChat.event({ t: 'hit', kind: 'heal', title, by, ids: [], names: [e.name], ents: [e.id], total: amount });
        toast.show(`Sent: ${e.name}'s player (or the DM) applies it.`);
      }
    } catch (err) {
      toast.error(err, title);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-stone-300 ring-1 ring-emerald-500/30">
      <Heart size={15} className="text-emerald-300" />
      <span>Heal</span>
      <select className="input w-auto py-0.5 text-sm" value={who} onChange={(ev) => setWho(ev.target.value)} aria-label="Who to heal">
        {party.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <span className="flex-1 text-xs text-stone-400 tabular-nums">
        {hp.current ?? '?'} → <b className="text-stone-100">{after ?? '?'}</b>
        {hp.max !== null ? `/${hp.max}` : ''} HP
      </span>
      <button type="button" className="btn btn-secondary btn-sm" disabled={amount === null} onClick={heal} title={amount === null ? 'Roll or type the healing first' : undefined}>
        Heal {amount ?? ''}
      </button>
    </div>
  );
}
