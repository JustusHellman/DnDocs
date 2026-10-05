import { QRCodeSVG } from 'qrcode.react';
import { Copy, Share2 } from 'lucide-react';
import { Modal } from './ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export function inviteUrl(joinCode: string) {
  // The app uses hash routing (GitHub Pages), so the route lives after the '#'.
  return `${window.location.origin}${import.meta.env.BASE_URL}#/join/${joinCode}`;
}

export default function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentCampaign } = useAuth();
  const toast = useToast();
  if (!currentCampaign) return null;
  const url = inviteUrl(currentCampaign.joinCode);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.show(text);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: `Join ${currentCampaign.name} on DnDocs`, url });
    } catch {
      /* cancelled */
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite players" description="Players scan the code, open the link, or type the join code." size="sm">
      <div className="flex flex-col items-center gap-5 pb-2">
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={url} size={184} />
        </div>
        <button type="button" onClick={() => copy(currentCampaign.joinCode, 'Join code')} className="group text-center" title="Copy join code">
          <div className="label mb-1">Join code</div>
          <div className="font-mono text-3xl font-bold tracking-[0.3em] text-amber-400 group-hover:text-amber-300">{currentCampaign.joinCode}</div>
        </button>
        <div className="flex w-full gap-2">
          <button type="button" className="btn btn-secondary flex-1" onClick={() => copy(url, 'Invite link')}>
            <Copy size={16} /> Copy link
          </button>
          {typeof navigator.share === 'function' && (
            <button type="button" className="btn btn-secondary flex-1" onClick={share}>
              <Share2 size={16} /> Share
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
