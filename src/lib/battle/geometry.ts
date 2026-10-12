/**
 * Battle map geometry. Everything is measured in grid squares ("cells"): grid line k sits at x = k,
 * and the image's left edge is at x = -grid.ox. Pure functions, no Firestore or DOM.
 */
import type { SceneGrid } from '../../types';

export interface Pt {
  x: number;
  y: number;
}

export const DEFAULT_GRID: SceneGrid = {
  cols: 20,
  ox: 0,
  oy: 0,
  show: true,
  snap: true,
  feet: 5,
  diagonal: '5e',
  color: '#1b130c',
  opacity: 0.35,
};

/** The image's extent in squares. */
export interface Board {
  /** Image size in squares. */
  w: number;
  h: number;
  /** Left / top edge of the image in squares (≤ 0). */
  left: number;
  top: number;
  /** Fog squares: every square at least partly on the image, starting at (fx, fy). */
  fx: number;
  fy: number;
  cols: number;
  rows: number;
}

export function boardOf(grid: Pick<SceneGrid, 'cols' | 'ox' | 'oy'>, imgW: number, imgH: number): Board {
  const w = Math.max(1, grid.cols);
  const h = (imgH / imgW) * w;
  const left = -grid.ox || 0;
  const top = -grid.oy || 0;
  const fx = Math.floor(left + 1e-9);
  const fy = Math.floor(top + 1e-9);
  return { w, h, left, top, fx, fy, cols: Math.max(1, Math.ceil(left + w - 1e-9) - fx), rows: Math.max(1, Math.ceil(top + h - 1e-9) - fy) };
}

/** Percent position on the image (0–100) → squares. */
export function percentToCells(board: Board, px: number, py: number): Pt {
  return { x: board.left + (px / 100) * board.w, y: board.top + (py / 100) * board.h };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** A token's top-left corner, snapped so it sits in whole squares (half squares for tiny tokens). */
export function snapTokenCorner(p: Pt, size: number, snap: boolean): Pt {
  if (!snap) return { x: round2(p.x - size / 2), y: round2(p.y - size / 2) };
  const step = size < 1 ? 0.5 : 1;
  return { x: Math.round((p.x - size / 2) / step) * step, y: Math.round((p.y - size / 2) / step) * step };
}

/** Centre of the square a point is in. */
export function snapToCellCenter(p: Pt): Pt {
  return { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 };
}

/** Distance in feet between two points, using the campaign's diagonal rule. */
export function distanceFeet(a: Pt, b: Pt, grid: Pick<SceneGrid, 'feet' | 'diagonal'>): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (grid.diagonal === 'euclid') return Math.round(Math.hypot(dx, dy) * grid.feet);
  const sx = Math.round(dx);
  const sy = Math.round(dy);
  const diag = Math.min(sx, sy);
  const straight = Math.max(sx, sy) - diag;
  if (grid.diagonal === 'alt') return (straight + diag + Math.floor(diag / 2)) * grid.feet;
  return (straight + diag) * grid.feet;
}

// ---------------------------------------------------------------------------
// Compact number lists ("x1,y1,x2,y2,…"): stored as strings so big wall sets don't create
// thousands of index entries in Firestore.
// ---------------------------------------------------------------------------

export function encodeNums(nums: number[]): string {
  return nums.map((n) => String(round2(n))).join(',');
}

export function decodeNums(s: string | undefined | null): number[] {
  if (!s) return [];
  const out: number[] = [];
  for (const part of s.split(',')) {
    const n = Number(part);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Flat segment list → [x1, y1, x2, y2] tuples. */
export function segmentsOf(flat: number[]): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let i = 0; i + 3 < flat.length; i += 4) out.push([flat[i], flat[i + 1], flat[i + 2], flat[i + 3]]);
  return out;
}

/** Walls plus the doors that are currently closed. */
export function blockingSegments(walls: string, doors: string, openDoors: number[]): [number, number, number, number][] {
  const open = new Set(openDoors);
  return [...segmentsOf(decodeNums(walls)), ...segmentsOf(decodeNums(doors)).filter((_, i) => !open.has(i))];
}

