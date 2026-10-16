/**
 * The dice throw, without React: where the dice end up neatly laid out (sorted, in rows that fit
 * the screen), and a small 2D simulation for the chaotic part before that (sliding, spinning,
 * bumping into each other).
 *
 * The bumping is built so it can't run away, however many dice there are:
 *  - every collision loses most of its energy (restitution 0.3) and only pushes dice that are
 *    moving towards each other;
 *  - overlaps are pushed apart a little at a time (capped per step), so a pile of 40 dice eases
 *    apart instead of exploding;
 *  - friction slows everything down continuously, speeds are capped, and slow dice are put to
 *    sleep;
 *  - and the simulation simply stops at a fixed moment: after that every die glides to its spot in
 *    the layout, wherever it was.
 */

export interface TossDie {
  sides: number;
  value: number;
  /** Set aside by advantage / disadvantage. */
  dropped?: boolean;
}

export interface Slot {
  x: number;
  y: number;
  /** Size on screen (px) once laid out. */
  size: number;
  /** In "stacked" layouts: how many dice show this value (the badge), on the one die that stays visible. */
  count?: number;
  /** Stacked away into another die (fades out as it arrives). */
  merged?: boolean;
}

export interface Layout {
  slots: Slot[];
  /** Bottom edge of the laid-out dice (for the total under them). */
  bottom: number;
  stacked: boolean;
}

/** Smallest size dice are laid out at before identical results get stacked ("6 ×4"). */
export const MIN_SIZE = 40;
/** More dice than this are always stacked by result: 60 separate dice are just noise. */
export const STACK_OVER = 30;

/** How big the dice are while flying (px): smaller for big handfuls. */
export function throwSize(n: number, vw: number) {
  const base = Math.max(56, Math.min(96, vw * 0.06));
  const k = n <= 6 ? 1 : n <= 12 ? 0.8 : n <= 24 ? 0.62 : n <= 40 ? 0.5 : 0.4;
  return Math.max(30, base * k);
}

/**
 * The tidy picture after the throw: grouped by kind of die (d20s first), lowest to highest, set-
 * aside dice small and after the kept ones. Each kind starts its own row. Everything fits in a box
 * in the middle of the screen; when even the smallest readable size doesn't fit, identical results
 * stack into one die with a count.
 */
export function layoutDice(dice: TossDie[], vw: number, vh: number, area: { x0: number; x1: number } = { x0: 0, x1: vw }): Layout {
  // `area`: the part of the screen to use (beside an open chat panel, say).
  const aw = area.x1 - area.x0;
  const cx = (area.x0 + area.x1) / 2;
  const boxW = Math.min(aw * 0.8, aw - 32);
  const boxH = vh * 0.42;
  const cy = vh * 0.44;
  const order = dice
    .map((d, i) => ({ d, i }))
    .sort((a, b) => b.d.sides - a.d.sides || Number(!!a.d.dropped) - Number(!!b.d.dropped) || a.d.value - b.d.value);
  const groups: { i: number; d: TossDie }[][] = [];
  for (const o of order) {
    const g = groups[groups.length - 1];
    if (g && g[0].d.sides === o.d.sides) g.push(o);
    else groups.push([o]);
  }

  const tryFit = (cells: { i: number[]; d: TossDie }[][], max: number) => {
    for (let s = Math.round(max); s >= MIN_SIZE; s -= 4) {
      const gap = s * 0.24;
      const cols = Math.max(1, Math.floor((boxW + gap) / (s + gap)));
      const rows = cells.reduce((n, g) => n + Math.ceil(g.length / cols), 0);
      if (rows * (s + gap) - gap <= boxH) return { s, gap, cols, rows };
    }
    return null;
  };
  const place = (cells: { i: number[]; d: TossDie }[][], fit: { s: number; gap: number; cols: number; rows: number }, stacked: boolean): Layout => {
    const { s, gap, cols, rows } = fit;
    const slots: Slot[] = new Array(dice.length);
    const top = cy - (rows * (s + gap) - gap) / 2;
    let row = 0;
    for (const g of cells) {
      for (let k = 0; k < g.length; k += cols) {
        const line = g.slice(k, k + cols);
        const w = line.length * (s + gap) - gap;
        line.forEach((c, j) => {
          const x = cx - w / 2 + j * (s + gap) + s / 2;
          const y = top + row * (s + gap) + s / 2;
          const size = c.d.dropped ? s * 0.62 : s;
          c.i.forEach((idx, m) => {
            slots[idx] = { x, y, size, ...(stacked && m === 0 && c.i.length > 1 ? { count: c.i.length } : {}), ...(m > 0 ? { merged: true } : {}) };
          });
        });
        row++;
      }
    }
    return { slots, bottom: top + rows * (s + gap) - gap, stacked };
  };

  const max = Math.max(MIN_SIZE, Math.min(104, vw * 0.065, aw / 6));
  const single = groups.map((g) => g.map((o) => ({ i: [o.i], d: o.d })));
  // One by one while that's readable; a big pile (or one that would need tiny dice) stacks.
  const fit = dice.length <= STACK_OVER ? tryFit(single, max) : null;
  if (fit) return place(single, fit, false);
  // Too many to show one by one: one die per result, with a count.
  const stackedCells = groups.map((g) => {
    const byValue = new Map<string, { i: number[]; d: TossDie }>();
    for (const o of g) {
      const key = `${o.d.dropped ? 'x' : ''}${o.d.value}`;
      const c = byValue.get(key);
      if (c) c.i.push(o.i);
      else byValue.set(key, { i: [o.i], d: o.d });
    }
    return [...byValue.values()];
  });
  let fit2 = tryFit(stackedCells, max);
  if (!fit2) {
    // Still too many (d100s…): smallest size, as many rows as it takes.
    const gap = MIN_SIZE * 0.24;
    const cols = Math.max(1, Math.floor((boxW + gap) / (MIN_SIZE + gap)));
    fit2 = { s: MIN_SIZE, gap, cols, rows: stackedCells.reduce((n, g) => n + Math.ceil(g.length / cols), 0) };
  }
  return place(stackedCells, fit2, true);
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rotation (degrees) and spin (degrees per second). */
  a: number;
  va: number;
  asleep: boolean;
}

