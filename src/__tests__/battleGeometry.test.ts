import { describe, expect, it } from 'vitest';
import {
  blockingSegments,
  boardOf,
  decodeNums,
  distanceFeet,
  encodeNums,
  FogMask,
  healthOf,
  initiativeOrder,
  nextTurn,
  parseUvtt,
  percentToCells,
  simplify,
  snapTokenCorner,
  visibilityPolygon,
} from '../lib/battle/geometry';

const grid = { feet: 5, diagonal: '5e' as const };

describe('grid', () => {
  it('maps image percentages to squares, with the grid offset', () => {
    const board = boardOf({ cols: 20, ox: 0.5, oy: 0 }, 2000, 1000);
    // Fog squares include the half square at the left edge.
    expect(board).toMatchObject({ w: 20, h: 10, left: -0.5, top: 0, fx: -1, fy: 0, cols: 21, rows: 10 });
    expect(boardOf({ cols: 20, ox: 0, oy: 0 }, 2000, 1000)).toMatchObject({ fx: 0, cols: 20, rows: 10 });
    expect(percentToCells(board, 0, 0)).toEqual({ x: -0.5, y: 0 });
    expect(percentToCells(board, 50, 50)).toEqual({ x: 9.5, y: 5 });
  });
  it('snaps tokens to whole squares (half squares when tiny)', () => {
    expect(snapTokenCorner({ x: 3.4, y: 2.9 }, 1, true)).toEqual({ x: 3, y: 2 });
    expect(snapTokenCorner({ x: 3.4, y: 2.9 }, 2, true)).toEqual({ x: 2, y: 2 });
    expect(snapTokenCorner({ x: 3.4, y: 2.9 }, 0.5, true)).toEqual({ x: 3, y: 2.5 });
    expect(snapTokenCorner({ x: 3.4, y: 2.9 }, 1, false)).toEqual({ x: 2.9, y: 2.4 });
  });
});

describe('measuring', () => {
  it('counts every diagonal as one square in 5e', () => {
    expect(distanceFeet({ x: 0, y: 0 }, { x: 3, y: 3 }, grid)).toBe(15);
    expect(distanceFeet({ x: 0, y: 0 }, { x: 6, y: 2 }, grid)).toBe(30);
  });
  it('supports the 5-10-5 rule and straight lines', () => {
    expect(distanceFeet({ x: 0, y: 0 }, { x: 3, y: 3 }, { feet: 5, diagonal: 'alt' })).toBe(20);
    expect(distanceFeet({ x: 0, y: 0 }, { x: 3, y: 4 }, { feet: 5, diagonal: 'euclid' })).toBe(25);
  });
});

describe('compact storage', () => {
  it('round-trips number lists', () => {
    expect(decodeNums(encodeNums([1, 2.345, -3]))).toEqual([1, 2.35, -3]);
    expect(decodeNums('')).toEqual([]);
  });
  it('treats open doors as passable', () => {
    expect(blockingSegments('0,0,1,0', '1,0,2,0,2,0,3,0', [1])).toEqual([
      [0, 0, 1, 0],
      [1, 0, 2, 0],
    ]);
  });
  it('fog masks round-trip and paint circles of squares', () => {
    const f = new FogMask(10, 8);
    f.paint({ x: 5, y: 4 }, 1, true);
    expect(f.get(4, 3) && f.get(5, 4) && f.get(4, 4) && f.get(5, 3)).toBe(true);
    expect(f.get(0, 0)).toBe(false);
    const back = FogMask.decode(f.encode(), 10, 8);
    expect(back.get(5, 4)).toBe(true);
    expect(back.path(true)).toContain('M');
    // A mask for a different size is ignored rather than misread.
    expect(FogMask.decode(f.encode(), 20, 20).get(5, 4)).toBe(false);
  });
  it('simplifies freehand lines', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i / 10, y: 0 }));
    expect(simplify(line)).toHaveLength(2);
  });
});

