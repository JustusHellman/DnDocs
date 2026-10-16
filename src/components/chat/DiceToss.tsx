import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ChatRoll } from '../../lib/chat/rolls';
import { FALLBACK, textOn } from '../../lib/chat/colors';
import { layoutDice, startBodies, stepBodies, throwSize, type TossDie } from '../../lib/chat/tossPhysics';

/** The outline of each kind of die, in a 100 × 100 box. */
const SHAPES: Record<number, string> = {
  4: 'M50 6 L95 88 L5 88 Z',
  6: 'M14 10 H86 Q92 10 92 16 V84 Q92 90 86 90 H14 Q8 90 8 84 V16 Q8 10 14 10 Z',
  8: 'M50 3 L95 50 L50 97 L5 50 Z',
  10: 'M50 3 L94 40 L50 97 L6 40 Z',
  12: 'M50 3 L95 36 L78 92 L22 92 L5 36 Z',
  20: 'M50 2 L93 26 L93 74 L50 98 L7 74 L7 26 Z',
};
const shapeOf = (sides: number) => SHAPES[sides] ?? 'M50 4 A46 46 0 1 1 49.9 4 Z';

function Die({ sides, value, settled, shadow, color, tone }: { sides: number; value: number; settled: boolean; shadow: boolean; color: string; tone: 'normal' | 'crit' | 'fumble' | 'dropped' }) {
  // The die is the roller's colour; a natural 20 or 1 shows in the outline (so a green or red die still reads).
  const fill = tone === 'dropped' ? '#6b5d4a' : color;
  const ink = tone === 'dropped' ? '#d6cbb8' : textOn(color);
  return (
    <svg viewBox="0 0 100 100" className={clsx('size-full', shadow && 'drop-shadow-[0_6px_10px_rgba(0,0,0,.45)]')}>
      <path
        d={shapeOf(sides)}
        fill={fill}
        stroke={tone === 'crit' ? '#4ade80' : tone === 'fumble' ? '#f43f5e' : 'rgba(20,14,9,.85)'}
        strokeWidth={tone === 'crit' || tone === 'fumble' ? 8 : 4}
        strokeLinejoin="round"
      />
      {sides === 20 && <path d="M50 2 L76 62 L24 62 Z M24 62 L7 74 M76 62 L93 74 M50 98 L24 62 M50 98 L76 62" fill="none" stroke={ink} strokeOpacity={0.22} strokeWidth={2} />}
      <text
        x="50"
        y={sides === 4 ? 66 : 54}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={value >= 100 ? 30 : 38}
        fontWeight={800}
        fill={ink}
        className={clsx(!settled && 'opacity-80')}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value}
      </text>
    </svg>
  );
}

/** Timeline (ms): tumbling and bumping, then gliding into rows, then a few seconds to read it. */
const SIM_END = 1150;
const GATHER = 550;
const FADE = 350;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Dice thrown onto the screen for the person rolling. They fly in from a random side, skid, spin
 * and knock into each other (tossPhysics.ts keeps that calm with any number of dice), then glide
 * into tidy rows: d20s first, lowest to highest, set-aside dice small beside them, and identical
 * results stacked ("6 ×4") when there are too many to show one by one. The total appears under
 * them. They stay a few seconds (longer for big handfuls); hovering keeps them, a click anywhere
 * or Esc sends them away.
 */