// ---------------------------------------------------------------------------
// Line of sight: visibility polygon by casting rays at every wall end point.
// ---------------------------------------------------------------------------

function raySegment(o: Pt, dx: number, dy: number, s: [number, number, number, number]): number | null {
  const sx = s[2] - s[0];
  const sy = s[3] - s[1];
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((s[0] - o.x) * sy - (s[1] - o.y) * sx) / den;
  const u = ((s[0] - o.x) * dy - (s[1] - o.y) * dx) / den;
  if (t < 0 || u < -1e-9 || u > 1 + 1e-9) return null;
  return t;
}

/**
 * The area visible from `origin`, as a polygon. `bounds` keeps rays on the map; `radius` (squares)
 * limits how far it reaches (0 = no limit).
 */
export function visibilityPolygon(
  origin: Pt,
  segments: [number, number, number, number][],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  radius = 0,
): Pt[] {
  let { minX, minY, maxX, maxY } = bounds;
  const segs: [number, number, number, number][] = [];
  if (radius > 0) {
    minX = Math.max(minX, origin.x - radius);
    minY = Math.max(minY, origin.y - radius);
    maxX = Math.min(maxX, origin.x + radius);
    maxY = Math.min(maxY, origin.y + radius);
    // The range circle as a 40-sided polygon of walls.
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      segs.push([origin.x + Math.cos(a0) * radius, origin.y + Math.sin(a0) * radius, origin.x + Math.cos(a1) * radius, origin.y + Math.sin(a1) * radius]);
    }
  }
  // Only walls that can matter.
  for (const s of segments) {
    if (Math.max(s[0], s[2]) < minX || Math.min(s[0], s[2]) > maxX || Math.max(s[1], s[3]) < minY || Math.min(s[1], s[3]) > maxY) continue;
    segs.push(s);
  }
  segs.push([minX, minY, maxX, minY], [maxX, minY, maxX, maxY], [maxX, maxY, minX, maxY], [minX, maxY, minX, minY]);

  const angles: number[] = [];
  for (const s of segs) {
    for (const [px, py] of [
      [s[0], s[1]],
      [s[2], s[3]],
    ]) {
      const a = Math.atan2(py - origin.y, px - origin.x);
      angles.push(a - 1e-4, a, a + 1e-4);
    }
  }
  const hits: { a: number; p: Pt }[] = [];
  for (const a of angles) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = Infinity;
    for (const s of segs) {
      const t = raySegment(origin, dx, dy, s);
      if (t !== null && t < best) best = t;
    }
    if (best < Infinity) hits.push({ a, p: { x: origin.x + dx * best, y: origin.y + dy * best } });
  }
  hits.sort((p, q) => p.a - q.a);
  return hits.map((h) => h.p);
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonPath(points: Pt[]): string {
  if (points.length < 3) return '';
  return `M${points.map((p) => `${round2(p.x)} ${round2(p.y)}`).join('L')}Z`;
}

// ---------------------------------------------------------------------------
// Manual fog: one bit per square, stored as base64.
// ---------------------------------------------------------------------------

export class FogMask {
  readonly bits: Uint8Array;
  constructor(
    readonly cols: number,
    readonly rows: number,
    bits?: Uint8Array,
  ) {
    this.bits = bits && bits.length === Math.ceil((cols * rows) / 8) ? bits : new Uint8Array(Math.ceil((cols * rows) / 8));
  }

  static decode(b64: string | undefined, cols: number, rows: number): FogMask {
    if (!b64) return new FogMask(cols, rows);
    try {
      const raw = atob(b64);
      const bits = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bits[i] = raw.charCodeAt(i);
      return new FogMask(cols, rows, bits);
    } catch {
      return new FogMask(cols, rows);
    }
  }

  encode(): string {
    let s = '';
    for (const b of this.bits) s += String.fromCharCode(b);
    return btoa(s);
  }

