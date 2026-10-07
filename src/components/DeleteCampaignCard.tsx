import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { deleteCampaignCompletely } from '../lib/campaignDelete';

/** Owner only: delete the campaign and everything in it. Asks for the campaign's name first. */
export default function DeleteCampaignCard() {
  const { currentCampaign, setCurrentCampaign } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [failed, setFailed] = useState(0);

  if (!currentCampaign) return null;
  const matches = typed.trim() === currentCampaign.name.trim();

  const run = async () => {
    if (!matches) return;
    setBusy(true);
    setFailed(0);
    try {
      const result = await deleteCampaignCompletely(currentCampaign, (d, t) => setProgress([d, t]));
      if (result.campaignDeleted) {
        toast.success(`"${currentCampaign.name}" was deleted`);
        setCurrentCampaign(null);
        navigate('/');
      } else {
        setFailed(result.failed);
      }
    } catch (err) {
      toast.error(err, 'Delete campaign');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mt-6 border-red-900/40 p-5">
      <h2 className="section-title mb-1 text-red-300">Delete campaign</h2>
      <p className="mb-3 text-sm text-stone-400">
        Permanently deletes <strong>{currentCampaign.name}</strong> and everything in it: every entry (including your players' notes), every link, every map and the join code. Players lose access.
        This cannot be undone. Use <em>Export campaign</em> in DM tools first if you want a copy.
      </p>
      {!open ? (
        <button type="button" className="btn btn-secondary btn-sm text-red-300" onClick={() => setOpen(true)}>
          <Trash2 size={14} /> Delete this campaign…
        </button>
      ) : (
        <div className="space-y-3">
          <label className="label" htmlFor="del-name">
            Type the campaign name to confirm
          </label>
          <input id="del-name" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={currentCampaign.name} disabled={busy} autoComplete="off" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-danger" disabled={!matches || busy} onClick={run}>
              <Trash2 size={16} /> {busy ? `Deleting… ${progress[0]}/${progress[1]}` : 'Delete everything'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setTyped('');
                setFailed(0);
              }}
            >
              Cancel
            </button>
          </div>
          {failed > 0 && (
            <p className="text-sm text-amber-300">
              {failed} item{failed === 1 ? '' : 's'} could not be deleted, so the campaign was kept. Check your connection and press the button again; it carries on where it stopped.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
