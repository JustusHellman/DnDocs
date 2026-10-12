import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { squaresIn, templatePolygon, type TemplateKind } from '../../lib/battle/templates';

const TEMPLATE_KINDS: string[] = ['circle', 'cone', 'beam', 'cube'];

export type Tool = 'select' | 'measure' | 'draw' | 'ping' | 'fog' | 'erase';

export interface DraftShape {
  kind: Drawing['kind'];
  color: string;
  points: Pt[];
  width?: number;
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

export default function BattleBoard(props: Props) {
  const { api, board, scene, tokens, drawings, marks, uid, asDM, tool, selectedId, turnId, fog, showWalls, ruler, draft } = props;
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
  const text = (size: number) => size / Math.sqrt(Math.max(1, api.scale));

  const cellsAt = (clientX: number, clientY: number) => {
    const p = api.toPercent(clientX, clientY);
    return percentToCells(board, p.x, p.y);
  };

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
    if (!props.canMove(t)) {
      // Not yours to move: the map pans as usual (so a finger can start on any token), and a tap
      // without moving still selects it.
      const start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== start.id) return;
        window.removeEventListener('pointerup', up);
        if (ev.type === 'pointerup' && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) tapToken(t);
      };
      window.addEventListener('pointerup', up);
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
    setDrag({ ...drag, x, y, moved });
  };
  const tokenUp = (t: Token) => (e: React.PointerEvent) => {
    if (!drag || drag.id !== t.id) return;
    e.stopPropagation();
    if (drag.moved) {
      const c = snapTokenCorner({ x: drag.x + t.size / 2, y: drag.y + t.size / 2 }, t.size, scene.grid.snap);
      if (c.x !== t.x || c.y !== t.y) {
        // Players walk; the DM can put anything anywhere.
        if (!asDM && dragWalk?.blocked && props.onBlocked) props.onBlocked(t, c.x, c.y);
        else props.onMove(t.id, c.x, c.y);
      }
    } else tapToken(t);
    setDrag(null);
  };

  const renderToken = (t: Token) => {
    const s = t.size;
    const pos = drag?.id === t.id && drag.moved ? drag : t;
    const thumb = props.thumbOf(t);
    const hp = props.hpOf(t);
    const player = t.controlledBy.length > 0;
    const ring = player ? '#e8c77a' : t.color;
    const r = s / 2;
    const down = t.health === 'down' || (hp !== null && hp.cur <= 0);
    const clip = `${id}-c-${t.id}`;
    const speed = drag?.id === t.id ? props.speedOf?.(t) ?? null : null;
    return (
      <g
        key={t.id}
        transform={`translate(${pos.x} ${pos.y})`}
        opacity={t.hidden ? 0.5 : 1}
        style={{ pointerEvents: tool === 'select' ? 'auto' : 'none', cursor: props.canMove(t) ? 'grab' : 'pointer', touchAction: 'none' }}
        onPointerDown={tokenDown(t)}
        onPointerMove={tokenMove(t)}
        onPointerUp={tokenUp(t)}
        onPointerCancel={() => setDrag(null)}
        data-token={t.id}
      >
        <title>{t.name}</title>
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
        <circle cx={r} cy={r} r={r - 0.04} fill="none" stroke={ring} strokeWidth={0.08} />
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
        <text x={r} y={s + 0.2} textAnchor="middle" dominantBaseline="hanging" fontSize={text(0.24)} fontWeight={600} fill="#fff" style={haloStyle(text(0.07))}>
          {t.name}
        </text>
        {drag?.id === t.id && drag.moved && dragWalk && (
          // How far it walks (around walls and closed doors when the map has them).
          <text x={r} y={-0.15} textAnchor="middle" fontSize={text(0.32)} fontWeight={700} fill={dragWalk.blocked ? '#ff6b6b' : '#f2b632'} style={haloStyle(text(0.09))}>
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
    look: { private?: boolean; selected?: boolean; onContext?: () => void; width?: number } = {},
  ) => {
    // The DM's private drawings are dashed and faded, so it's clear players don't see them.
    const common = {
      stroke: color,
      strokeWidth: look.selected ? 0.13 : 0.08,
      fill: 'none',
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      strokeDasharray: look.private ? '0.25 0.15' : undefined,
      opacity: look.private ? 0.7 : 1,
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
        {look.selected && <path d={d} stroke="#f2b632" strokeWidth={0.04} fill="none" strokeDasharray="0.12 0.1" />}
        {(hit || look.onContext) && (
          <path
            d={d}
            stroke="transparent"
            strokeWidth={0.45}
            // Selecting: only the outline catches clicks, so a big spell area doesn't sit on top of
            // the doors and tokens under it. Erasing: the whole area does.
            fill={fill === 'none' || tool !== 'erase' ? 'none' : 'transparent'}
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            onPointerDown={(e) => e.button === 0 && e.stopPropagation()}
            onPointerUp={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              hit?.();
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

  const labelAt = (p: Pt, label: string, key: string, color = '#fff') => (
    <text key={key} x={p.x + 0.25} y={p.y - 0.25} fontSize={text(0.36)} fontWeight={700} fill={color} style={haloStyle(text(0.1))}>
      {label}
    </text>
  );

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
        const hit =
          tool === 'erase' && props.canErase(d)
            ? () => props.onErase(d)
            : tool === 'select' && asDM && props.onDrawingSelect
              ? () => props.onDrawingSelect!(d)
              : undefined;
        return shape(d.kind, pointsOf(d.points), d.color, d.id, hit, {
          private: asDM && d.shared === false,
          selected: props.selectedDrawingId === d.id,
          width: d.width,
          // Only with the select tool: a right-click while measuring adds a waypoint, nothing else.
          onContext: asDM && tool === 'select' && props.onDrawingShare ? () => props.onDrawingShare!(d) : undefined,
        });
      })}
      {above.map(renderToken)}

      {/* Pings and shared measurements */}
      {marks.map((m) => (
        <g key={`${m.id}-${m.at}`} style={{ pointerEvents: 'none' }}>
          {m.kind === 'ping' ? (
            <>
              <circle cx={m.x} cy={m.y} r={0.3} fill="none" stroke="#f2b632" strokeWidth={0.08}>
                <animate attributeName="r" from="0.2" to="1.6" dur="1.1s" repeatCount="3" />
                <animate attributeName="opacity" from="1" to="0" dur="1.1s" repeatCount="3" />
              </circle>
              <circle cx={m.x} cy={m.y} r={0.12} fill="#f2b632" />
              {labelAt({ x: m.x, y: m.y }, m.name, 'l', '#f2b632')}
            </>
          ) : (
            m.x2 !== undefined &&
            m.y2 !== undefined && (
              <>
                <path
                  d={`M${(m.pts ? pointsOf(m.pts) : [{ x: m.x, y: m.y }, { x: m.x2, y: m.y2 }]).map((p) => `${p.x} ${p.y}`).join('L')}`}
                  stroke="#f2b632"
                  strokeWidth={0.07}
                  strokeDasharray="0.2 0.12"
                  fill="none"
                />
                <circle cx={m.x} cy={m.y} r={0.1} fill="#f2b632" />
                {labelAt({ x: m.x2, y: m.y2 }, `${m.label ?? ''} · ${m.name}`, 'l', '#f2b632')}
              </>
            )
          )}
        </g>
      ))}

      {ruler && ruler.pts.length > 1 && (
        <g style={{ pointerEvents: 'none' }}>
          <path d={`M${ruler.pts.map((p) => `${p.x} ${p.y}`).join('L')}`} stroke="#fff" strokeWidth={0.08} strokeDasharray="0.2 0.12" fill="none" />
          {ruler.pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === ruler.pts.length - 1 ? 0.1 : 0.08} fill={i === 0 || i === ruler.pts.length - 1 ? '#fff' : '#f2b632'} />
          ))}
          {labelAt(ruler.pts[ruler.pts.length - 1], ruler.label, 'rl')}
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
          {shape(draft.kind, draft.points, draft.color, 'draft', undefined, { width: draft.width })}
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