export default function DiceToss({
  roll,
  color = FALLBACK,
  avoid,
  onLand,
  onDone,
}: {
  roll: ChatRoll;
  color?: string;
  /** A panel to keep clear of (the open chat): the dice settle in the larger space beside it. */
  avoid?: { left: number; right: number } | null;
  onLand?: () => void;
  onDone: () => void;
}) {
  const dice = useMemo(() => {
    const out: TossDie[] = [];
    for (const g of roll.d) {
      g.v.forEach((v) => out.push({ sides: g.s, value: v }));
      g.x?.forEach((v) => out.push({ sides: g.s, value: v, dropped: true }));
    }
    return out;
  }, [roll]);
  const [view] = useState(() => {
    const w = window.innerWidth;
    let area = { x0: 0, x1: w };
    if (avoid) area = avoid.left >= w - avoid.right ? { x0: 0, x1: avoid.left } : { x0: avoid.right, x1: w };
    if (area.x1 - area.x0 < 320) area = { x0: 0, x1: w };
    return { w, h: window.innerHeight, area };
  });
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const layout = useMemo(() => layoutDice(dice, view.w, view.h, view.area), [dice, view]);
  const tSize = useMemo(() => throwSize(dice.length, view.w), [dice.length, view.w]);
  // Each die's element is drawn at its largest size and scaled down with transforms.
  const elSize = useMemo(() => Math.max(tSize, ...layout.slots.map((s) => s.size)), [tSize, layout]);
  const els = useRef<(HTMLDivElement | null)[]>([]);
  const [faces, setFaces] = useState(() => dice.map((d) => d.value));
  const [phase, setPhase] = useState<'throw' | 'gather' | 'rest' | 'out'>(reduced ? 'rest' : 'throw');
  const paused = useRef(false);
  const hideAt = useRef(0);
  const hold = 3000 + Math.min(2000, Math.max(0, dice.length - 6) * 80);

  // The motion: a fixed-step simulation, then a glide to the layout. Written straight to the
  // elements' transforms (no React re-render per frame).
  useLayoutEffect(() => {
    const slots = layout.slots;
    const place = (i: number, x: number, y: number, a: number, size: number, opacity = 1) => {
      const el = els.current[i];
      if (!el) return;
      el.style.transform = `translate(${x - elSize / 2}px, ${y - elSize / 2}px) rotate(${a}deg) scale(${size / elSize})`;
      el.style.opacity = String(opacity);
    };
    if (reduced) {
      slots.forEach((s, i) => place(i, s.x, s.y, 0, s.size, s.merged ? 0 : 1));
      onLand?.();
      hideAt.current = performance.now() + hold;
      return;
    }
    const bodies = startBodies(dice.length, tSize, view.w, view.h, Math.random, (view.area.x0 + view.area.x1) / 2);
    const r = tSize * 0.48;
    const t0 = performance.now();
    let last = t0;
    let acc = 0;
    let from: { x: number; y: number; a: number }[] | null = null;
    let raf = 0;
    let landed = false;
    const frame = (now: number) => {
      const t = now - t0;
      if (t < SIM_END) {
        acc += Math.min(0.05, (now - last) / 1000);
        while (acc >= 1 / 120) {
          stepBodies(bodies, r, 1 / 120, view.w, view.h);
          acc -= 1 / 120;
        }
        bodies.forEach((b, i) => place(i, b.x, b.y, b.a, tSize));
      } else {
        // Glide from wherever each die stopped to its spot, turning upright the shortest way.
        from ??= bodies.map((b) => ({ x: b.x, y: b.y, a: b.a }));
        const k = easeInOut(Math.min(1, (t - SIM_END) / GATHER));
        from.forEach((f, i) => {
          const s = slots[i];
          const to = Math.round(f.a / 360) * 360;
          place(i, f.x + (s.x - f.x) * k, f.y + (s.y - f.y) * k, f.a + (to - f.a) * k, tSize + (s.size - tSize) * k, s.merged ? 1 - k : 1);
        });
        if (k >= 1 && !landed) {
          landed = true;
          setPhase('rest');
          onLand?.();
          hideAt.current = now + hold;
          return;
        }
      }
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const toGather = setTimeout(() => setPhase((p) => (p === 'throw' ? 'gather' : p)), SIM_END);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(toGather);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Faces flicker while tumbling, then show the real results.
  useEffect(() => {
    if (phase !== 'throw') {
      setFaces(dice.map((d) => d.value));
      return;
    }
    const id = setInterval(() => setFaces(dice.map((d) => 1 + Math.floor(Math.random() * d.sides))), 70);
    return () => clearInterval(id);
  }, [phase, dice]);

  // Time to go: after the hold (not while hovered), or at a click / Esc.
  useEffect(() => {
    if (phase === 'out') {
      const t = setTimeout(onDone, FADE);
      return () => clearTimeout(t);
    }
    const go = () => setPhase('out');
    const key = (e: KeyboardEvent) => e.key === 'Escape' && go();
    const tick = setInterval(() => {
      if (hideAt.current && !paused.current && performance.now() >= hideAt.current) go();
    }, 100);
    window.addEventListener('pointerdown', go, true);
    window.addEventListener('keydown', key);
    return () => {
      clearInterval(tick);
      window.removeEventListener('pointerdown', go, true);
      window.removeEventListener('keydown', key);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const settled = phase === 'rest' || phase === 'out';
  const nat = roll.nat;
  const hover = {
    onPointerEnter: () => (paused.current = true),
    onPointerLeave: () => {
      paused.current = false;
      // A moment to look away before they go.
      hideAt.current = Math.max(hideAt.current, performance.now() + 1200);
    },
  };
  return (
    <div className={clsx('pointer-events-none fixed inset-0 z-[60] transition-opacity', phase === 'out' && 'opacity-0')} style={{ transitionDuration: `${FADE}ms` }} aria-hidden>
      {dice.map((d, i) => {
        const slot = layout.slots[i];
        const tone = d.dropped ? 'dropped' : settled && d.sides === 20 && nat === 20 ? 'crit' : settled && d.sides === 20 && nat === 1 ? 'fumble' : 'normal';
        const shown = !slot.merged;
        return (
          <div
            key={i}
            ref={(el) => {
              els.current[i] = el;
            }}
            className={clsx('absolute top-0 left-0 will-change-transform', settled && shown && 'pointer-events-auto')}
            style={{ width: elSize, height: elSize, transform: 'translate(-200vw, 0)' }}
            {...hover}
          >
            <Die sides={d.sides} value={faces[i]} settled={settled} shadow={dice.length <= 12} color={color} tone={tone} />
            {settled && shown && tone !== 'normal' && tone !== 'dropped' && <span className={clsx('dd-burst', tone === 'fumble' && 'dd-burst-red')} />}
            {settled && shown && d.sides !== 20 && !d.dropped && d.value === d.sides && d.sides > 2 && <span className="dd-glint" />}
            {settled && slot.count && (
              <span className="absolute -right-[6%] -bottom-[6%] rounded-full border border-stone-900 bg-stone-950 px-[0.45em] font-bold text-stone-100 tabular-nums" style={{ fontSize: Math.max(12, elSize * 0.22) }}>
                ×{slot.count}
              </span>
            )}
          </div>
        );
      })}
      {settled && (
        <div
          className="dd-toss-total pointer-events-auto absolute -translate-x-1/2 rounded-2xl border border-stone-600/70 bg-stone-950/92 px-5 py-1.5 text-center shadow-2xl"
          style={{ top: layout.bottom + 18, left: (view.area.x0 + view.area.x1) / 2 }}
          {...hover}
        >
          {roll.l && <div className="text-xs text-stone-400">{roll.l}</div>}
          <div className={clsx('font-display text-4xl font-bold tabular-nums', nat === 20 ? 'text-emerald-300' : nat === 1 ? 'text-rose-400' : 'text-amber-300')}>{roll.t}</div>
          {nat === 20 && <div className="text-xs font-semibold text-emerald-300">Natural 20!</div>}
          {nat === 1 && <div className="text-xs font-semibold text-rose-400">Natural 1</div>}
        </div>
      )}
    </div>
  );
}
