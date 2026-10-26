import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { colorOf, useTableColors } from '../../lib/chat/colorStore';
import type { ViewerApi } from '../map/MapViewer';
import {
  blockingSegments,
  decodeNums,
  percentToCells,
  pointsOf,
  polygonPath,
  segmentsOf,
  snapTokenCorner,
  type Board,
  type FogMask,
  type Pt,
} from '../../lib/battle/geometry';
import type { Drawing, LiveMark, Scene, Token } from '../../types';
import { walk, WallIndex } from '../../lib/battle/pathing';
import { distanceFeet } from '../../lib/battle/geometry';
import { squaresIn, templatePolygon, type TemplateKind } from '../../lib/battle/templates';

const TEMPLATE_KINDS: string[] = ['circle', 'cone', 'beam', 'cube'];

export type Tool = 'select' | 'measure' | 'draw' | 'ping' | 'fog' | 'erase';

export interface DraftShape {
  kind: Drawing['kind'];
  color: string;
  points: Pt[];
  width?: number;
  thick?: number;
  label?: string;
}

/** A ruler: the points it passes through (two, or more with waypoints) and its total. */
export interface Ruler {
  pts: Pt[];
  label: string;
}

interface Props {
  api: ViewerApi;
  board: Board;
  scene: Scene;
  tokens: Token[];
  drawings: Drawing[];
  marks: LiveMark[];
  uid: string;
  /** DM view (not the DM's "player view" preview). */
  asDM: boolean;
  tool: Tool;
  selectedId: string | null;
  turnId: string | null;
  /** Fog to draw: hidden squares (manual reveals) and areas the party can see (line of sight). */
  fog: { on: boolean; mask: FogMask | null; visible: Pt[][] };
  showWalls: boolean;
  ruler: Ruler | null;
  draft: DraftShape | null;
  thumbOf: (t: Token) => string | null;
  /** HP bar values for a token, when the viewer may see them. */
  hpOf: (t: Token) => { cur: number; max: number; temp: number } | null;
  canMove: (t: Token) => boolean;
  canErase: (d: Drawing) => boolean;
  /** Whether the viewer can see a point through the fog (players; always true for the DM). */
  seen: (p: Pt) => boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  /** A player dropped a token where walls or closed doors leave no walking path (they may still move it). */
  onBlocked?: (t: Token, x: number, y: number) => void;
  /** Walking speed in feet, when known: shown next to the distance (never enforced). */
  speedOf?: (t: Token) => number | null;
  onOpen: (t: Token) => void;
  onDoor: (index: number) => void;
  onErase: (d: Drawing) => void;
  /** DM: a drawing was clicked (select tool) or right-clicked (toggle sharing). */
  selectedDrawingId?: string | null;
  onDrawingSelect?: (d: Drawing) => void;
  onDrawingShare?: (d: Drawing) => void;
  /** A selected drawing was dragged by (dx, dy) squares. */
  onDrawingMove?: (d: Drawing, dx: number, dy: number) => void;
  /** Spotlight one token (pointed at in the initiative list): the others dim. */
  spotlightId?: string | null;
  /** The token under the mouse (lights up its row in the initiative list). */
  onTokenHover?: (id: string | null) => void;
}

/** Light text with a dark outline: readable on any map. */
const haloStyle = (width: number): React.CSSProperties => ({ paintOrder: 'stroke', stroke: 'rgba(20,14,9,.88)', strokeWidth: width, strokeLinejoin: 'round', userSelect: 'none' });

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

/**
 * How wide a bold label is, in map units at font size `fs`: measured with the page's real font
 * (so pills fit their text), with a rough estimate when there's no canvas.
 */
let measureCtx: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();
function textWidth(label: string, fs: number) {
  let w = widths.get(label);
  if (w === undefined) {
    if (measureCtx === undefined) {
      try {
        measureCtx = document.createElement('canvas').getContext('2d');
        // Web fonts arrive a moment later: measure again once they have.
        void document.fonts?.ready.then(() => widths.clear());
        if (measureCtx) measureCtx.font = `700 100px ${getComputedStyle(document.body).fontFamily || 'serif'}`;
      } catch {
        measureCtx = null;
      }
    }
    w = (measureCtx ? measureCtx.measureText(label).width : label.length * 58) / 100;
    if (widths.size > 500) widths.clear();
    widths.set(label, w);
  }
  return w * fs;
}

/**
 * A press-and-hold on a token is in progress or just ended (it showed the distance): the map's own
 * tap handling skips that release, so the selection stays.
 */
export const tokenHold = { active: false };

