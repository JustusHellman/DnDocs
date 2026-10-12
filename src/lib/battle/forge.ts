/**
 * Battlemap Forge inside DnDocs. The Forge stays its own little site (one copy of the code, also
 * usable without DnDocs); DnDocs opens it full screen and the two talk with window messages:
 *
 *   Forge → DnDocs  { type: 'forge:ready' }                   loaded, waiting for hello
 *   DnDocs → Forge  { type: 'dndocs:hello', map?, fresh?, name? }   the map to edit (if any)
 *   Forge → DnDocs  { type: 'forge:send', uvtt, map }        the finished map (a Universal VTT
 *                                                             object, WebP image) + its editable file
 *   DnDocs → Forge  { type: 'dndocs:received', ok, error? }
 *
 * Both sides check who they're talking to (origin + window). The editable map file (a few KB,
 * compressed) is kept in the battle map's DM-only part, so "Edit in Battlemap Forge" reopens it.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Entity, Scene, SceneGrid, User } from '../../types';
import { DEFAULT_GRID, type UvttImport } from './geometry';
import { createScene, importUvttMap, newScene, updateScene } from './sceneService';

/** Where the Forge lives. On GitHub Pages it's the same site as DnDocs (…github.io/BattlemapForge/). */
export const FORGE_URL: string = (import.meta.env.VITE_FORGE_URL as string | undefined) || 'https://justushellman.github.io/BattlemapForge/';
export const FORGE_ORIGIN = new URL(FORGE_URL, location.href).origin;

export function forgeFrameUrl() {
  const u = new URL(FORGE_URL, location.href);
  u.searchParams.set('embed', 'dndocs');
  return u.toString();
}

const forgeDoc = (sceneId: string) => doc(db, 'scenes', sceneId, 'secret', 'forge');

/** gzip + base64 where the browser can; plain JSON otherwise. */
export async function packForgeMap(map: unknown): Promise<string> {
  const json = JSON.stringify(map);
  if (typeof CompressionStream === 'undefined') return `json:${json}`;
  const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `gz:${btoa(bin)}`;
}

export async function unpackForgeMap(packed: string): Promise<unknown> {
  if (packed.startsWith('json:')) return JSON.parse(packed.slice(5));
  if (!packed.startsWith('gz:')) throw new Error('Unknown map file format');
  const bytes = Uint8Array.from(atob(packed.slice(3)), (c) => c.charCodeAt(0));
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text);
}

/** The editable Forge map of a battle map, if it was made in the Forge. */
export async function loadForgeMap(sceneId: string): Promise<unknown | null> {
  const snap = await getDoc(forgeDoc(sceneId));
  if (!snap.exists()) return null;
  return unpackForgeMap(String(snap.data().data ?? ''));
}

/**
 * Put a map (from a .dd2vtt file or the Forge) on an entry's battle map: image, grid, walls and
 * doors. Creates the battle map if there isn't one. Tokens and drawings stay. Painted fog and open
 * doors are kept when they still fit (same grid, same doors) — so a small edit in the Forge doesn't
 * undo the DM's fog.
 */
export async function applyMapToBattle(opts: { entity: Entity; scene: Scene | null; uvtt: UvttImport; user: Pick<User, 'uid'>; forgeMap?: unknown; grid?: SceneGrid }) {
  const { entity, scene, uvtt, user, forgeMap } = opts;
  const res = await importUvttMap(entity, uvtt, user);
  const grid: SceneGrid = { ...(opts.grid ?? scene?.grid ?? DEFAULT_GRID), ...res.grid };
  const now = new Date().toISOString();
  const packed = forgeMap ? await packForgeMap(forgeMap) : null;
  if (!scene) {
    await createScene({ ...newScene(entity, grid), mediaId: res.mediaId, walls: res.walls, doors: res.doors, ...(packed ? { forgeAt: now } : {}) });
  } else {
    const sameGrid = scene.grid.cols === grid.cols && scene.grid.ox === grid.ox && scene.grid.oy === grid.oy;
    const sameDoors = scene.doors === res.doors;
    await updateScene(scene.id, {
      mediaId: res.mediaId,
      grid,
      walls: res.walls,
      doors: res.doors,
      ...(sameDoors ? {} : { openDoors: [] }),
      ...(sameGrid ? {} : { 'fog.revealed': '', 'fog.cols': 0, 'fog.rows': 0 }),
      ...(packed ? { forgeAt: now } : {}),
    });
  }
  if (packed) await setDoc(forgeDoc(entity.id), { campaignId: entity.campaignId, data: packed, savedAt: now });
  return res;
}

/** A box on a map, in percent of its width and height. */
export interface MapArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Cut a box out of a map image (for "Battle here → on a part of this map"). Small pieces are
 * enlarged to about 1200 px with smooth scaling so the battle map isn't a blur of big pixels;
 * the result is never larger than `max`.
 */
export async function cropMapArea(src: string, area: MapArea, max = 2400): Promise<{ image: string; w: number; h: number }> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const sx = (area.x / 100) * nw;
  const sy = (area.y / 100) * nh;
  const sw = Math.max(1, (area.w / 100) * nw);
  const sh = Math.max(1, (area.h / 100) * nh);
  const long = Math.max(sw, sh);
  const k = Math.min(max, Math.max(long, Math.min(1200, max))) / long;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext('2d');
  if (!g) throw new Error('This browser can’t cut the map.');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return { image: c.toDataURL('image/webp', 0.85), w: c.width, h: c.height };
}