  get(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    const i = r * this.cols + c;
    return (this.bits[i >> 3] & (1 << (i & 7))) !== 0;
  }

  set(c: number, r: number, on: boolean) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return;
    const i = r * this.cols + c;
    if (on) this.bits[i >> 3] |= 1 << (i & 7);
    else this.bits[i >> 3] &= ~(1 << (i & 7));
  }

  fill(on: boolean) {
    this.bits.fill(on ? 255 : 0);
  }

  clone(): FogMask {
    return new FogMask(this.cols, this.rows, new Uint8Array(this.bits));
  }

  /** Every square whose centre is within `radius` squares of the point. */
  paint(p: Pt, radius: number, on: boolean) {
    const r = Math.max(0.5, radius);
    for (let row = Math.floor(p.y - r); row <= Math.ceil(p.y + r); row++) {
      for (let col = Math.floor(p.x - r); col <= Math.ceil(p.x + r); col++) {
        if (Math.hypot(col + 0.5 - p.x, row + 0.5 - p.y) <= r) this.set(col, row, on);
      }
    }
  }

  /** SVG path covering every square with the given state (runs merged along rows). */
  path(state: boolean): string {
    let d = '';
    for (let r = 0; r < this.rows; r++) {
      let start = -1;
      for (let c = 0; c <= this.cols; c++) {
        const match = c < this.cols && this.get(c, r) === state;
        if (match && start < 0) start = c;
        if (!match && start >= 0) {
          d += `M${start} ${r}h${c - start}v1h${start - c}Z`;
          start = -1;
        }
      }
    }
    return d;
  }
}

// ---------------------------------------------------------------------------
// Drawings
// ---------------------------------------------------------------------------

/** Ramer–Douglas–Peucker: fewer points for freehand lines, same shape. */
export function simplify(points: Pt[], tolerance = 0.05): Pt[] {
  if (points.length <= 2) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  let index = -1;
  let maxDist = 0;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= tolerance) return [a, b];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

export function pointsOf(s: string): Pt[] {
  const n = decodeNums(s);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
  return out;
}

export function encodePoints(points: Pt[]): string {
  return encodeNums(points.flatMap((p) => [p.x, p.y]));
}

// ---------------------------------------------------------------------------
// Universal VTT (.dd2vtt) files, as exported by BattlemapForge, Dungeondraft, DungeonFog…
// ---------------------------------------------------------------------------

export interface UvttImport {
  /** data: URL of the map image. */
  image: string;
  /** Squares across and down. */
  cols: number;
  rows: number;
  walls: number[];
  doors: number[];
}

type UPt = { x: number; y: number };

export function parseUvtt(text: string): UvttImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Universal VTT (.dd2vtt) map.');
  }
  return parseUvttData(data);
}

/** The same, from the parsed object (Battlemap Forge sends it straight over). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseUvttData(data: any): UvttImport {
  const size = data?.resolution?.map_size;
  const origin: UPt = data?.resolution?.map_origin ?? { x: 0, y: 0 };
  if (!size || !(size.x > 0) || !(size.y > 0) || typeof data.image !== 'string') throw new Error('That file is missing the map size or image.');
  const ox = Number(origin.x) || 0;
  const oy = Number(origin.y) || 0;
  const walls: number[] = [];
  const addPolyline = (line: unknown, out: number[]) => {
    if (!Array.isArray(line)) return;
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i] as UPt;
      const b = line[i + 1] as UPt;
      if (![a?.x, a?.y, b?.x, b?.y].every((n) => Number.isFinite(Number(n)))) continue;
      out.push(Number(a.x) - ox, Number(a.y) - oy, Number(b.x) - ox, Number(b.y) - oy);
    }
  };
  for (const line of [...(data.line_of_sight ?? []), ...(data.objects_line_of_sight ?? [])]) addPolyline(line, walls);
  const doors: number[] = [];
  for (const p of data.portals ?? []) {
    const b = p?.bounds;
    if (Array.isArray(b) && b.length >= 2) addPolyline([b[0], b[1]], doors);
  }
  const mime = data.image.startsWith('/9j/') ? 'image/jpeg' : data.image.startsWith('UklGR') ? 'image/webp' : 'image/png';
  return { image: data.image.startsWith('data:') ? data.image : `data:${mime};base64,${data.image}`, cols: Number(size.x), rows: Number(size.y), walls, doors };
}

// ---------------------------------------------------------------------------
// Initiative
// ---------------------------------------------------------------------------

export interface InitiativeEntry {
  id: string;
  name: string;
  initiative: number | null;
  /** The DM's order within a tie (higher goes first). Cleared when the initiative changes. */
  initTie?: number | null;
  controlledBy?: string[];
}

