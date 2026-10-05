import { doc, getDoc, getDocFromCache } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Images are stored as base64 in a separate `media` collection (Firestore docs max 1 MB)
 * and referenced from entities as `media:<id>`. Resolving them is expensive, so we cache.
 */
const cache = new Map<string, Promise<string | null>>();

export const MEDIA_PREFIX = 'media:';

export function isMediaRef(url: string | undefined | null): boolean {
  return !!url && url.startsWith(MEDIA_PREFIX);
}

export function mediaIdOf(url: string): string {
  return url.slice(MEDIA_PREFIX.length);
}

export function fetchMediaData(mediaId: string): Promise<string | null> {
  let pending = cache.get(mediaId);
  if (!pending) {
    const ref = doc(db, 'media', mediaId);
    // Media docs never change, so the offline cache is always good enough when it has them.
    pending = getDocFromCache(ref)
      .catch(() => getDoc(ref))
      .then((snap) => (snap.exists() ? (snap.data().data as string) : null))
      .catch((err) => {
        cache.delete(mediaId); // allow a retry later
        throw err;
      });
    cache.set(mediaId, pending);
  }
  return pending;
}

/** Resolves `media:` refs to a displayable src; other URLs are returned as-is. */
export async function resolveImageSrc(url: string): Promise<string | null> {
  if (!isMediaRef(url)) return url;
  try {
    return await fetchMediaData(mediaIdOf(url));
  } catch {
    return null;
  }
}

export function primeMediaCache(mediaId: string, data: string) {
  cache.set(mediaId, Promise.resolve(data));
}

export function forgetMedia(mediaId: string) {
  cache.delete(mediaId);
}

let webpSupport: boolean | null = null;
function supportsWebp(): boolean {
  if (webpSupport === null) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      webpSupport = false;
    }
  }
  return webpSupport;
}

/** WebP where the browser can encode it (most), JPEG otherwise (older Safari). */
function encode(canvas: HTMLCanvasElement, quality: number): string {
  if (supportsWebp()) {
    const out = canvas.toDataURL('image/webp', quality);
    if (out.startsWith('data:image/webp')) return out;
  }
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Scales an image down and re-encodes it (WebP, JPEG fallback) so it fits comfortably under the
 * 1 MB Firestore doc limit. Typical results: a 1280px photo ≈ 100–250 KB.
 */
export async function compressImage(source: string | Blob, maxSize = 1280, quality = 0.8, limit = 900_000): Promise<string> {
  const src = typeof source === 'string' ? source : await blobToDataUrl(source);
  const img = await loadImage(src);
  let { width, height } = img;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  // Step quality, then size, down until the result fits (base64 inflates ~33%).
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, width, height);
    for (let q = quality; q >= 0.45; q -= 0.1) {
      const out = encode(canvas, q);
      if (out.length <= limit) return out;
    }
    width = Math.max(1, Math.round(width * 0.8));
    height = Math.max(1, Math.round(height * 0.8));
  }
  throw new Error('That image is too large to store. Try a smaller one.');
}

/** Tiny preview (≈5–15 KB) stored directly on the entry, so lists show pictures without extra reads. */
export function makeThumbnail(source: string): Promise<string> {
  return compressImage(source, 240, 0.6, 40_000);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}
