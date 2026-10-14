import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { findInCatalog, loadCatalog } from '../../lib/codex/catalog';
import { inboxCol, receiveGift } from '../../lib/codex/service';
import { fmtCoins } from '../../lib/codex/state';

/**
 * Puts what other players gave me in the Scavenger's Codex into my satchel. Runs wherever I am in
 * DnDocs, so a gift arrives even if I'm not on the codex page.
 */
export default function CodexInbox() {
  const { user, currentCampaign } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const campaignId = currentCampaign?.id;
  const uid = user?.uid;

  useEffect(() => {
    if (!campaignId || !uid) return;
    const busy = new Set<string>();
    return onSnapshot(
      inboxCol(campaignId, uid),
      (snap) => {
        for (const d of snap.docs) {
          if (busy.has(d.id)) continue;
          busy.add(d.id);
          receiveGift(campaignId, uid, d.id)
            .then(async (g) => {
              if (!g) return;
              const cat = await loadCatalog().catch(() => null);
              const things = Object.entries(g.items ?? {}).map(([id, q]) => `${q}× ${(cat && findInCatalog(cat, 'thing', id)?.name) || id}`);
              if (g.cp > 0) things.push(fmtCoins(g.cp));
              toast.show(`${g.fromName || 'Someone'} gave you ${things.join(', ')}`, {
                kind: 'success',
                action: { label: 'Satchel', onClick: () => navigate(`/codex?open=${encodeURIComponent('#/satchel')}`) },
              });
            })
            .catch(() => busy.delete(d.id));
        }
      },
      () => undefined,
    );
  }, [campaignId, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
