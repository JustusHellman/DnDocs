/** Spell area templates (5e): sphere/circle, cone, line, cube. Points are in squares. */
import type { Pt } from './geometry';

export type TemplateKind = 'circle' | 'cone' | 'beam' | 'cube';

/** The outline of a template from its origin `a` to the point `b` the user dragged to. */
export function templatePolygon(kind: TemplateKind, a: Pt, b: Pt, width = 1): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [];
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  if (kind === 'cone') {
    // 5e: as wide at its end as it is long.
    return [a, { x: b.x + (px * len) / 2, y: b.y + (py * len) / 2 }, { x: b.x - (px * len) / 2, y: b.y - (py * len) / 2 }];
  }
  if (kind === 'beam') {
    const w = width / 2;
    return [
      { x: a.x + px * w, y: a.y + py * w },
      { x: b.x + px * w, y: b.y + py * w },
      { x: b.x - px * w, y: b.y - py * w },
      { x: a.x - px * w, y: a.y - py * w },
    ];
  }
  if (kind === 'cube') {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    const sx = Math.sign(dx) || 1;
    const sy = Math.sign(dy) || 1;
    return [a, { x: a.x + side * sx, y: a.y }, { x: a.x + side * sx, y: a.y + side * sy }, { x: a.x, y: a.y + side * sy }];
  }
  // circle: a 48-sided polygon (only used for "which squares are inside")
  const out: Pt[] = [];
  for (let i = 0; i < 48; i++) out.push({ x: a.x + Math.cos((i / 48) * Math.PI * 2) * len, y: a.y + Math.sin((i / 48) * Math.PI * 2) * len });
  return out;
}

/** The template's size in squares (radius, length or side), rounded to whole squares when snapping. */
export function templateSize(kind: TemplateKind, a: Pt, b: Pt): number {
  if (kind === 'cube') return Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Snap the origin (see below) and the size to whole squares, keeping the direction. */
export function snapTemplate(kind: TemplateKind, a: Pt, b: Pt): { a: Pt; b: Pt } {
  // Lines leave from the middle of a square's side (so they run along a row or column of squares);
  // everything else from a grid corner.
  let sa = { x: Math.round(a.x), y: Math.round(a.y) };
  if (kind === 'beam') {
    const c1 = { x: Math.floor(a.x) + 0.5, y: Math.round(a.y) };
    const c2 = { x: Math.round(a.x), y: Math.floor(a.y) + 0.5 };
    sa = Math.hypot(c1.x - a.x, c1.y - a.y) < Math.hypot(c2.x - a.x, c2.y - a.y) ? c1 : c2;
  }
  if (kind === 'cube') {
    const side = Math.max(1, Math.round(Math.max(Math.abs(b.x - sa.x), Math.abs(b.y - sa.y))));
    return { a: sa, b: { x: sa.x + side * (Math.sign(b.x - sa.x) || 1), y: sa.y + side * (Math.sign(b.y - sa.y) || 1) } };
  }
  const len = Math.hypot(b.x - sa.x, b.y - sa.y);
  if (len < 1e-6) return { a: sa, b: sa };
  const n = Math.max(1, Math.round(len));
  return { a: sa, b: { x: sa.x + ((b.x - sa.x) / len) * n, y: sa.y + ((b.y - sa.y) / len) * n } };
}

export function templateLabel(kind: TemplateKind, a: Pt, b: Pt, feet: number): string {
  const ft = Math.round(templateSize(kind, a, b) * feet);
  return kind === 'circle' ? `${ft} ft radius` : kind === 'cone' ? `${ft} ft cone` : kind === 'beam' ? `${ft} ft line` : `${ft} ft cube`;
}

/** Squares whose centre is inside the polygon (the usual way to tell who's caught in an area). */
export function squaresIn(poly: Pt[]): Pt[] {
  if (poly.length < 3) return [];
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const out: Pt[] = [];
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      const c = { x: x + 0.5, y: y + 0.5 };
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const p = poly[i];
        const q = poly[j];
        if (p.y > c.y !== q.y > c.y && c.x < ((q.x - p.x) * (c.y - p.y)) / (q.y - p.y) + p.x) inside = !inside;
      }
      if (inside) out.push({ x, y });
    }
  return out;
}
