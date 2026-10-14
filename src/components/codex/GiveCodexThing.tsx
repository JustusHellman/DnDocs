import { useEffect, useMemo, useState } from 'react';
import { GiKnapsack } from 'react-icons/gi';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { useToast } from '../../contexts/ToastContext';
import { findInCatalog, loadCatalog } from '../../lib/codex/catalog';
import { dmGive } from '../../lib/codex/service';
import { Modal } from '../ui/Modal';

/** DM, on an item entry linked to the Scavenger's Codex: put it in a player's (or the party's) codex satchel. */
export default function GiveCodexThing({ codexRef, fallbackName }: { codexRef: string; fallbackName: string }) {
  const { currentCampaign } = useAuth();
  const { players, entities } = useCampaignData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [q, setQ] = useState(1);
  const [saving, setSaving] = useState(false);
  const [thing, setThing] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    loadCatalog().then(
      (cat) => {
        const t = findInCatalog(cat, 'thing', codexRef);
        setThing(t ? { id: t.id, name: t.name } : null);
      },
      () => setThing(null),
    );
  }, [open, codexRef]);

  const targets = useMemo(
    () => [
      { key: '', name: 'The party satchel' },
      ...players.map((p) => {
        const chars = entities.filter((e) => e.type === 'character' && e.playerId === p.uid).map((e) => e.name);
        return { key: p.uid, name: chars.length ? `${chars.join(', ')} (${p.displayName})` : p.displayName };
      }),
    ],
    [players, entities],
  );

  const give = async () => {
    if (!currentCampaign || !thing || !(q >= 1)) return;
    const target = targets.find((t) => t.key === to) ?? targets[0];
    setSaving(true);
    try {
      await dmGive(currentCampaign.id, { uid: target.key || null, name: target.key ? target.name.replace(/ \(.*\)$/, '') : 'the party' }, thing.id, q, thing.name);
      toast.success(`Gave ${q}× ${thing.name} to ${target.name.replace(/ \(.*\)$/, '')}`);
      setOpen(false);
    } catch (err) {
      toast.error(err, 'Give item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <GiKnapsack size={15} /> Give to…
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Give ${thing?.name ?? fallbackName}`}
        description="Puts it in their Scavenger's Codex satchel (nothing leaves yours)."
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={give} disabled={saving || !thing || !(q >= 1)}>
              {saving ? 'Giving…' : 'Give'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="label">To</span>
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              {targets.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">How many</span>
            <input className="input w-24" type="number" min={1} max={999} value={q} onChange={(e) => setQ(Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)))} />
          </label>
          {!thing && <p className="text-sm text-stone-500">Looking it up in the Codex…</p>}
        </div>
      </Modal>
    </>
  );
}
