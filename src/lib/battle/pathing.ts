/**
 * Walking distance on the grid: the shortest path from square to square that doesn't pass through
 * walls or closed doors (A* over squares, 8 directions). Without walls this equals the straight
 * grid distance, so it works for plain images and for imported .dd2vtt maps alike.
 */
import type { SceneGrid } from '../../types';
import type { Pt } from './geometry';

type Seg = [number, number, number, number];

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Do segments p1-p2 and q1-q2 properly cross (touching an end point counts as crossing). */
export function segmentsCross(p1x: number, p1y: number, p2x: number, p2y: number, s: Seg): boolean {
  const d1 = cross(s[0], s[1], s[2], s[3], p1x, p1y);
  const d2 = cross(s[0], s[1], s[2], s[3], p2x, p2y);
  const d3 = cross(p1x, p1y, p2x, p2y, s[0], s[1]);
  const d4 = cross(p1x, p1y, p2x, p2y, s[2], s[3]);
  const eps = 1e-9;
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps) || Math.abs(d3) <= eps || Math.abs(d4) <= eps);
}

/** Walls sorted into buckets per square, so a move only checks the walls near it. */
export class WallIndex {
  private buckets = new Map<string, Seg[]>();
  readonly empty: boolean;
  constructor(segments: Seg[]) {
    this.empty = segments.length === 0;
    for (const s of segments) {
      const x0 = Math.floor(Math.min(s[0], s[2])) - 1;
      const x1 = Math.floor(Math.max(s[0], s[2])) + 1;
      const y0 = Math.floor(Math.min(s[1], s[3])) - 1;
      const y1 = Math.floor(Math.max(s[1], s[3])) + 1;
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const k = `${x},${y}`;
          const b = this.buckets.get(k);
          if (b) b.push(s);
          else this.buckets.set(k, [s]);
        }
    }
  }
  /** Is the straight step between two square centres blocked? */
  blocked(ax: number, ay: number, bx: number, by: number): boolean {
    if (this.empty) return false;
    const seen = new Set<Seg>();
    for (const [cx, cy] of [
      [ax, ay],
      [bx, by],
    ]) {
      for (const s of this.buckets.get(`${cx},${cy}`) ?? []) {
        if (seen.has(s)) continue;
        seen.add(s);
        if (segmentsCross(ax + 0.5, ay + 0.5, bx + 0.5, by + 0.5, s)) return true;
      }
    }
    return false;
  }
}

