import { useEffect, useState } from 'react';
import { type Catalog, codexStatFor, type CodexStat, loadCatalog, loadStatblocks } from '../lib/codex/catalog';

/** The SRD stat block of a codex creature, or null (none, not loaded yet, or no id). */
export function useCodexStat(id: string | null | undefined): CodexStat | null {
  const [stat, setStat] = useState<CodexStat | null>(null);
  useEffect(() => {
    setStat(null);
    if (!id) return;
    let live = true;
    Promise.all([loadStatblocks(), loadCatalog().catch((): Catalog | null => null)])
      .then(([stats, cat]) => live && setStat(codexStatFor(stats, cat, id) ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id]);
  return stat;
}