/** Friction: speed falls by e^(-K·t), so a die thrown with speed v slides about v / K pixels. */
export const K = 3.4;
const SPIN_K = 2.6;
const RESTITUTION = 0.3;
const MAX_SPEED = 3200;

/**
 * Dice flying in from one side of the screen (picked at random) towards scattered spots around
 * the middle, spinning. `rand` is injectable for tests.
 */
export function startBodies(n: number, size: number, vw: number, vh: number, rand: () => number = Math.random, centerX = vw / 2): Body[] {
  const side = Math.floor(rand() * 4); // 0 right, 1 bottom, 2 left, 3 top
  const out: Body[] = [];
  const cx = centerX;
  const cy = vh * 0.44;
  const spreadX = Math.min(vw * 0.32, 120 + n * size * 0.35);
  const spreadY = Math.min(vh * 0.2, 80 + n * size * 0.2);
  for (let i = 0; i < n; i++) {
    const along = 0.25 + rand() * 0.5;
    const start =
      side === 0 ? { x: vw + size, y: vh * along } : side === 1 ? { x: vw * along, y: vh + size } : side === 2 ? { x: -size, y: vh * along } : { x: vw * along, y: -size };
    // A bit past the middle: the dice skid back into the gap and bump each other on the way.
    const tx = cx + (rand() - 0.5) * 2 * spreadX;
    const ty = cy + (rand() - 0.5) * 2 * spreadY;
    out.push({
      x: start.x,
      y: start.y,
      vx: (tx - start.x) * K * (0.95 + rand() * 0.15),
      vy: (ty - start.y) * K * (0.95 + rand() * 0.15),
      a: rand() * 360,
      va: (rand() < 0.5 ? -1 : 1) * (500 + rand() * 700),
      asleep: false,
    });
  }
  return out;
}

/** One small step of the simulation (dt in seconds; call with ~1/120). */
export function stepBodies(bodies: Body[], radius: number, dt: number, vw: number, vh: number) {
  const fr = Math.exp(-K * dt);
  const sfr = Math.exp(-SPIN_K * dt);
  for (const b of bodies) {
    if (b.asleep) continue;
    b.vx *= fr;
    b.vy *= fr;
    b.va *= sfr;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_SPEED) {
      b.vx *= MAX_SPEED / sp;
      b.vy *= MAX_SPEED / sp;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.a += b.va * dt;
    // The screen's edges, once a die is on screen (they start just outside it).
    const inX = b.x > radius && b.x < vw - radius;
    const inY = b.y > radius && b.y < vh - radius;
    if (inX || inY) {
      if (b.x < radius && b.vx < 0) (b.x = radius), (b.vx *= -0.4);
      if (b.x > vw - radius && b.vx > 0) (b.x = vw - radius), (b.vx *= -0.4);
      if (b.y < radius && b.vy < 0) (b.y = radius), (b.vy *= -0.4);
      if (b.y > vh - radius && b.vy > 0) (b.y = vh - radius), (b.vy *= -0.4);
    }
  }
  // Bumps: every pair (40 dice = 780 pairs, nothing for a computer).
  const min = radius * 2;
  const maxPush = radius * 0.18;
  for (let i = 0; i < bodies.length; i++) {
    const p = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const q = bodies[j];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01;
      const nx = d2 ? dx / d : 1;
      const ny = d2 ? dy / d : 0;
      // Ease the overlap apart, a little per step.
      const push = Math.min((min - d) / 2, maxPush);
      p.x -= nx * push;
      p.y -= ny * push;
      q.x += nx * push;
      q.y += ny * push;
      // Only dice moving towards each other bounce, and they lose most of the energy.
      const vn = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
      if (vn < 0) {
        const jn = (-(1 + RESTITUTION) * vn) / 2;
        p.vx -= jn * nx;
        p.vy -= jn * ny;
        q.vx += jn * nx;
        q.vy += jn * ny;
        // A knock sets them spinning a little.
        const kick = Math.min(Math.abs(vn) * 0.5, 400);
        p.va += kick * (p.va >= 0 ? 1 : -1);
        q.va -= kick * (q.va >= 0 ? -1 : 1);
        p.asleep = false;
        q.asleep = false;
      }
    }
  }
  for (const b of bodies) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_SPEED) {
      b.vx *= MAX_SPEED / sp;
      b.vy *= MAX_SPEED / sp;
    }
    b.va = Math.max(-1600, Math.min(1600, b.va));
    if (!b.asleep && sp < 6 && Math.abs(b.va) < 20) (b.asleep = true), (b.vx = 0), (b.vy = 0), (b.va = 0);
  }
}

/** Total motion left (for tests: it must die down). */
export const energy = (bodies: Body[]) => bodies.reduce((e, b) => e + b.vx * b.vx + b.vy * b.vy, 0);