export default function BattleBoard(props: Props) {
  const { api, board, scene, tokens, drawings, marks, uid, asDM, tool, selectedId, turnId, fog, showWalls, ruler, draft } = props;
  // Everyone's table colour: their pings, rulers and the ring on the tokens they play.
  const tableColors = useTableColors();
  const markColor = (m: { id: string }) => colorOf(tableColors, m.id.replace(/-m$/, ''));
  const id = useId().replace(/:/g, '');
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const doorDown = useRef<{ x: number; y: number } | null>(null);
  // Escape drops a drag back where it started; so does a second finger (that's a pinch, not a move).
  const dragPointer = useRef<number | null>(null);
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrag(null);
    const onDown = (e: PointerEvent) => e.pointerId !== dragPointer.current && setDrag(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [!!drag]); // eslint-disable-line react-hooks/exhaustive-deps

  const cellsAt = (clientX: number, clientY: number) => {
    const p = api.toPercent(clientX, clientY);
    return percentToCells(board, p.x, p.y);
  };
  // Screen pixels per square right now (zoom, map size and screen): names, rulers and pings are
  // sized in screen pixels so they stay readable on big maps, instead of shrinking with the squares.
  const pxPerCell = (() => {
    const a = cellsAt(0, 0);
    const b = cellsAt(200, 0);
    const d = Math.abs(b.x - a.x);
    return d > 0 && Number.isFinite(d) ? 200 / d : 40;
  })();
  const remPx = typeof document === 'undefined' ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  /** `n` screen pixels (at the normal text size) in squares. */
  const px = (n: number) => (n * remPx) / 16 / pxPerCell;
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Touch has no hover: with a token selected, pressing and holding another one shows how far
  // apart they are (for a few seconds), instead of selecting it.
  const [heldId, setHeldId] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heldFor = useRef<string | null>(null);
  const holdClear = useRef<ReturnType<typeof setTimeout>>(undefined);
  const startHold = (t: Token, e: React.PointerEvent) => {
    clearTimeout(holdTimer.current);
    heldFor.current = null;
    if (e.pointerType === 'mouse' || !selectedId || selectedId === t.id) return;
    holdTimer.current = setTimeout(() => {
      heldFor.current = t.id;
      tokenHold.active = true;
      clearTimeout(holdClear.current);
      setHeldId(t.id);
    }, 450);
  };
  const cancelHold = () => clearTimeout(holdTimer.current);
  /** The press was a hold (the distance was shown): don't treat it as a tap. */
  const endHold = (t: Token) => {
    clearTimeout(holdTimer.current);
    if (heldFor.current !== t.id) return false;
    heldFor.current = null;
    // After the map has seen this release (it listens first).
    setTimeout(() => (tokenHold.active = false), 0);
    clearTimeout(holdClear.current);
    holdClear.current = setTimeout(() => setHeldId((h) => (h === t.id ? null : h)), 3000);
    return true;
  };
  useEffect(() => () => (clearTimeout(holdTimer.current), clearTimeout(holdClear.current)), []);
  /** A drawing being dragged to a new place (offset in squares). */
  const [moving, setMoving] = useState<{ id: string; start: Pt; dx: number; dy: number; moved: boolean } | null>(null);

  // --- grid lines -------------------------------------------------------------
  const g = scene.grid;
  let gridPath = '';
  if (g.show) {
    for (let x = Math.ceil(board.left); x <= board.left + board.w; x++) gridPath += `M${x} ${board.top}V${board.top + board.h}`;
    for (let y = Math.ceil(board.top); y <= board.top + board.h; y++) gridPath += `M${board.left} ${y}H${board.left + board.w}`;
  }

  const walls = showWalls ? segmentsOf(decodeNums(scene.walls)) : [];
  // For walking distances: walls plus closed doors.
  const wallIndex = useMemo(() => new WallIndex(blockingSegments(scene.walls, scene.doors, scene.openDoors ?? [])), [scene.walls, scene.doors, scene.openDoors]);
  const walkBounds = { x0: board.fx, y0: board.fy, x1: board.fx + board.cols, y1: board.fy + board.rows };
  const dragTarget = (() => {
    if (!drag?.moved) return null;
    const t = tokens.find((x) => x.id === drag.id);
    if (!t) return null;
    const c = snapTokenCorner({ x: drag.x + t.size / 2, y: drag.y + t.size / 2 }, t.size, scene.grid.snap);
    return { t, c };
  })();
  const dragKey = dragTarget ? `${dragTarget.t.id}:${dragTarget.c.x},${dragTarget.c.y}` : '';
  const dragWalk = useMemo(() => {
    if (!dragTarget) return null;
    const { t, c } = dragTarget;
    const from = { x: t.x + t.size / 2, y: t.y + t.size / 2 };
    const to = { x: c.x + t.size / 2, y: c.y + t.size / 2 };
    // Large tokens are measured from the square at their centre (top-left of the middle).
    const inset = t.size > 1 ? -0.01 : 0;
    return walk({ x: from.x + inset, y: from.y + inset }, { x: to.x + inset, y: to.y + inset }, wallIndex, scene.grid, walkBounds);
  }, [dragKey, wallIndex, scene.grid.feet, scene.grid.diagonal]); // eslint-disable-line react-hooks/exhaustive-deps
  const doors = segmentsOf(decodeNums(scene.doors));
  const open = new Set(scene.openDoors ?? []);

  // --- tokens -------------------------------------------------------------------
  /** A tap on a token: select it; a second tap soon after opens it. */
  const tapToken = (t: Token) => {
    const now = Date.now();
    if (lastTap.current?.id === t.id && now - lastTap.current.at < 350) {
      lastTap.current = null;
      props.onOpen(t);
    } else {
      lastTap.current = { id: t.id, at: now };
      props.onSelect(t.id);
    }
  };
  const tokenDown = (t: Token) => (e: React.PointerEvent) => {
    if (tool !== 'select') return;
    startHold(t, e);
    if (!props.canMove(t)) {
      // Not yours to move: the map pans as usual (so a finger can start on any token), and a tap
      // without moving still selects it.
      const start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      const move = (ev: PointerEvent) => {
        if (ev.pointerId === start.id && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) >= 8) cancelHold();
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== start.id) return;
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        window.removeEventListener('pointermove', move);
        const held = endHold(t);
        if (!held && ev.type === 'pointerup' && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) tapToken(t);
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener('pointermove', move);
      return;
    }
    e.stopPropagation();
    const p = cellsAt(e.clientX, e.clientY);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragPointer.current = e.pointerId;
    setDrag({ id: t.id, x: t.x, y: t.y, dx: p.x - t.x, dy: p.y - t.y, moved: false });
  };
  const tokenMove = (t: Token) => (e: React.PointerEvent) => {
    if (!drag || drag.id !== t.id || !props.canMove(t)) return;
    e.stopPropagation();
    const p = cellsAt(e.clientX, e.clientY);
    const x = p.x - drag.dx;
    const y = p.y - drag.dy;
    const moved = drag.moved || Math.hypot(x - t.x, y - t.y) > 0.15;
    if (moved) cancelHold();
    setDrag({ ...drag, x, y, moved });
  };
  const tokenUp = (t: Token) => (e: React.PointerEvent) => {
    if (!drag || drag.id !== t.id) return;
    e.stopPropagation();
    const held = endHold(t);
    if (drag.moved) {
      const c = snapTokenCorner({ x: drag.x + t.size / 2, y: drag.y + t.size / 2 }, t.size, scene.grid.snap);
      if (c.x !== t.x || c.y !== t.y) {
        // Players walk; the DM can put anything anywhere.
        if (!asDM && dragWalk?.blocked && props.onBlocked) props.onBlocked(t, c.x, c.y);
        else props.onMove(t.id, c.x, c.y);
      }
    } else if (!held) tapToken(t);
    setDrag(null);
  };

  const renderToken = (t: Token) => {
    const s = t.size;
    const pos = drag?.id === t.id && drag.moved ? drag : t;
    const thumb = props.thumbOf(t);
    const hp = props.hpOf(t);
    const player = t.controlledBy.length > 0;
    const ring = player ? colorOf(tableColors, t.controlledBy[0]) : t.color;
    const r = s / 2;
    const down = t.health === 'down' || (hp !== null && hp.cur <= 0);
    const clip = `${id}-c-${t.id}`;
    const speed = drag?.id === t.id ? props.speedOf?.(t) ?? null : null;
    return (
      <g
        key={t.id}
        transform={`translate(${pos.x} ${pos.y})`}
        opacity={(t.hidden ? 0.5 : 1) * (props.spotlightId && props.spotlightId !== t.id ? 0.55 : 1)}
        style={{ pointerEvents: tool === 'select' ? 'auto' : 'none', cursor: props.canMove(t) ? 'grab' : 'pointer', touchAction: 'none' }}
        onPointerDown={tokenDown(t)}
        onPointerMove={tokenMove(t)}
        onPointerUp={tokenUp(t)}
        onPointerCancel={() => setDrag(null)}
        onPointerEnter={() => (setHoverId(t.id), props.onTokenHover?.(t.id))}
        onPointerLeave={() => (setHoverId((h) => (h === t.id ? null : h)), props.onTokenHover?.(null))}
        data-token={t.id}
      >
        <title>{t.name}</title>
        {props.spotlightId === t.id && (
          // Spotlit from the initiative list: a bright ring that pulses outwards.
          <>
            <circle cx={r} cy={r} r={r + px(10)} fill="rgba(242,182,50,.18)" stroke="#f2b632" strokeWidth={px(4)} />
            <circle className="dd-ripple dd-ripple-loop" cx={r} cy={r} r={r + px(40)} fill="none" stroke="#f2b632" strokeWidth={3} vectorEffect="non-scaling-stroke" />
          </>
        )}
        {t.id === turnId && (
          <circle cx={r} cy={r} r={r + 0.12} fill="none" stroke="#f2b632" strokeWidth={0.1}>
            <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
        )}
        <clipPath id={clip}>
          <circle cx={r} cy={r} r={r - 0.05} />
        </clipPath>
        {t.aura && t.aura.radius > 0 && (
          <circle cx={r} cy={r} r={r + t.aura.radius / (scene.grid.feet || 5)} fill={`${t.aura.color}1f`} stroke={`${t.aura.color}99`} strokeWidth={0.05} style={{ pointerEvents: 'none' }} />
        )}
        <circle cx={r} cy={r} r={r - 0.03} fill={t.color} />
        {thumb ? (
          <image href={thumb} x={0.05} y={0.05} width={s - 0.1} height={s - 0.1} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
        ) : (
          <text x={r} y={r} textAnchor="middle" dominantBaseline="central" fontSize={s * 0.38} fontWeight={700} fill="#fff" style={{ userSelect: 'none' }}>
            {initials(t.name)}
          </text>
        )}
        {/* A dark edge and a ring at least a few pixels wide: tokens stand out on any map, at any zoom. */}
        <circle cx={r} cy={r} r={r - 0.02} fill="none" stroke="rgba(20,14,9,.75)" strokeWidth={Math.max(0.05, px(1.5))} />
        <circle cx={r} cy={r} r={r - 0.04} fill="none" stroke={ring} strokeWidth={Math.max(0.08, px(3))} />
        {t.id === selectedId && <circle cx={r} cy={r} r={r + 0.04} fill="none" stroke="#f2b632" strokeWidth={0.06} strokeDasharray="0.15 0.1" />}
        {down && (
          <g>
            <circle cx={r} cy={r} r={r - 0.05} fill="rgba(20,14,9,.55)" />
            <path d={`M${r * 0.55} ${r * 0.55}L${r * 1.45} ${r * 1.45}M${r * 1.45} ${r * 0.55}L${r * 0.55} ${r * 1.45}`} stroke="#e03131" strokeWidth={0.09} strokeLinecap="round" />
          </g>
        )}
        {!down && t.health === 'bloodied' && (
          <g>
            <title>Bloodied</title>
            <circle cx={r} cy={r} r={r + 0.03} fill="none" stroke="#e03131" strokeWidth={0.1} strokeDasharray="0.2 0.12" />
            <circle cx={s - 0.1} cy={0.1} r={0.12} fill="#e03131" stroke="#fff" strokeWidth={0.035} />
          </g>
        )}
        {!!t.elevation && (
          <g>
            <title>{`${t.elevation} ft ${t.elevation > 0 ? 'up' : 'down'}`}</title>
            <rect x={s - 0.55} y={s - 0.3} width={0.62} height={0.3} rx={0.08} fill="#1c7ed6" stroke="#fff" strokeWidth={0.025} />
            <text x={s - 0.24} y={s - 0.15} textAnchor="middle" dominantBaseline="central" fontSize={0.17} fontWeight={700} fill="#fff">
              {t.elevation > 0 ? '↑' : '↓'}
              {Math.abs(t.elevation)}
            </text>
          </g>
        )}
        {t.conditions.length > 0 && (
          <g>
            <circle cx={0.12} cy={0.12} r={0.13} fill="#5b3a7d" stroke="#fff" strokeWidth={0.03} />
            <text x={0.12} y={0.125} textAnchor="middle" dominantBaseline="central" fontSize={0.16} fontWeight={700} fill="#fff">
              {t.conditions.length}
            </text>
          </g>
        )}
        {hp && hp.max > 0 && (
          <g transform={`translate(${s * 0.08} ${s - 0.02})`}>
            <rect width={s * 0.84} height={0.1} rx={0.05} fill="rgba(20,14,9,.7)" />
            <rect width={Math.max(0, Math.min(1, hp.cur / hp.max)) * s * 0.84} height={0.1} rx={0.05} fill={hp.cur / hp.max > 0.5 ? '#2f9e44' : hp.cur / hp.max > 0.25 ? '#f59f00' : '#e03131'} />
            {hp.temp > 0 && <rect x={0} y={-0.06} width={Math.min(1, hp.temp / hp.max) * s * 0.84} height={0.05} rx={0.025} fill="#4dabf7" />}
          </g>
        )}
        {drag?.id === t.id && drag.moved && dragWalk && (
          // How far it walks (around walls and closed doors when the map has them).
          <text x={r} y={-px(8)} textAnchor="middle" fontSize={px(16)} fontWeight={700} fill={dragWalk.blocked ? '#ff6b6b' : '#f2b632'} style={haloStyle(px(4))}>
            {dragWalk.blocked ? 'no walking path' : `${dragWalk.feet} ft${dragWalk.detour ? ' walking' : ''}`}
            {!dragWalk.blocked && speed && (
              // Just information: the DM decides (dash, pushed, a shortcut…).
              <tspan fill={dragWalk.feet > speed ? '#ffa94d' : '#c9c2b0'} fontWeight={500}>{` / ${speed}`}</tspan>
            )}
          </text>
        )}
      </g>
    );
  };

  /** A token's name on a dark pill, readable on any map. Drawn above all tokens, so a neighbour
   * never covers it. Long names are shortened until you point at the token; the party's are gold. */
  const tokenLabel = (t: Token) => {
    const s = t.size;
    const r = s / 2;
    const pos = drag?.id === t.id && drag.moved ? drag : t;
    const big = hoverId === t.id || t.id === selectedId || props.spotlightId === t.id;
    const name = big || t.name.length <= 18 ? t.name : `${t.name.slice(0, 16).trimEnd()}…`;
    const fs = px(big ? 16 : 14);
    const h = fs * 1.45;
    const w = name.length * fs * 0.52 + px(14);
    const dim = props.spotlightId && props.spotlightId !== t.id ? 0.55 : 1;
    return (
      <g key={`label-${t.id}`} transform={`translate(${pos.x + r - w / 2} ${pos.y + s + px(3)})`} opacity={(t.hidden ? 0.6 : 1) * dim} style={{ pointerEvents: 'none' }}>
        <rect width={w} height={h} rx={h / 2} fill="rgba(20,14,9,.78)" />
        <text x={w / 2} y={h / 2 + fs * 0.04} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={big ? 700 : 600} fill={t.controlledBy.length > 0 ? '#f5d98a' : '#fff'} style={{ userSelect: 'none' }}>
          {name}
        </text>
      </g>
    );
  };

  const mine = (t: Token) => t.controlledBy.includes(uid);
  // Players: other tokens sit under the fog (so it hides them); their own stay on top.
  // Tokens in the dark aren't drawn at all (not even as something to hover or tap).
  const tokenSeen = (t: Token) => {
    const c = { x: t.x + t.size / 2, y: t.y + t.size / 2 };
    const k = Math.max(0, t.size / 2 - 0.25);
    return [c, { x: c.x - k, y: c.y - k }, { x: c.x + k, y: c.y - k }, { x: c.x - k, y: c.y + k }, { x: c.x + k, y: c.y + k }].some(props.seen);
  };
  const below = asDM ? [] : tokens.filter((t) => !mine(t) && tokenSeen(t));
  const above = asDM ? tokens : tokens.filter(mine);

  // --- drawings -----------------------------------------------------------------
  const shape = (
    kind: Drawing['kind'],
    pts: Pt[],
    color: string,
    key: string,
    hit?: () => void,
    look: {
      private?: boolean;
      selected?: boolean;
      onContext?: () => void;
      width?: number;
      /** Pen thickness in squares. */
      thick?: number;
      /** A selected drawing that can be dragged to a new place. */
      drag?: { down: (e: React.PointerEvent) => void; move: (e: React.PointerEvent) => void; up: (e: React.PointerEvent) => void };
    } = {},
  ) => {
    // The DM's private drawings are dashed (in full colour), so it's clear players don't see them.
    const w = look.thick ?? 0.1;
    const common = {
      stroke: color,
      strokeWidth: w,
      fill: 'none',
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      strokeDasharray: look.private ? `${Math.max(0.2, w * 3)} ${Math.max(0.12, w * 2)}` : undefined,
    };
    let d = '';
    if (kind === 'free' && pts.length) d = `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}`;
    if (kind === 'line' && pts.length >= 2) d = `M${pts[0].x} ${pts[0].y}L${pts[1].x} ${pts[1].y}`;
    if (kind === 'rect' && pts.length >= 2) {
      const [a, b] = pts;
      d = `M${a.x} ${a.y}H${b.x}V${b.y}H${a.x}Z`;
    }
    if ((kind === 'cone' || kind === 'beam' || kind === 'cube') && pts.length >= 2) d = polygonPath(templatePolygon(kind, pts[0], pts[1], look.width ?? 1));
    if (kind === 'circle' && pts.length >= 2) {
      const [a, b] = pts;
      const rr = Math.hypot(b.x - a.x, b.y - a.y);
      d = `M${a.x - rr} ${a.y}a${rr} ${rr} 0 1 0 ${rr * 2} 0a${rr} ${rr} 0 1 0 ${-rr * 2} 0`;
    }
    if (!d) return null;
    const fill = kind === 'rect' || TEMPLATE_KINDS.includes(kind) ? `${color}22` : 'none';
    return (
      <g key={key}>
        <path d={d} {...common} fill={fill} />
        {look.selected && <path d={d} stroke="#f2b632" strokeWidth={Math.max(0.04, px(2))} fill="none" strokeDasharray={`${px(8)} ${px(5)}`} />}
        {(hit || look.onContext || look.drag) && (
          <path
            d={d}
            stroke="transparent"
            strokeWidth={Math.max(0.45, w + 0.3)}
            // Selecting: only the outline catches clicks, so a big spell area doesn't sit on top of
            // the doors and tokens under it. Erasing: the whole area does.
            fill={fill === 'none' || tool !== 'erase' ? 'none' : 'transparent'}
            style={{ pointerEvents: 'auto', cursor: look.drag ? 'move' : 'pointer', touchAction: look.drag ? 'none' : undefined }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              look.drag?.down(e);
            }}
            onPointerMove={(e) => look.drag?.move(e)}
            onPointerUp={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              if (look.drag) look.drag.up(e);
              else hit?.();
            }}
            onContextMenu={(e) => {
              if (!look.onContext) return;
              e.preventDefault();
              e.stopPropagation();
              look.onContext();
            }}
          />
        )}
      </g>
    );
  };

  // --- fog ------------------------------------------------------------------------
  const fogColor = asDM ? 'rgba(0,0,0,.45)' : '#120d09';
  const fogLayer = fog.on && (
    <g style={{ pointerEvents: 'none' }}>
      <mask id={`${id}-fog`} maskUnits="userSpaceOnUse" x={board.left} y={board.top} width={board.w} height={board.h}>
        <rect x={board.left} y={board.top} width={board.w} height={board.h} fill="white" />
        {fog.visible.map((poly, i) => (
          <path key={i} d={polygonPath(poly)} fill="black" />
        ))}
        {fog.mask && <path transform={`translate(${board.fx} ${board.fy})`} d={fog.mask.path(true)} fill="black" />}
      </mask>
      <rect x={board.left} y={board.top} width={board.w} height={board.h} fill={fogColor} mask={`url(#${id}-fog)`} />
    </g>
  );

  /** A label on a dark pill next to a point, sized in screen pixels (rulers, pings, spell areas). */
  const labelAt = (p: Pt, label: string, key: string, color = '#fff', size = 15) => {
    const fs = px(size);
    const padX = px(8);
    const h = fs * 1.6;
    const w = textWidth(label, fs) + padX * 2;
    const x = p.x + px(10);
    const y = p.y - px(10) - h;
    return (
      <g key={key} style={{ pointerEvents: 'none' }}>
        <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="rgba(20,14,9,.88)" stroke={color} strokeWidth={px(1.5)} />
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={700} fill={color} style={{ userSelect: 'none' }}>
          {label}
        </text>
      </g>
    );
  };
  /** A dashed path with a dark edge, readable on light and dark maps alike. */
  const rulerPath = (pts: Pt[], color: string, key: string) => {
    const d = `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}`;
    return (
      <g key={key} style={{ pointerEvents: 'none' }}>
        <path d={d} stroke="rgba(20,14,9,.65)" strokeWidth={px(7)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d={d} stroke={color} strokeWidth={px(3.5)} strokeDasharray={`${px(12)} ${px(7)}`} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={px(i === 0 || i === pts.length - 1 ? 6 : 4.5)} fill={color} stroke="rgba(20,14,9,.8)" strokeWidth={px(1.5)} />
        ))}
      </g>
    );
  };

  // Pings: a ripple and the pinger's name for a few seconds, then gone. Each ping animates once,
  // from when this screen first saw it (pings older than a few seconds when the map opens don't).
  const PING_MS = 3200;
  const pingSeen = useRef(new Map<string, number>());
  const nowMs = Date.now();
  const livePings = marks
    .filter((m) => m.kind === 'ping')
    .flatMap((m) => {
      const k = `${m.id}-${m.at}`;
      let t = pingSeen.current.get(k);
      if (t === undefined) {
        t = Math.abs(nowMs - m.at) < 15_000 ? nowMs : 0;
        pingSeen.current.set(k, t);
      }
      return t && nowMs - t < PING_MS ? [{ m, k }] : [];
    });
  const [, setPingTick] = useState(0);
  const livePingKeys = livePings.map((p) => p.k).join(',');
  useEffect(() => {
    if (!livePingKeys) return;
    const t = setTimeout(() => setPingTick((n) => n + 1), PING_MS + 50);
    return () => clearTimeout(t);
  }, [livePingKeys]);

  return (
    <svg
      className="absolute inset-0 size-full"
      viewBox={`${board.left} ${board.top} ${board.w} ${board.h}`}
      preserveAspectRatio="none"
      style={{ pointerEvents: 'none', overflow: 'visible' }}
      aria-hidden
    >
      {g.show && <path d={gridPath} stroke={g.color} strokeOpacity={g.opacity} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />}

      {walls.map((w, i) => (
        <line key={`w${i}`} x1={w[0]} y1={w[1]} x2={w[2]} y2={w[3]} stroke="#1c7ed6" strokeOpacity={0.75} strokeWidth={0.06} strokeLinecap="round" />
      ))}

      {below.map(renderToken)}
      {fogLayer}
      {/* Doors sit above the fog: only doors the viewer has seen are drawn at all. */}
      {doors.map((d, i) => {
        const isOpen = open.has(i);
        const mx = (d[0] + d[2]) / 2;
        const my = (d[1] + d[3]) / 2;
        // A door is known once either side of it can be seen.
        const len = Math.hypot(d[2] - d[0], d[3] - d[1]) || 1;
        const nx = (-(d[3] - d[1]) / len) * 0.35;
        const ny = ((d[2] - d[0]) / len) * 0.35;
        const known = [0.15, 0.5, 0.85].some((f) => {
          const px = d[0] + (d[2] - d[0]) * f;
          const py = d[1] + (d[3] - d[1]) * f;
          return props.seen({ x: px + nx, y: py + ny }) || props.seen({ x: px - nx, y: py - ny });
        });
        if (!known) return null;
        return (
          <g key={`d${i}`}>
            <line x1={d[0]} y1={d[1]} x2={d[2]} y2={d[3]} stroke={isOpen ? '#e8c77a' : '#6b3d12'} strokeWidth={isOpen ? 0.05 : 0.14} strokeDasharray={isOpen ? '0.12 0.1' : undefined} strokeLinecap="round" />
            <circle
              cx={mx}
              cy={my}
              r={0.2}
              fill={isOpen ? 'rgba(232,199,122,.85)' : 'rgba(107,61,18,.95)'}
              stroke="#fff"
              strokeWidth={0.04}
              style={{ pointerEvents: tool === 'select' ? 'auto' : 'none', cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                doorDown.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                // A finger that slid away (panning on a phone) isn't a tap on the door.
                const d0 = doorDown.current;
                doorDown.current = null;
                if (d0 && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 10) return;
                props.onDoor(i);
              }}
            >
              <title>{isOpen ? 'Close door' : 'Open door'}</title>
            </circle>
          </g>
        );
      })}

      {/* Drawings sit above the fog. Players only ever receive shared ones (their own and other
          players' always are; the DM's only when the DM shares them). */}
      {drawings.map((d) => {
        // The DM can select (and move) any drawing; players their own.
        const mineToEdit = asDM || d.by === uid;
        const hit =
          tool === 'erase' && props.canErase(d)
            ? () => props.onErase(d)
            : tool === 'select' && mineToEdit && props.onDrawingSelect
              ? () => props.onDrawingSelect!(d)
              : undefined;
        const selected = props.selectedDrawingId === d.id;
        const off = moving?.id === d.id ? moving : null;
        const pts = off ? pointsOf(d.points).map((p) => ({ x: p.x + off.dx, y: p.y + off.dy })) : pointsOf(d.points);
        const drag =
          selected && tool === 'select' && mineToEdit && props.onDrawingMove
            ? {
                down: (e: React.PointerEvent) => {
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                  setMoving({ id: d.id, start: cellsAt(e.clientX, e.clientY), dx: 0, dy: 0, moved: false });
                },
                move: (e: React.PointerEvent) => {
                  if (!moving || moving.id !== d.id) return;
                  const p = cellsAt(e.clientX, e.clientY);
                  const dx = p.x - moving.start.x;
                  const dy = p.y - moving.start.y;
                  setMoving({ ...moving, dx, dy, moved: moving.moved || Math.hypot(dx, dy) > 0.15 });
                },
                up: () => {
                  const m = moving;
                  setMoving(null);
                  if (!m || m.id !== d.id || !m.moved) return;
                  // Spell areas and shapes keep to half squares when the grid snaps; freehand moves freely.
                  const step = scene.grid.snap && d.kind !== 'free' ? 0.5 : 0.01;
                  const dx = Math.round(m.dx / step) * step;
                  const dy = Math.round(m.dy / step) * step;
                  if (dx || dy) props.onDrawingMove!(d, dx, dy);
                },
              }
            : undefined;
        return shape(d.kind, pts, d.color, d.id, hit, {
          private: asDM && d.shared === false,
          selected,
          width: d.width,
          thick: d.thick,
          drag,
          // Only with the select tool: a right-click while measuring adds a waypoint, nothing else.
          onContext: asDM && tool === 'select' && props.onDrawingShare ? () => props.onDrawingShare!(d) : undefined,
        });
      })}
      {above.map(renderToken)}
      {/* Names over every token (players: only tokens they can see). */}
      {[...below, ...above].map(tokenLabel)}

      {/* Range check: with a token selected, pointing at another shows how far apart they are
          (5e: from the nearest squares; 5 ft when they're next to each other). */}
      {(() => {
        const other = heldId ?? hoverId;
        if (!selectedId || !other || other === selectedId || (drag && (drag.moved || !heldId))) return null;
        const a = tokens.find((t) => t.id === selectedId);
        const b = tokens.find((t) => t.id === other);
        if (!a || !b) return null;
        const gap = (a0: number, as: number, b0: number, bs: number) => {
          const g = Math.max(a0, b0) - Math.min(a0 + as, b0 + bs);
          return g < 0 ? 0 : Math.round(g) + 1;
        };
        const dx = gap(a.x, a.size, b.x, b.size);
        const dy = gap(a.y, a.size, b.y, b.size);
        const ft = distanceFeet({ x: 0, y: 0 }, { x: dx, y: dy }, scene.grid);
        const ca = { x: a.x + a.size / 2, y: a.y + a.size / 2 };
        const cb = { x: b.x + b.size / 2, y: b.y + b.size / 2 };
        return (
          <g style={{ pointerEvents: 'none' }}>
            <path d={`M${ca.x} ${ca.y}L${cb.x} ${cb.y}`} stroke="#f2b632" strokeWidth={px(2)} strokeDasharray={`${px(6)} ${px(5)}`} fill="none" opacity={0.85} />
            {labelAt({ x: cb.x + b.size / 2 - px(6), y: cb.y - b.size / 2 + px(6) }, `${ft} ft`, 'range', '#f2b632', 16)}
          </g>
        );
      })()}

      {/* Pings: ripples spreading out, like a stone thrown in a lake (CSS animations: they start
          when the ping appears). */}
      {livePings.map(({ m, k }) => (
        <g key={k} style={{ pointerEvents: 'none' }}>
          {[0, 0.45, 0.9].map((delay) => (
            <circle
              key={delay}
              className="dd-ripple"
              style={{ animationDelay: `${delay}s` }}
              cx={m.x}
              cy={m.y}
              r={px(85)}
              fill="none"
              stroke={markColor(m)}
              strokeWidth={4}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <g className="dd-ping-label" style={{ animationDuration: `${PING_MS}ms` }}>
            <circle cx={m.x} cy={m.y} r={px(6)} fill={markColor(m)} stroke="rgba(20,14,9,.8)" strokeWidth={px(1.5)} />
            {labelAt({ x: m.x, y: m.y }, m.name, 'l', markColor(m), 14)}
          </g>
        </g>
      ))}

      {/* Other people's measurements */}
      {marks
        .filter((m) => m.kind === 'measure' && m.x2 !== undefined && m.y2 !== undefined)
        .map((m) => {
          const pts = m.pts ? pointsOf(m.pts) : [{ x: m.x, y: m.y }, { x: m.x2!, y: m.y2! }];
          return (
            <g key={`${m.id}-${m.at}`} style={{ pointerEvents: 'none' }}>
              {rulerPath(pts, markColor(m), 'p')}
              {labelAt(pts[pts.length - 1], `${m.label ?? ''} · ${m.name}`, 'l', markColor(m), 16)}
            </g>
          );
        })}

      {ruler && ruler.pts.length > 1 && (
        <g style={{ pointerEvents: 'none' }}>
          {rulerPath(ruler.pts, '#fff', 'p')}
          {labelAt(ruler.pts[ruler.pts.length - 1], ruler.label, 'rl', '#fff', 20)}
        </g>
      )}

      {/* The walking path of a token being dragged, when walls make it bend. */}
      {dragWalk && dragWalk.detour && !dragWalk.blocked && (
        <path d={`M${dragWalk.path.map((p) => `${p.x} ${p.y}`).join('L')}`} stroke="#f2b632" strokeWidth={0.07} strokeDasharray="0.15 0.12" fill="none" style={{ pointerEvents: 'none' }} />
      )}

      {draft && (
        <g style={{ pointerEvents: 'none' }}>
          {/* Squares a spell template catches. */}
          {TEMPLATE_KINDS.includes(draft.kind) &&
            draft.points.length > 1 &&
            squaresIn(templatePolygon(draft.kind as TemplateKind, draft.points[0], draft.points[1], draft.width ?? 1)).map((q) => (
              <rect key={`${q.x},${q.y}`} x={q.x + 0.04} y={q.y + 0.04} width={0.92} height={0.92} fill={draft.color} fillOpacity={0.22} />
            ))}
          {shape(draft.kind, draft.points, draft.color, 'draft', undefined, { width: draft.width, thick: draft.thick })}
          {draft.label && draft.points.length > 1 && labelAt(draft.points[draft.points.length - 1], draft.label, 'dl', draft.color)}
        </g>
      )}
    </svg>
  );
}

/** Which square a screen position is in (for tools). */
export function cellAt(api: ViewerApi, board: Board, clientX: number, clientY: number): Pt {
  const p = api.toPercent(clientX, clientY);
  return percentToCells(board, p.x, p.y);
}
