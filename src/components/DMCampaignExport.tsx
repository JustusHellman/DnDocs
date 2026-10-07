import { useMemo, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData } from '../contexts/CampaignDataContext';
import { useToast } from '../contexts/ToastContext';
import { buildExportPack, selectEntries, type ExportMode, type ExportResult } from '../lib/campaignExport';
import { fetchMediaData } from '../lib/media';

/** DM tools card: save the whole campaign as a pack file (a full copy, or a copy that is safe for players). */
export default function DMCampaignExport() {
  const { currentCampaign, user } = useAuth();
  const { entities, relationships } = useCampaignData();
  const toast = useToast();
  const [mode, setMode] = useState<ExportMode>('full');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<ExportResult | null>(null);

  const count = useMemo(() => (user ? selectEntries(entities, { mode, uid: user.uid }).length : 0), [entities, mode, user]);
  if (!currentCampaign || !user) return null;

  const run = async () => {
    setBusy(true);
    setLast(null);
    try {
      const chosen = selectEntries(entities, { mode, uid: user.uid });
      const media = new Map<string, string>();
      for (const e of chosen) {
        const id = e.mapConfig?.mediaId;
        if (!id || media.has(id)) continue;
        try {
          const data = await fetchMediaData(id);
          if (data) media.set(id, data);
        } catch {
          /* the map is reported as left out */
        }
      }
      const result = buildExportPack(currentCampaign, entities, relationships, { mode, uid: user.uid, media });
      setLast(result);
      if (!result.pack) {
        toast.error(new Error(result.error ?? 'Nothing to export'), 'Export');
        return;
      }
      const blob = new Blob([JSON.stringify(result.pack, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${result.pack.pack.id}${mode === 'public' ? '-players' : ''}.pack.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(`Saved ${result.counts.entries} entries`);
    } catch (err) {
      toast.error(err, 'Export');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 md:col-span-2">
      <h2 className="section-title mb-1 flex items-center gap-2">
        <Share2 size={18} /> Export campaign
      </h2>
      <p className="mb-3 text-sm text-stone-500">
        Saves your entries, links and maps as a pack file. Anyone can import it from the card above, into any campaign. Everything imported starts secret.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`surface flex cursor-pointer gap-3 p-3 text-sm ${mode === 'full' ? 'ring-1 ring-amber-500/50' : ''}`}>
          <input type="radio" name="export-mode" checked={mode === 'full'} onChange={() => setMode('full')} className="mt-1" />
          <span>
            <strong className="text-stone-100">Full copy (for you)</strong>
            <span className="block text-stone-400">Every entry, including secrets, DM notes and your own notes.</span>
          </span>
        </label>
        <label className={`surface flex cursor-pointer gap-3 p-3 text-sm ${mode === 'public' ? 'ring-1 ring-amber-500/50' : ''}`}>
          <input type="radio" name="export-mode" checked={mode === 'public'} onChange={() => setMode('public')} className="mt-1" />
          <span>
            <strong className="text-stone-100">Player copy (safe to share)</strong>
            <span className="block text-stone-400">Only public entries and the fields players can see. No DM notes, tags or private notes.</span>
          </span>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={busy || count === 0} onClick={run}>
          <Download size={16} /> {busy ? 'Preparing…' : `Download ${count} ${count === 1 ? 'entry' : 'entries'}`}
        </button>
        {count === 0 && <span className="text-sm text-stone-500">{mode === 'public' ? 'No entries are public yet.' : 'Nothing to export yet.'}</span>}
      </div>
      {last && (
        <div className="mt-3 text-sm text-stone-400">
          {last.pack && (
            <p>
              Saved {last.counts.entries} entries, {last.counts.relationships} links and {last.counts.maps} maps.
            </p>
          )}
          {last.warnings.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-300/90">
              {last.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
