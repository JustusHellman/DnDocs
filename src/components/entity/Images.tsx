import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, X, ZoomIn, ZoomOut } from 'lucide-react';
import clsx from 'clsx';
import { useImageSrc } from '../../hooks/useImageSrc';
import { Modal } from '../ui/Modal';

export function ImageThumb({ imageRef, alt = '', className, onClick }: { imageRef: string; alt?: string; className?: string; onClick?: () => void }) {
  const { src, loading, failed } = useImageSrc(imageRef);
  const [broken, setBroken] = useState(false);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={clsx('relative block overflow-hidden rounded-xl border border-stone-800 bg-stone-900', onClick && 'transition hover:border-amber-500/50', className)}
    >
      {loading ? (
        <div className="absolute inset-0 animate-pulse bg-stone-800/60" />
      ) : failed || broken || !src ? (
        <div className="absolute inset-0 flex items-center justify-center text-stone-600">
          <ImageOff size={20} />
        </div>
      ) : (
        <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
      )}
    </Tag>
  );
}

function LightboxImage({ imageRef, zoomed, onToggleZoom }: { imageRef: string; zoomed: boolean; onToggleZoom: () => void }) {
  const { src, loading } = useImageSrc(imageRef);
  if (loading || !src) return <div className="size-8 animate-spin rounded-full border-2 border-stone-700 border-t-amber-500" />;
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onClick={onToggleZoom}
      className={clsx(
        'select-none',
        zoomed ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in rounded-lg object-contain shadow-2xl',
      )}
      style={zoomed ? { width: '200%' } : undefined}
    />
  );
}

export function Lightbox({ images, index, onClose, onIndex }: { images: string[]; index: number | null; onClose: () => void; onIndex: (i: number) => void }) {
  const [zoomed, setZoomed] = useState(false);
  const open = index !== null;
  useEffect(() => setZoomed(false), [index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onIndex(((index ?? 0) + 1) % images.length);
      if (e.key === 'ArrowLeft') onIndex(((index ?? 0) - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, images.length, onIndex]);

  if (index === null) return null;
  const many = images.length > 1;
  return (
    <Modal open onClose={onClose} bare size="xl" className="h-[100dvh]! max-h-none! max-w-none! rounded-none! border-0! bg-black/95!">
      <div className="relative flex size-full items-center justify-center">
        <div className={clsx('flex size-full p-4', zoomed ? 'items-start justify-start overflow-auto' : 'items-center justify-center overflow-hidden')}>
          <LightboxImage imageRef={images[index]} zoomed={zoomed} onToggleZoom={() => setZoomed((z) => !z)} />
        </div>
        <div className="absolute top-3 right-3 flex gap-2 pt-safe">
          <button className="btn-icon bg-stone-900/70" onClick={() => setZoomed((z) => !z)} aria-label={zoomed ? 'Zoom out' : 'Zoom in'}>
            {zoomed ? <ZoomOut size={20} /> : <ZoomIn size={20} />}
          </button>
          <button className="btn-icon bg-stone-900/70" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {many && (
          <>
            <button
              className="btn-icon absolute top-1/2 left-3 -translate-y-1/2 bg-stone-900/70"
              aria-label="Previous image"
              onClick={() => onIndex((index - 1 + images.length) % images.length)}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              className="btn-icon absolute top-1/2 right-3 -translate-y-1/2 bg-stone-900/70"
              aria-label="Next image"
              onClick={() => onIndex((index + 1) % images.length)}
            >
              <ChevronRight size={22} />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-stone-900/80 px-3 py-1 text-xs text-stone-300 pb-safe">
              {index + 1} / {images.length}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
