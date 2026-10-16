import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { onSnapshot } from 'firebase/firestore';
import { GiKnapsack, GiTwoCoins } from 'react-icons/gi';
import { BookOpen } from 'lucide-react';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { type Catalog, codexHash, findInCatalog, loadCatalog } from '../../lib/codex/catalog';
import { satchelRef } from '../../lib/codex/service';
import { fmtCoins, type SatchelDoc } from '../../lib/codex/state';

/**
 * What a player carries in the Scavenger's Codex (their own satchel and purse), shown read-only on
 * their character's page. Only that player and the DM can read a satchel, so callers show this to
 * nobody else.
 */
export default function CarriedCodex({ campaignId, playerId, mine, onLeave }: { campaignId: string; playerId: string; mine: boolean; onLeave?: () => void }) {
  const [satchel, setSatchel] = useState<SatchelDoc | null | undefined>(undefined);
  const [cat, setCat] = useState<Catalog | null>(null);
  const { entities, canView } = useCampaignData();

  useEffect(() => {
    setSatchel(undefined);
    return onSnapshot(
      satchelRef(campaignId, playerId),
      (snap) => setSatchel(snap.exists() ? (snap.data() as SatchelDoc) : null),
      () => setSatchel(null),
    );
  }, [campaignId, playerId]);
  useEffect(() => {
    loadCatalog().then(setCat, () => undefined);
  }, []);

  const rows = useMemo(() => {
    // Items that also have a DnDocs page (lore, pictures) link to it.
    const pages = new Map<string, string>();
    for (const e of entities) {
      const ref = e.attributes?.codexRef;
      if (typeof ref !== 'string' || !ref || !canView(e)) continue;
      pages.set(cat ? findInCatalog(cat, 'thing', ref)?.id ?? ref : ref, e.id);
    }
    const out: { id: string; name: string; q: number; href: string | null; page?: string }[] = [];
    for (const [id, q] of Object.entries(satchel?.items ?? {})) {
      if (!(Number(q) > 0)) continue;
      const t = cat ? findInCatalog(cat, 'thing', id) : undefined;
      out.push({ id, q: Math.floor(Number(q)), name: t?.name ?? id.replace(/-/g, ' '), href: t ? `/codex?open=${encodeURIComponent(codexHash('thing', t))}` : null, page: pages.get(id) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [satchel, cat, entities, canView]);

  if (satchel === undefined) return <p className="text-sm text-stone-500">Opening the satchel…</p>;
  const cp = Math.max(0, Math.floor(Number(satchel?.cp) || 0));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <GiTwoCoins size={16} className="shrink-0 text-amber-400" />
        <span className="text-stone-400">Purse</span>
        <span className="ml-auto font-mono text-stone-100">{fmtCoins(cp)}</span>
      </div>
      {rows.length ? (
        <ul className="divide-y divide-stone-800/80 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-1.5">
              {r.href ? (
                <Link to={r.href} onClick={onLeave} className="min-w-0 flex-1 truncate text-stone-200 hover:text-amber-300">
                  {r.name}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate text-stone-400 capitalize">{r.name}</span>
              )}
              {r.page && (
                <Link to={`/entity/${r.page}`} onClick={onLeave} className="btn-icon-sm size-6 shrink-0" title="Its page in DnDocs" aria-label={`${r.name}: its page in DnDocs`}>
                  <BookOpen size={13} />
                </Link>
              )}
              <span className="shrink-0 font-mono text-xs text-stone-400">×{r.q}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-500">{mine ? 'Your satchel is empty.' : 'Their satchel is empty.'}</p>
      )}
      {mine && (
        <Link to={`/codex?open=${encodeURIComponent('#/satchel')}`} onClick={onLeave} className="btn btn-secondary btn-sm">
          <GiKnapsack size={15} /> Open my satchel
        </Link>
      )}
    </div>
  );
}
