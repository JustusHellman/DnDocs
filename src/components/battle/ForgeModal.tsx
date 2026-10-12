import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { FORGE_ORIGIN, FORGE_URL, forgeFrameUrl } from '../../lib/battle/forge';
import { parseUvttData, type UvttImport } from '../../lib/battle/geometry';

interface Props {
  /** Shown in the Forge ("New map for …" / "Editing …"). */
  name: string;
  /** The editable map to open, or null for a new one. */
  map: unknown | null;
  /** The finished map; throw to tell the Forge it didn't work. */
  onSend: (uvtt: UvttImport, map: unknown) => Promise<void>;
  onClose: () => void;
}

/** Battlemap Forge, full screen on top of DnDocs. Its "Send to DnDocs" button lands here. */
export default function ForgeModal({ name, map, onSend, onClose }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'stuck'>('loading');
  const busy = useRef(false);
  const hello = useRef(false);

  useEffect(() => {
    const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, FORGE_ORIGIN);
    const onMessage = async (e: MessageEvent) => {
      // Only the Forge we opened, from where we opened it.
      if (e.origin !== FORGE_ORIGIN || e.source !== frame.current?.contentWindow) return;
      const d = (e.data ?? {}) as { type?: string; uvtt?: unknown; map?: unknown };
      if (d.type === 'forge:ready') {
        // (Again after a reload of the Forge page: it needs the hello to send anything.)
        hello.current = true;
        post({ type: 'dndocs:hello', map, fresh: !map, name });
        setState('ready');
      } else if (d.type === 'forge:send') {
        if (busy.current) return;
        busy.current = true;
        setState('saving');
        try {
          const uvtt = parseUvttData(d.uvtt);
          await onSend(uvtt, d.map);
          post({ type: 'dndocs:received', ok: true });
          onClose();
        } catch (err) {
          post({ type: 'dndocs:received', ok: false, error: err instanceof Error ? err.message : String(err) });
          setState('ready');
        } finally {
          busy.current = false;
        }
      }
    };
    window.addEventListener('message', onMessage);
    // A Forge that never says hello (offline, or blocked): offer the way out.
    const t = setTimeout(() => !hello.current && setState('stuck'), 15_000);
    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(t);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy.current && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[150] flex flex-col bg-stone-950" role="dialog" aria-label="Battlemap Forge">
      <div className="flex items-center gap-3 border-b border-stone-800 bg-stone-900 px-3 py-2 text-sm text-stone-300">
        <span className="min-w-0 flex-1 truncate">
          {state === 'saving' ? (
            <span className="inline-flex items-center gap-2 text-amber-300">
              <Loader2 size={14} className="animate-spin" /> Putting the map on {name}…
            </span>
          ) : state === 'stuck' ? (
            <>Battlemap Forge isn’t answering. Check your connection, or open it on its own and import a .dd2vtt file instead.</>
          ) : (
            <>
              Make the map, then press <b className="text-stone-100">Send to DnDocs</b> (top right) to put it on <b className="text-stone-100">{name}</b>.
            </>
          )}
        </span>
        <a href={FORGE_URL} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm hidden sm:inline-flex" title="Battlemap Forge on its own">
          <ExternalLink size={14} /> On its own
        </a>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={state === 'saving'} aria-label="Close Battlemap Forge">
          <X size={14} /> Close
        </button>
      </div>
      <iframe ref={frame} src={forgeFrameUrl()} title="Battlemap Forge" className="min-h-0 w-full flex-1 border-0 bg-stone-950" allow="clipboard-write" />
    </div>,
    document.body,
  );
}
