import { useRef, useState } from 'react';
import { ImagePlus, Link2, Map as MapIcon, Star, Trash2, Upload, X } from 'lucide-react';
import clsx from 'clsx';
import { ImageThumb } from '../entity/Images';
import { compressImage } from '../../lib/media';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  images: string[];
  onChange: (images: string[]) => void;
  mapImage: string | null;
  onMapChange: (ref: string | null) => void;
}

export default function ImageManager({ images, onChange, mapImage, onMapChange }: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const mapFileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const readFiles = async (files: FileList | null, maxSize: number) => {
    if (!files?.length) return [];
    setBusy(true);
    const out: string[] = [];
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue;
        out.push(await compressImage(f, maxSize));
      }
    } catch (err) {
      toast.error(err, 'Image upload');
    } finally {
      setBusy(false);
    }
    return out;
  };

  const addUrl = () => {
    const v = url.trim();
    if (!/^https?:\/\/\S+$/i.test(v)) {
      toast.show('That doesn’t look like an image link (it should start with https://).', { kind: 'error' });
      return;
    }
    onChange([...images, v]);
    setUrl('');
    setShowUrl(false);
  };

  const remove = (ref: string) => onChange(images.filter((i) => i !== ref));
  const makeCover = (ref: string) => onChange([ref, ...images.filter((i) => i !== ref)]);
  const mapInGallery = mapImage ? images.includes(mapImage) : false;

  return (
    <div className="space-y-4">
      {/* Gallery */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
        {images.map((ref, i) => (
          <div key={ref.slice(0, 64) + i} className="group relative aspect-square">
            <ImageThumb imageRef={ref} className="size-full" />
            <div className="absolute inset-x-1 top-1 flex justify-between">
              {i === 0 ? <span className="chip bg-stone-950/80 text-amber-200 ring-amber-500/30">Cover</span> : <span />}
              {ref === mapImage && <span className="chip bg-amber-500 text-stone-950 ring-amber-400">Map</span>}
            </div>
            <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
              {i > 0 && (
                <button type="button" onClick={() => makeCover(ref)} aria-label="Use as cover" title="Use as cover" className="btn-icon-sm size-7 bg-stone-950/85 text-stone-200">
                  <Star size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => onMapChange(ref === mapImage ? null : ref)}
                aria-label={ref === mapImage ? 'Stop using as map' : 'Use as map'}
                title={ref === mapImage ? 'Stop using as map' : 'Use as interactive map'}
                className={clsx('btn-icon-sm size-7', ref === mapImage ? 'bg-amber-500 text-stone-950 hover:bg-amber-400 hover:text-stone-950' : 'bg-stone-950/85 text-stone-200')}
              >
                <MapIcon size={13} />
              </button>
              <button type="button" onClick={() => remove(ref)} aria-label="Remove image" title="Remove" className="btn-icon-sm size-7 bg-stone-950/85 text-rose-300 hover:text-rose-200">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-stone-700 text-xs text-stone-400 transition-colors hover:border-amber-500/60 hover:text-amber-300"
        >
          {busy ? <div className="size-5 animate-spin rounded-full border-2 border-stone-700 border-t-amber-500" /> : <ImagePlus size={20} />}
          {busy ? 'Processing…' : 'Add images'}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const added = await readFiles(e.target.files, 1280);
          e.target.value = '';
          if (added.length) onChange([...images, ...added]);
        }}
      />

      {showUrl ? (
        <div className="flex gap-2">
          <input autoFocus type="url" inputMode="url" className="input" placeholder="https://…/image.jpg" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())} />
          <button type="button" className="btn btn-secondary" onClick={addUrl}>
            Add
          </button>
          <button type="button" className="btn-icon" aria-label="Cancel" onClick={() => setShowUrl(false)}>
            <X size={16} />
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm -ml-2" onClick={() => setShowUrl(true)}>
          <Link2 size={14} /> Add from a link
        </button>
      )}

      {/* Map */}
      <div className="surface p-3">
        <div className="flex items-start gap-3">
          {mapImage ? <ImageThumb imageRef={mapImage} className="size-16 shrink-0" /> : <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-stone-700 text-stone-600"><MapIcon size={20} /></div>}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-stone-200">Interactive map</div>
            <p className="text-xs text-stone-500">
              {mapImage
                ? mapInGallery
                  ? 'Using one of the images above. Place pins on it from the World map.'
                  : 'A dedicated map image. Place pins on it from the World map.'
                : 'Pick an image above (map button) or upload a high-resolution map.'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => mapFileRef.current?.click()}>
                <Upload size={13} /> {mapImage ? 'Replace map' : 'Upload map'}
              </button>
              {mapImage && (
                <button type="button" className="btn btn-ghost btn-sm text-rose-300" onClick={() => onMapChange(null)}>
                  Remove map
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <input
        ref={mapFileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const [map] = await readFiles(e.target.files, 2400);
          e.target.value = '';
          if (map) onMapChange(map);
        }}
      />
    </div>
  );
}
