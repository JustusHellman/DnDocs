import { useEffect, useRef, useState } from 'react';
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { Modal } from '../ui/Modal';

/** The size of the finished round picture (px, square). */
const OUT = 256;
const MAX_ZOOM = 5;

interface Framing {
  /** The circle's centre, as a fraction of the image's width / height. */
  x: number;
  y: number;
  /** 1 = the circle as large as the image allows; higher = closer in. */
  z: number;
}

/** Keeps the circle inside the picture. */
function clamp(f: Framing, w: number, h: number): Framing {
  const z = Math.max(1, Math.min(MAX_ZOOM, f.z));
  const half = Math.min(w, h) / z / 2;
  return {
    z,
    x: Math.max(half / w, Math.min(1 - half / w, f.x)),
    y: Math.max(half / h, Math.min(1 - half / h, f.y)),
  };
}

/** Cuts the framed circle out as a small square picture (WebP, JPEG where WebP isn't available). */
function render(img: HTMLImageElement, f: Framing): string {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const side = Math.min(w, h) / f.z;
  const canvas = document.createElement('canvas');
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser can’t crop pictures.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, f.x * w - side / 2, f.y * h - side / 2, side, side, 0, 0, OUT, OUT);
  for (const [type, q] of [
    ['image/webp', 0.8],
    ['image/webp', 0.65],
    ['image/jpeg', 0.7],
  ] as const) {
    const url = canvas.toDataURL(type, q);
    if (url.startsWith(`data:${type}`) && url.length < 40_000) return url;
  }
  return canvas.toDataURL('image/jpeg', 0.55);
}

/**
 * Choose which part of a picture shows in the round token: drag the picture, zoom with the
 * slider, the wheel or two fingers. The circle is what the token will show.
 */
export default function PictureFraming({ src, title, onSave, onClose }: { src: string; title: string; onSave: (dataUrl: string) => Promise<void>; onClose: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Faces are usually in the upper part of a character picture: start a little above the middle.
  const [f, setF] = useState<Framing>({ x: 0.5, y: 0.4, z: 1 });
  const [saving, setSaving] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; z: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    // Pictures from other sites can only be cropped if they allow it.
    if (!src.startsWith('data:')) i.crossOrigin = 'anonymous';
    i.onload = () => {
      setImg(i);
      setF((cur) => clamp(cur, i.naturalWidth, i.naturalHeight));
    };
    i.onerror = () => setError('That picture couldn’t be loaded.');
    i.src = src;
  }, [src]);

  const S = 288; // stage size (CSS px)
  const w = img?.naturalWidth ?? 1;
  const h = img?.naturalHeight ?? 1;
  const scale = (S * f.z) / Math.min(w, h); // screen px per image px
  const set = (next: Framing) => setF(clamp(next, w, h));

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: f.z };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      set({ ...f, z: (pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist });
      return;
    }
    if (pointers.current.size === 1) set({ ...f, x: f.x - (cur.x - prev.x) / (w * scale), y: f.y - (cur.y - prev.y) / (h * scale) });
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const save = async () => {
    if (!img) return;
    setSaving(true);
    try {
      await onSave(render(img, f));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="Drag the picture so the circle shows what the token should. Zoom with the slider, the mouse wheel or two fingers."
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!img || saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Use this
          </button>
        </>
      }
    >
      {error && <p className="mb-2 text-sm text-rose-300">{error}</p>}
      <div
        ref={stage}
        className="relative mx-auto cursor-grab touch-none overflow-hidden rounded-xl bg-stone-950 select-none active:cursor-grabbing"
        style={{ width: S, height: S }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => set({ ...f, z: f.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1) })}
      >
        {img ? (
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ width: w * scale, height: h * scale, left: S / 2 - f.x * w * scale, top: S / 2 - f.y * h * scale }}
          />
        ) : (
          !error && <Loader2 className="absolute top-1/2 left-1/2 -translate-1/2 animate-spin text-stone-500" />
        )}
        {/* Everything outside the circle dimmed: the circle is the token. */}
        <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 999px rgba(12,9,6,.62)', outline: '2px solid rgba(242,182,50,.9)' }} />
      </div>
      <div className="mx-auto mt-3 flex items-center gap-2" style={{ width: S }}>
        <ZoomOut size={15} className="text-stone-500" />
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={f.z} onChange={(e) => set({ ...f, z: Number(e.target.value) })} className="flex-1 accent-amber-500" aria-label="Zoom" />
        <ZoomIn size={15} className="text-stone-500" />
      </div>
    </Modal>
  );
}
