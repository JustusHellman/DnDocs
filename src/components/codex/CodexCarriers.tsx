import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { GiKnapsack } from 'react-icons/gi';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { findInCatalog, loadCatalog } from '../../lib/codex/catalog';
import { partyRef, satchelRef } from '../../lib/codex/service';
import type { PartyDoc, SatchelDoc } from '../../lib/codex/state';

/**
 * Who carries a codex-linked item, straight from the satchels (the item page has no location of its
 * own). The DM sees every satchel; a player sees the party satchel and their own.
 */
export default function CodexCarriers({ codexRef }: { codexRef: string }) {
  const { user, isDM, currentCampaign } = useAuth();
  const { members, entities } = useCampaignData();
  const [id, setId] = useState(codexRef);
  const [party, setParty] = useState<number>(0);
  const [sats, setSats] = useState<Record<string, number>>({});
  const campaignId = currentCampaign?.id;
  const uid = user?.uid;

  useEffect(() => {
    loadCatalog().then((cat) => setId(findInCatalog(cat, 'thing', codexRef)?.id ?? codexRef), () => setId(codexRef));
  }, [codexRef]);

  useEffect(() => {
    if (!campaignId) return;
    return onSnapshot(partyRef(campaignId), (snap) => setParty(Math.max(0, Number((snap.data() as PartyDoc | undefined)?.items?.[id]) || 0)), () => undefined);
  }, [campaignId, id]);

  useEffect(() => {
    if (!campaignId || !uid) return;
    const count = (d?: SatchelDoc) => Math.max(0, Number(d?.items?.[id]) || 0);
    if (isDM) {
      return onSnapshot(
        collection(db, 'codex', campaignId, 'satchels'),
        (snap) => setSats(Object.fromEntries(snap.docs.map((d) => [d.id, count(d.data() as SatchelDoc)]))),
        () => undefined,
      );
    }
    return onSnapshot(satchelRef(campaignId, uid), (snap) => setSats({ [uid]: count(snap.data() as SatchelDoc | undefined) }), () => undefined);
  }, [campaignId, uid, isDM, id]);

  const holders = useMemo(() => {
    const out = Object.entries(sats)
      .filter(([, q]) => q > 0)
      .map(([who, q]) => {
        const chars = entities.filter((e) => e.type === 'character' && e.playerId === who).map((e) => e.name);
        const name = who === uid ? 'You' : chars[0] ?? members.find((m) => m.uid === who)?.displayName ?? 'Someone';
        return { key: who, name, q };
      })
      .sort((a, b) => Number(b.key === uid) - Number(a.key === uid) || a.name.localeCompare(b.name));
    if (party > 0) out.push({ key: 'party', name: 'The party satchel', q: party });
    return out;
  }, [sats, party, entities, members, uid]);

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <GiKnapsack size={15} className="text-stone-500" />
      <span className="text-stone-500">Carried by</span>
      {holders.length ? (
        holders.map((h) => (
          <span key={h.key} className="chip text-stone-200 ring-stone-600/60">
            {h.name} <span className="font-mono text-xs text-stone-500">×{h.q}</span>
          </span>
        ))
      ) : (
        <span className="text-stone-500 italic">{isDM ? 'nobody right now' : 'nobody you know of'}</span>
      )}
    </div>
  );
}
