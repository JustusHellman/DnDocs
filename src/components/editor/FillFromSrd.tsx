import { useEffect, useState } from 'react';
import { BookCopy } from 'lucide-react';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useToast } from '../../contexts/ToastContext';
import { type Catalog, codexStatFor, type CodexStat, hasStats, loadCatalog, loadStatblocks, matchByName, toDndStats } from '../../lib/codex/catalog';
import type { DndStats } from '../../types';

/**
 * DM, in the stat block editor: fill it in from the SRD stat block of the linked codex creature (or the
 * one with the same name). Everything stays editable afterwards.
 */
export default function FillFromSrd({ codexRef, name, current, onFill }: { codexRef: string | null; name: string; current: DndStats | null | undefined; onFill: (v: { dndStats: DndStats; statBlock: string }) => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [data, setData] = useState<{ stats: Record<string, CodexStat>; cat: Catalog } | null>(null);
  useEffect(() => {
    Promise.all([loadStatblocks(), loadCatalog()]).then(([stats, cat]) => setData({ stats, cat }), () => undefined);
  }, []);
  if (!data) return null;
  const linked = codexRef ? codexStatFor(data.stats, data.cat, codexRef) : undefined;
  const byName = !linked ? matchByName(data.cat, 'monster', name).find((m) => data.stats[m.id]) : undefined;
  const sb = linked ?? (byName ? data.stats[byName.id] : undefined);
  if (!sb) return null;
  const label = linked ? 'the linked Codex creature' : `the SRD ${byName!.name}`;
  const fill = async () => {
    if (hasStats(current) && !(await confirm({ title: 'Replace the stat block?', message: `This entry already has stats. Replace them with ${label}'s?`, confirmLabel: 'Replace' }))) return;
    onFill(toDndStats(sb));
    toast.success('Filled in from the SRD. Change anything you like.');
  };
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={fill} title={`Armor class, hit points, abilities, traits and actions from ${label} (SRD ${sb.ed === '2024' ? '5.2.1' : '5.1'})`}>
      <BookCopy size={14} /> Fill from the SRD{byName ? ` (${byName.name})` : ''}
    </button>
  );
}
