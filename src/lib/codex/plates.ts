/**
 * Token pictures for Scavenger's Codex creatures: the codex ships a round silhouette for each kind of
 * creature (tokens.json, drawn by its plates.js: its own artwork). DnDocs only reads them as pictures
 * (an SVG shown through an <img> can't run anything) and turns one into a small image for the token.
 */
import { CODEX_URL } from './catalog';

let pending: Promise<Record<string, string>> | null = null;

function loadTokenSvgs(): Promise<Record<string, string>> {
  if (!pending) {
    pending = fetch(new URL('tokens.json', new URL(CODEX_URL, location.href)).toString())
      .then((r) => {
        if (!r.ok) throw new Error(`The Codex token pictures aren't available (${r.status}).`);
        return r.json() as Promise<{ types?: Record<string, string> }>;
      })
      .then((d) => d.types ?? {})
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

const cache = new Map<string, string | null>();

/** A small picture (data URL) for a codex creature's token, by its kind (beast, dragon …), or null. */
export async function codexTokenPicture(m: { type?: string }): Promise<string | null> {
  const type = (m.type || 'beast').toLowerCase();
  if (cache.has(type)) return cache.get(type)!;
  try {
    const svgs = await loadTokenSvgs();
    const svg = svgs[type] ?? svgs.beast;
    if (!svg || !svg.startsWith('<svg')) return null;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 160, 160);
    const webp = canvas.toDataURL('image/webp', 0.85);
    const out = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
    cache.set(type, out);
    return out;
  } catch {
    return null;
  }
}