export interface WalkResult {
  feet: number;
  /** Square centres along the way (including both ends). */
  path: Pt[];
  /** True when walls made the path longer than the straight distance. */
  detour: boolean;
  /** No way through (fully walled off): the straight distance is given instead. */
  blocked: boolean;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Shortest walk between the squares containing `from` and `to`. `bounds` keeps the search on the
 * map. Diagonal steps may not cut a wall corner (both side steps must be open).
 */
export function walk(from: Pt, to: Pt, walls: WallIndex, grid: Pick<SceneGrid, 'feet' | 'diagonal'>, bounds: { x0: number; y0: number; x1: number; y1: number }): WalkResult {
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  const tx = Math.floor(to.x);
  const ty = Math.floor(to.y);
  const straight = gridSteps(Math.abs(tx - sx), Math.abs(ty - sy), grid.diagonal);
  const direct = () => ({
    feet: Math.round(straight * grid.feet),
    path: [
      { x: sx + 0.5, y: sy + 0.5 },
      { x: tx + 0.5, y: ty + 0.5 },
    ],
    detour: false,
  });
  if (sx === tx && sy === ty) return { ...direct(), blocked: false };
  if (walls.empty) return { ...direct(), blocked: false };
  // A straight run that crosses no wall needs no search.
  if (!lineBlocked(sx, sy, tx, ty, walls)) return { ...direct(), blocked: false };
  // Tokens can stand off the fog board; search an area that holds both ends.
  bounds = { x0: Math.min(bounds.x0, sx, tx) - 1, y0: Math.min(bounds.y0, sy, ty) - 1, x1: Math.max(bounds.x1, sx + 1, tx + 1) + 1, y1: Math.max(bounds.y1, sy + 1, ty + 1) + 1 };

  // A* with the diagonal parity in the state (needed for the 5-10-5 rule).
  const alt = grid.diagonal === 'alt';
  const euclid = grid.diagonal === 'euclid';
  const key = (x: number, y: number, p: number) => (((x - bounds.x0) * 4096 + (y - bounds.y0)) << 1) | p;
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const pos = new Map<number, [number, number, number]>();
  const h = (x: number, y: number) => gridSteps(Math.abs(tx - x), Math.abs(ty - y), grid.diagonal === 'alt' ? '5e' : grid.diagonal);
  // Small binary heap.
  const heap: [number, number][] = [];
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const start = key(sx, sy, 0);
  g.set(start, 0);
  pos.set(start, [sx, sy, 0]);
  push(h(sx, sy), start);
  let goal: number | null = null;
  let guard = 0;
  while (heap.length && guard++ < 200_000) {
    const [, k] = pop();
    const [x, y, p] = pos.get(k)!;
    if (x === tx && y === ty) {
      goal = k;
      break;
    }
    const gk = g.get(k)!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < bounds.x0 || ny < bounds.y0 || nx >= bounds.x1 || ny >= bounds.y1) continue;
      const diag = dx !== 0 && dy !== 0;
      if (walls.blocked(x, y, nx, ny)) continue;
      if (diag && (walls.blocked(x, y, nx, y) || walls.blocked(x, y, x, ny) || walls.blocked(nx, y, nx, ny) || walls.blocked(x, ny, nx, ny))) continue;
      const cost = !diag ? 1 : euclid ? Math.SQRT2 : alt ? (p ? 2 : 1) : 1;
      const np = diag && alt ? p ^ 1 : p;
      const nk = key(nx, ny, np);
      const ng = gk + cost;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, k);
        pos.set(nk, [nx, ny, np]);
        push(ng + h(nx, ny), nk);
      }
    }
  }
  if (goal === null) return { ...direct(), blocked: true };
  const path: Pt[] = [];
  for (let k: number | undefined = goal; k !== undefined; k = came.get(k)) {
    const [x, y] = pos.get(k)!;
    path.unshift({ x: x + 0.5, y: y + 0.5 });
  }
  const steps = g.get(goal)!;
  return { feet: Math.round(steps * grid.feet), path: simplifyPath(path), detour: steps > straight + 1e-9, blocked: false };
}

/** Grid steps between two squares under a diagonal rule. */
export function gridSteps(dx: number, dy: number, rule: SceneGrid['diagonal']): number {
  if (rule === 'euclid') return Math.hypot(dx, dy);
  const diag = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diag;
  return rule === 'alt' ? straight + diag + Math.floor(diag / 2) : straight + diag;
}

function lineBlocked(sx: number, sy: number, tx: number, ty: number, walls: WallIndex): boolean {
  // Walk the squares the straight line passes and test each hop.
  const n = Math.max(Math.abs(tx - sx), Math.abs(ty - sy));
  let px = sx;
  let py = sy;
  for (let i = 1; i <= n; i++) {
    const x = Math.round(sx + ((tx - sx) * i) / n);
    const y = Math.round(sy + ((ty - sy) * i) / n);
    if (walls.blocked(px, py, x, y)) return true;
    px = x;
    py = y;
  }
  return false;
}

/** Drop points in the middle of straight runs (fewer points to draw). */
function simplifyPath(path: Pt[]): Pt[] {
  if (path.length < 3) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1];
    const b = path[i];
    const c = path[i + 1];
    if ((b.x - a.x) * (c.y - b.y) !== (b.y - a.y) * (c.x - b.x)) out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}
