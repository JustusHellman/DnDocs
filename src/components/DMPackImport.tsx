import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Trash2, XCircle } from 'lucide-react';
import { GiScrollUnfurled } from 'react-icons/gi';
import { useAuth } from '../contexts/AuthContext';
import { useCampaignData } from '../contexts/CampaignDataContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import { buildPlan, isPackEntityId, packScope, parsePackText, type ImportPlan } from '../lib/campaignImport';
import { needsUpdate, removePack, runImport, type ImportMode, type ImportSummary } from '../lib/campaignImportWrite';
import { typeMeta } from '../lib/entityTypes';
import { bulk } from '../lib/dbMeter';

/** DM tools card: preview and import a campaign pack file, or take an imported pack back out. */
export default function DMPackImport() {
  const { currentCampaign, user } = useAuth();
  const { entities, relationships } = useCampaignData();
  const confirm = useConfirm();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fatal, setFatal] = useState('');
  const [mode, setMode] = useState<ImportMode>('skip');
  const [busy, setBusy] = useState<'import' | 'remove' | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const existingIds = useMemo(() => new Set(entities.map((e) => e.id)), [entities]);
  const alreadyThere = plan ? plan.entities.filter((e) => existingIds.has(e.id)).length : 0;
  const importedBefore = plan?.pack ? entities.filter((e) => isPackEntityId(plan.pack!.scope, e.id)).length : 0;
  // Entries whose text differs from the pack (only these are written on "refresh").
  const changed = useMemo(() => {
    if (!plan) return 0;
    const byId = new Map(entities.map((e) => [e.id, e]));
    return plan.entities.filter((e) => {
      const cur = byId.get(e.id);
      return cur && needsUpdate(e, cur);
    }).length;
  }, [plan, entities]);
  const [removeMissing, setRemoveMissing] = useState(false);
  // What a refresh would do to links, and which of the pack's entries the file no longer has.
  const diff = useMemo(() => {
    const none = { newRels: 0, changedRels: 0, staleRels: 0, missing: [] as string[] };
    if (!plan?.pack) return none;
    const packId = plan.pack.scope;
    const have = new Map(relationships.map((x) => [x.id, x]));
    const planRels = new Set(plan.relationships.map((x) => x.id));
    const inPack = new Set(plan.entities.map((e) => e.id));
    const missing = entities.filter((e) => isPackEntityId(packId, e.id) && !inPack.has(e.id));
    const keys = ['sourceId', 'targetId', 'targetName', 'label', 'reverseLabel'] as const;
    return {
      newRels: plan.relationships.filter((x) => !have.has(x.id)).length,
      changedRels: plan.relationships.filter((x) => {
        const cur = have.get(x.id);
        return cur && keys.some((k) => (cur[k] ?? '') !== (x[k] ?? ''));
      }).length,
      staleRels: relationships.filter((x) => x.id.startsWith(`seedrel-${packId}-`) && !planRels.has(x.id)).length,
      missing: missing.map((e) => e.name),
    };
  }, [plan, relationships, entities]);
  const newRels = diff.newRels;
  const fresh = plan ? plan.entities.length - alreadyThere : 0;
  const refresh = mode === 'update';
  const writes = fresh + newRels + (refresh ? changed + diff.changedRels + diff.staleRels + (removeMissing ? diff.missing.length : 0) : 0);

  if (!currentCampaign || !user) return null;

  const reset = () => {
    setPlan(null);
    setFatal('');
    setSummary(null);
    setFileName('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const onFile = async (file: File | undefined) => {
    setSummary(null);
    setPlan(null);
    setFatal('');
    if (!file) return;
    setFileName(file.name);
    if (file.size > 8_000_000) {
      setFatal('That file is larger than 8 MB. A campaign pack should be much smaller.');
      return;
    }
    const { raw, error } = parsePackText(await file.text());
    if (error) {
      setFatal(error);
      return;
    }
    const packId = (raw as { pack?: { id?: unknown } } | null)?.pack?.id;
    const idScope = typeof packId === 'string' ? packScope(packId, currentCampaign.id, existingIds) : undefined;
    setPlan(buildPlan(raw, { campaignId: currentCampaign.id, uid: user.uid, idScope }));
  };

  const doImport = async () => {
    if (!plan?.ok || !plan.pack) return;
    const ok = await confirm({
      title: `Import "${plan.pack.name}"?`,
      confirmLabel: 'Import',
      message: (
        <div className="space-y-2">
          <p>
            This adds <strong>{fresh}</strong> new entries and <strong>{newRels}</strong> new links to <strong>{currentCampaign.name}</strong>.
            {alreadyThere > 0 &&
              (mode === 'skip'
                ? ` ${alreadyThere} entries from this pack are already here and will be left exactly as they are.`
                : ` ${alreadyThere} entries from this pack are already here; ${changed ? `the ${changed} that changed will be updated (text, fields and location), the rest are left alone` : 'none of them changed, so they are left alone'}.`)}
          </p>
          {refresh && (diff.changedRels > 0 || diff.staleRels > 0 || (removeMissing && diff.missing.length > 0)) && (
            <p>
              {[
                diff.changedRels ? `${diff.changedRels} links get the pack's new wording` : '',
                diff.staleRels ? `${diff.staleRels} links the pack no longer has are removed` : '',
                removeMissing && diff.missing.length ? `${diff.missing.length} entries no longer in the pack are deleted` : '',
              ]
                .filter(Boolean)
                .join('; ')}
              .
            </p>
          )}
          <p className="text-stone-500">
            About {writes} database writes (the free plan allows 20,000 a day).
          </p>
          <p>Everything imported is <strong>secret</strong>: your players can't see any of it until you reveal it. You can undo the import afterwards from this card.</p>
        </div>
      ),
    });
    if (!ok) return;
    setBusy('import');
    setSummary(null);
    setProgress([0, plan.entities.length + plan.relationships.length + plan.maps.length]);
    try {
      const s = await bulk('importing a pack', () => runImport(plan, { mode, campaignId: currentCampaign.id, removeMissing: refresh && removeMissing, onProgress: (d, t) => setProgress([d, t]) }));
      setSummary(s);
      if (s.failed.length) toast.error(new Error(`${s.failed.length} items didn't import. Run it again to retry just those.`), 'Import');
      else toast.success(`Imported ${s.created + s.updated} entries and ${s.relationshipsCreated} links.`);
    } catch (e) {
      toast.error(e, 'Import');
    } finally {
      setBusy(null);
    }
  };

  const doRemove = async () => {
    if (!plan?.pack) return;
    const ok = await confirm({
      title: `Remove "${plan.pack.name}" from this campaign?`,
      confirmLabel: 'Remove it',
      danger: true,
      message: (
        <p>
          This deletes the <strong>{importedBefore}</strong> entries that came from this pack, <em>including any changes you made to them</em>, and the links between them. Entries you made yourself are kept (any placed inside a pack entry move to the top level). This can't be undone, but you can import the pack again.
        </p>
      ),
    });
    if (!ok) return;
    setBusy('remove');
    try {
      const r = await bulk('removing a pack', () => removePack(plan.pack.scope, currentCampaign.id, { entities }));
      if (r.failed) toast.error(new Error(`${r.failed} items couldn't be removed. Try again.`), 'Remove pack');
      else toast.success(`Removed ${r.entities} entries, ${r.relationships} links and ${r.maps} maps.`);
      setSummary(null);
    } catch (e) {
      toast.error(e, 'Remove pack');
    } finally {
      setBusy(null);
    }
  };

  const errors = plan?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = plan?.issues.filter((i) => i.level === 'warning') ?? [];

  return (
    <section className="card p-5 md:col-span-2 xl:col-span-3">
      <h2 className="section-title mb-1 flex items-center gap-2">
        <GiScrollUnfurled size={20} /> Import a campaign pack
      </h2>
      <p className="mb-4 text-sm text-stone-500">
        Load a pack file (.json) to add a whole set of entries at once. You'll see a preview first. Nothing is changed until you press Import, and everything arrives secret.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => fileInput.current?.click()}>
          <FileUp size={16} /> Choose pack file…
        </button>
        {fileName && <span className="text-sm text-stone-400">{fileName}</span>}
        {(plan || fatal) && !busy && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
            Clear
          </button>
        )}
      </div>

      {fatal && (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-rose-300">
          <XCircle size={16} className="mt-0.5 shrink-0" /> {fatal}
        </p>
      )}

      {plan && (
        <div className="mt-4 space-y-4">
          {plan.pack && (
            <div className="surface p-4">
              <p className="font-display text-lg font-semibold text-stone-50">{plan.pack.name}</p>
              {plan.pack.description && <p className="text-sm text-stone-400">{plan.pack.description}</p>}
              {plan.ok && (
                <>
                  <p className="mt-3 text-sm text-stone-300">
                    {plan.entities.length} entries · {plan.relationships.length} links{plan.maps.length ? ` · ${plan.maps.length} maps with ${plan.maps.reduce((n, m) => n + m.pins.length, 0)} pins` : ''}
                    {alreadyThere > 0 && <span className="text-amber-300"> · {alreadyThere} already in this campaign</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(plan.counts).map(([type, n]) => (
                      <span key={type} className="chip">
                        {n} {n === 1 ? typeMeta(type).label : typeMeta(type).plural}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm">
              <p className="mb-2 flex items-center gap-2 font-semibold text-rose-300">
                <XCircle size={16} /> {errors.length} {errors.length === 1 ? 'problem' : 'problems'} to fix before importing
              </p>
              <ul className="max-h-60 space-y-1 overflow-y-auto text-stone-300">
                {errors.slice(0, 100).map((i, n) => (
                  <li key={n}>
                    <span className="text-stone-500">{i.where}:</span> {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="mb-2 flex items-center gap-2 font-semibold text-amber-300">
                <AlertTriangle size={16} /> {warnings.length} {warnings.length === 1 ? 'note' : 'notes'}
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-stone-300">
                {warnings.slice(0, 50).map((i, n) => (
                  <li key={n}>
                    <span className="text-stone-500">{i.where}:</span> {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.ok && (
            <div className="space-y-3">
              {alreadyThere > 0 && (
                <fieldset className="space-y-2 text-sm text-stone-300">
                  <legend className="mb-1 text-stone-400">Some of these entries are already in your campaign:</legend>
                  <label className="flex items-start gap-2">
                    <input type="radio" name="pack-mode" className="mt-1" checked={mode === 'skip'} onChange={() => setMode('skip')} />
                    <span>
                      <strong>Add only what's new</strong> (recommended). Entries already here are left exactly as they are.
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="radio" name="pack-mode" className="mt-1" checked={mode === 'update'} onChange={() => setMode('update')} />
                    <span>
                      <strong>Update them to match the pack</strong>
                      {changed ? ` (${changed} changed)` : ' (none changed)'}: text, fields, location and links follow the pack file; links the pack dropped are removed. Only what differs is written. Keeps who can see them, images, map pins and links you added yourself.
                    </span>
                  </label>
                  {mode === 'update' && diff.missing.length > 0 && (
                    <label className="ml-6 flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} />
                      <span>
                        Also delete the <strong>{diff.missing.length}</strong> {diff.missing.length === 1 ? 'entry' : 'entries'} from this pack that the file no longer has
                        <span className="text-stone-500"> ({diff.missing.slice(0, 4).join(', ')}{diff.missing.length > 4 ? ', …' : ''})</span>.
                      </span>
                    </label>
                  )}
                </fieldset>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-primary" disabled={!!busy} onClick={doImport}>
                  {busy === 'import'
                    ? `Importing… ${progress[0]}/${progress[1]}`
                    : mode === 'update' && changed
                      ? `Import ${fresh} new, update ${changed}`
                      : `Import ${fresh} new entries`}
                </button>
                {importedBefore > 0 && (
                  <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={doRemove}>
                    <Trash2 size={16} /> {busy === 'remove' ? 'Removing…' : `Remove this pack (${importedBefore} entries)`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {summary && (
        <div role="status" className="mt-4 rounded-xl border border-stone-700 bg-stone-900/40 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-stone-100">
            {summary.failed.length ? <AlertTriangle size={16} className="text-amber-300" /> : <CheckCircle2 size={16} className="text-emerald-300" />}
            {summary.failed.length ? 'Import finished with problems' : 'Import finished'}
          </p>
          <p className="mt-1 text-stone-300">
            {summary.created} entries created{summary.updated ? `, ${summary.updated} updated` : ''}
            {summary.skipped ? `, ${summary.skipped} left as they were` : ''}
            {summary.unchanged ? `, ${summary.unchanged} already up to date` : ''}
            {summary.removed ? `, ${summary.removed} removed` : ''}; {summary.relationshipsCreated} links created
            {summary.relationshipsUpdated ? `, ${summary.relationshipsUpdated} updated` : ''}{summary.relationshipsRemoved ? `, ${summary.relationshipsRemoved} removed` : ''}{summary.relationshipsSkipped ? `, ${summary.relationshipsSkipped} already there` : ''}{summary.mapsSet || summary.mapsSkipped ? `; ${summary.mapsSet} maps set${summary.mapsSkipped ? `, ${summary.mapsSkipped} left as they were` : ''}` : ''}.
          </p>
          {summary.failed.length > 0 && (
            <>
              <p className="mt-2 text-amber-300">These didn't import (choose the same file and press Import again to retry just these):</p>
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-stone-400">
                {summary.failed.slice(0, 30).map((f) => (
                  <li key={f.id}>
                    {f.name}: {f.error}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