/**
 * Highest first. Ties: the DM's chosen order if any, then the players before the monsters, then by
 * name, so every screen shows the same order. Tokens without a roll are left out.
 */
export function initiativeOrder<T extends InitiativeEntry>(tokens: T[]): T[] {
  const player = (t: T) => ((t.controlledBy?.length ?? 0) > 0 ? 1 : 0);
  return tokens
    .filter((t) => t.initiative !== null && t.initiative !== undefined && Number.isFinite(t.initiative))
    .sort((a, b) => b.initiative! - a.initiative! || (b.initTie ?? 0) - (a.initTie ?? 0) || player(b) - player(a) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * The DM moves a creature one place up (-1) or down (+1) in the order. Within a tie only the tie
 * order changes; moving past a different roll gives it that roll (so the numbers still explain
 * the order). Returns the writes: id → { initiative, initTie } for everyone whose place is set.
 */
export function moveInOrder<T extends InitiativeEntry>(order: T[], id: string, dir: -1 | 1): Record<string, { initiative: number; initTie: number }> {
  const i = order.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return {};
  const me = order[i];
  const other = order[j];
  const value = other.initiative!;
  // The tie group it ends up in, in its new order.
  const group = order.filter((t) => t.initiative === value && t.id !== me.id);
  const at = group.findIndex((t) => t.id === other.id);
  // One place up: directly before the neighbour; one place down: directly after it.
  group.splice(dir < 0 ? at : at + 1, 0, me);
  const out: Record<string, { initiative: number; initTie: number }> = {};
  group.forEach((t, k) => (out[t.id] = { initiative: value, initTie: group.length - k }));
  return out;
}

/** The next turn after `current` (wrapping to a new round). */
export function nextTurn<T extends InitiativeEntry>(order: T[], current: string | null, round: number): { turn: string | null; round: number } {
  if (!order.length) return { turn: null, round };
  const i = current ? order.findIndex((t) => t.id === current) : -1;
  if (i < 0) return { turn: order[0].id, round: Math.max(1, round) };
  if (i === order.length - 1) return { turn: order[0].id, round: round + 1 };
  return { turn: order[i + 1].id, round };
}

/**
 * The next turn in a stored order, skipping ids `skip` says to pass over (downed monsters,
 * removed tokens). Wraps into a new round. If everything would be skipped the turn stays put.
 */
export function nextTurnIn(order: string[], current: string | null, round: number, skip: (id: string) => boolean): { turn: string | null; round: number } {
  if (!order.length) return { turn: null, round };
  const start = current ? order.indexOf(current) : -1;
  const first = Math.max(1, round);
  for (let step = 1; step <= order.length; step++) {
    const i = start + step;
    // Passing the end of the list (from a known turn) starts a new round.
    const r = start >= 0 && i >= order.length ? first + 1 : first;
    const id = order[i % order.length];
    if (!skip(id)) return { turn: id, round: r };
  }
  return { turn: current, round };
}

/** What a monster's HP looks like to players. */
export function healthOf(cur: number, max: number): 'healthy' | 'bloodied' | 'down' {
  if (cur <= 0) return 'down';
  if (max > 0 && cur <= max / 2) return 'bloodied';
  return 'healthy';
}

export function abilityMod(score: number | string | undefined): number {
  const n = Number(score);
  return Math.floor(((Number.isFinite(n) ? n : 10) - 10) / 2);
}
