import type { DraftShape } from '../../components/battle/BattleBoard';
import type { CastArea } from '../play/ui';
import type { SceneGrid } from '../../types';
import type { Pt } from './geometry';
import { INK_COLORS } from './table';
import { templateLabel, type TemplateKind } from './templates';

/**
 * A spell's area for the pointer at `p` (squares): from the caster's space when the spell starts
 * there (cones and lines towards the pointer, a cube against the caster on the pointer's side, a
 * self-centred sphere around it), else where the pointer is. Pure.
 */
export function castAreaShape(c: CastArea, p: Pt, grid: Pick<SceneGrid, 'feet' | 'snap'>, caster?: { x: number; y: number; size: number }): DraftShape {
  const feet = grid.feet || 5;
  const n = c.area.f / feet;
  const kind: TemplateKind = c.area.k === 'cone' ? 'cone' : c.area.k === 'line' ? 'beam' : c.area.k === 'cube' ? 'cube' : 'circle';
  const color = c.color ?? INK_COLORS[3];
  const shape = (a: Pt, b: Pt, width?: number): DraftShape => ({ kind, color, points: [a, b], width, label: `${c.spell} · ${templateLabel(kind, a, b, feet)}` });
  if (caster) {
    const h = caster.size / 2;
    const o = { x: caster.x + h, y: caster.y + h };
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    if (kind === 'circle') return shape(o, { x: o.x + n + h, y: o.y });
    if (kind === 'cube') {
      // A cube with one face against the caster, on the side the pointer is.
      if (Math.abs(dx) >= Math.abs(dy)) {
        const sx = Math.sign(dx) || 1;
        const a = { x: o.x + sx * h, y: o.y - n / 2 };
        return shape(a, { x: a.x + sx * n, y: a.y + n });
      }
      const sy = Math.sign(dy) || 1;
      const a = { x: o.x - n / 2, y: o.y + sy * h };
      return shape(a, { x: a.x + n, y: a.y + sy * n });
    }
    // Cones and lines leave from the edge of the caster's space, towards the pointer.
    const a = { x: o.x + ux * h, y: o.y + uy * h };
    return shape(a, { x: a.x + ux * n, y: a.y + uy * n }, kind === 'beam' ? (c.area.w ?? 5) / feet : undefined);
  }
  if (kind === 'circle') {
    const a = grid.snap ? { x: Math.round(p.x), y: Math.round(p.y) } : p;
    return shape(a, { x: a.x + n, y: a.y });
  }
  if (kind === 'cube') {
    const a = grid.snap ? { x: Math.round(p.x - n / 2), y: Math.round(p.y - n / 2) } : { x: p.x - n / 2, y: p.y - n / 2 };
    return shape(a, { x: a.x + n, y: a.y + n });
  }
  return shape(p, { x: p.x + n, y: p.y }, kind === 'beam' ? (c.area.w ?? 5) / feet : undefined);
}