describe('line of sight', () => {
  const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const inside = (poly: { x: number; y: number }[], p: { x: number; y: number }) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  it('sees everything in an empty room', () => {
    const poly = visibilityPolygon({ x: 5, y: 5 }, [], bounds);
    expect(inside(poly, { x: 1, y: 1 })).toBe(true);
    expect(inside(poly, { x: 9, y: 9 })).toBe(true);
  });
  it('does not see through a wall', () => {
    const wall: [number, number, number, number] = [6, 0, 6, 10];
    const poly = visibilityPolygon({ x: 3, y: 5 }, [wall], bounds);
    expect(inside(poly, { x: 5, y: 5 })).toBe(true);
    expect(inside(poly, { x: 8, y: 5 })).toBe(false);
  });
  it('sees through a gap in a wall, but not around the corner', () => {
    const walls: [number, number, number, number][] = [
      [6, 0, 6, 4],
      [6, 6, 6, 10],
    ];
    const poly = visibilityPolygon({ x: 3, y: 5 }, walls, bounds);
    expect(inside(poly, { x: 8, y: 5 })).toBe(true);
    expect(inside(poly, { x: 9, y: 1 })).toBe(false);
  });
  it('limits sight to the vision range', () => {
    const poly = visibilityPolygon({ x: 5, y: 5 }, [], bounds, 2);
    expect(inside(poly, { x: 6, y: 5 })).toBe(true);
    expect(inside(poly, { x: 9, y: 5 })).toBe(false);
  });
});

describe('Universal VTT import', () => {
  it('reads size, walls (as segments) and doors', () => {
    const file = JSON.stringify({
      format: 0.3,
      resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 12, y: 8 }, pixels_per_grid: 70 },
      line_of_sight: [
        [
          { x: 1, y: 1 },
          { x: 5, y: 1 },
          { x: 5, y: 4 },
        ],
      ],
      portals: [{ bounds: [{ x: 2, y: 4 }, { x: 3, y: 4 }], closed: true }],
      image: 'iVBORw0KGgo',
    });
    const u = parseUvtt(file);
    expect(u).toMatchObject({ cols: 12, rows: 8, walls: [1, 1, 5, 1, 5, 1, 5, 4], doors: [2, 4, 3, 4] });
    expect(u.image.startsWith('data:image/png;base64,')).toBe(true);
  });
  it('rejects files that are not maps', () => {
    expect(() => parseUvtt('{"hello":1}')).toThrow();
    expect(() => parseUvtt('not json')).toThrow();
  });
});

describe('initiative', () => {
  const t = (id: string, initiative: number | null) => ({ id, name: id, initiative });
  it('orders by roll and wraps into a new round', () => {
    const order = initiativeOrder([t('a', 12), t('b', 18), t('c', null), t('d', 12)]);
    expect(order.map((x) => x.id)).toEqual(['b', 'a', 'd']);
    expect(nextTurn(order, null, 0)).toEqual({ turn: 'b', round: 1 });
    expect(nextTurn(order, 'a', 1)).toEqual({ turn: 'd', round: 1 });
    expect(nextTurn(order, 'd', 1)).toEqual({ turn: 'b', round: 2 });
  });
  it('shows monster health as words', () => {
    expect(healthOf(10, 10)).toBe('healthy');
    expect(healthOf(5, 10)).toBe('bloodied');
    expect(healthOf(0, 10)).toBe('down');
  });
});

describe('fog helpers', () => {
  it('knows whether a point is inside a polygon', async () => {
    const { pointInPolygon } = await import('../lib/battle/geometry');
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 2 }, square)).toBe(false);
  });
});

describe('passing the turn', () => {
  it('skips downed monsters and removed tokens, and starts a new round at the end', async () => {
    const { nextTurnIn } = await import('../lib/battle/geometry');
    const order = ['pc', 'wolf1', 'gone', 'wolf2'];
    const skip = (id: string) => id === 'wolf1' || id === 'gone';
    expect(nextTurnIn(order, 'pc', 1, skip)).toEqual({ turn: 'wolf2', round: 1 });
    expect(nextTurnIn(order, 'wolf2', 1, skip)).toEqual({ turn: 'pc', round: 2 });
    // The current token itself was removed: carry on after its place.
    expect(nextTurnIn(order, 'gone', 2, skip)).toEqual({ turn: 'wolf2', round: 2 });
    // Not started yet, or the current id is unknown: from the top, same round.
    expect(nextTurnIn(order, null, 0, skip)).toEqual({ turn: 'pc', round: 1 });
    // Everything skipped: nothing changes.
    expect(nextTurnIn(['a'], 'a', 3, () => true)).toEqual({ turn: 'a', round: 3 });
  });
});
