import { useEffect, useRef, useState } from 'react';
import { cellAt, type Ruler } from '../../components/battle/BattleBoard';
import type { ToolPhase, ViewerApi } from '../../components/map/MapViewer';
import { distanceFeet, encodePoints, snapToCellCenter, type Board, type Pt } from '../../lib/battle/geometry';
import type { LiveMark, SceneGrid } from '../../types';

/**
 * The battle map's ruler. Two ways to measure: hold and drag (right-click, Space or W adds a turning
 * point; on touch screens, holding still does), or click once and the end follows the mouse — each
 * click turns, right-click or Backspace takes the last turn back, a double-click or Enter finishes.
 * A finished ruler stays a few seconds; a player's is shared with the table (`share`).
 */
export function useRuler(o: {
  active: boolean;
  grid: SceneGrid;
  apiRef: React.MutableRefObject<ViewerApi | null>;
  boardRef: React.MutableRefObject<Board | null>;
  share: ((mark: Pick<LiveMark, 'kind' | 'x' | 'y' | 'x2' | 'y2' | 'label' | 'pts'>) => void) | null;
}) {
  const { grid } = o;
  const [ruler, setRuler] = useState<Ruler | null>(null);
  const rulerRef = useRef<Ruler | null>(null);
  rulerRef.current = ruler;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const measuring = useRef(false);
  /** Click-to-click ruler: it follows the mouse until a double-click, Enter or Escape. */
  const clickMode = useRef(false);
  const lastDown = useRef<{ at: number; x: number; y: number } | null>(null);

  /** Ruler total: each leg by the table's diagonal rule. */
  const label = (pts: Pt[]) => {
    let ft = 0;
    for (let i = 1; i < pts.length; i++) ft += distanceFeet(pts[i - 1], pts[i], grid);
    return `${ft} ft`;
  };
  /** Pin the ruler's current end as a turning point and carry on measuring from there. */
  const addWaypoint = () =>
    setRuler((r) => {
      if (!r || !measuring.current) return r;
      const last = r.pts[r.pts.length - 1];
      const prev = r.pts[r.pts.length - 2];
      if (prev && prev.x === last.x && prev.y === last.y) return r;
      return { ...r, pts: [...r.pts, last] };
    });
  /** Take back the last turning point (or the whole ruler when there is none). */
  const removeWaypoint = () => {
    const r = rulerRef.current;
    if (!r || !measuring.current) return;
    if (r.pts.length <= 2) {
      measuring.current = false;
      clickMode.current = false;
      setRuler(null);
      return;
    }
    const pts = [...r.pts.slice(0, -2), r.pts[r.pts.length - 1]];
    setRuler({ pts, label: label(pts) });
  };
  /** Done measuring: the ruler stays a few seconds (and players share it with the table). */
  const finish = () => {
    const r = rulerRef.current;
    measuring.current = false;
    clickMode.current = false;
    if (!r) return;
    // A double click leaves the same point twice: drop repeats.
    const pts = r.pts.filter((p, i) => i === 0 || p.x !== r.pts[i - 1].x || p.y !== r.pts[i - 1].y);
    if (pts.length < 2) return setRuler(null);
    const done = { pts, label: label(pts) };
    setRuler(done);
    const a = pts[0];
    const b = pts[pts.length - 1];
    o.share?.({ kind: 'measure', x: a.x, y: a.y, x2: b.x, y2: b.y, label: done.label, pts: pts.length > 2 ? encodePoints(pts) : undefined });
    timer.current = setTimeout(() => setRuler(null), 5000);
  };
  const handlers = useRef({ addWaypoint, removeWaypoint, finish });
  handlers.current = { addWaypoint, removeWaypoint, finish };

  // Turning points from the mouse and keyboard while measuring.
  useEffect(() => {
    if (!o.active) return;
    const onDown = (e: MouseEvent) => {
      if (e.button === 2 && measuring.current) {
        e.preventDefault();
        if (clickMode.current) handlers.current.removeWaypoint();
        else handlers.current.addWaypoint();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!measuring.current) return;
      if (e.key === ' ' || e.key === 'w') {
        e.preventDefault();
        handlers.current.addWaypoint();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handlers.current.removeWaypoint();
      } else if (e.key === 'Enter' && clickMode.current) {
        e.preventDefault();
        handlers.current.finish();
      }
    };
    const noMenu = (e: MouseEvent) => measuring.current && e.preventDefault();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('contextmenu', noMenu, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('contextmenu', noMenu, true);
    };
  }, [o.active]);

  const cell = (cx: number, cy: number) => {
    const api = o.apiRef.current;
    const board = o.boardRef.current;
    if (!api || !board) return null;
    const p = cellAt(api, board, cx, cy);
    return grid.snap ? snapToCellCenter(p) : p;
  };

  /** The measure tool's pointer events. */
  const onTool = (phase: ToolPhase, cx: number, cy: number, pointerType = 'mouse') => {
    const q = cell(cx, cy);
    if (!q) return;
    clearTimeout(timer.current);
    clearTimeout(dwell.current);
    if (phase === 'down') {
      const now = Date.now();
      const prev = lastDown.current;
      lastDown.current = { at: now, x: cx, y: cy };
      if (clickMode.current) {
        if (prev && now - prev.at < 400 && Math.hypot(cx - prev.x, cy - prev.y) < 8) finish();
        else
          setRuler((r) => {
            if (!r) return r;
            const pts = [...r.pts.slice(0, -1), q, q];
            return { pts, label: label(pts) };
          });
        return;
      }
      measuring.current = true;
      setRuler({ pts: [q, q], label: '0 ft' });
    } else if (phase === 'move') {
      setRuler((r) => {
        if (!r) return r;
        const pts = [...r.pts.slice(0, -1), q];
        return { pts, label: label(pts) };
      });
      // Touch screens (fingers and pens) have no right click: holding still drops a turning point.
      if (pointerType !== 'mouse') dwell.current = setTimeout(addWaypoint, 650);
    } else if (phase === 'up') {
      if (clickMode.current) return;
      const r = rulerRef.current;
      const a = r?.pts[0];
      const b = r?.pts[r.pts.length - 1];
      // A click without dragging (mouse): start a click-to-click ruler that follows the mouse.
      if (r && a && b && pointerType === 'mouse' && r.pts.length === 2 && a.x === b.x && a.y === b.y) {
        clickMode.current = true;
        return;
      }
      finish();
    } else stop();
  };

  /** Click-to-click: the end follows the mouse. */
  const onHover = (cx: number, cy: number) => {
    if (!clickMode.current || !measuring.current) return;
    const q = cell(cx, cy);
    if (!q) return;
    setRuler((r) => {
      if (!r) return r;
      const last = r.pts[r.pts.length - 1];
      if (last.x === q.x && last.y === q.y) return r;
      const pts = [...r.pts.slice(0, -1), q];
      return { pts, label: label(pts) };
    });
  };

  /** Anything half-done goes (a tool change, Escape). */
  const stop = () => {
    measuring.current = false;
    clickMode.current = false;
    clearTimeout(timer.current);
    clearTimeout(dwell.current);
    setRuler(null);
  };

  return { ruler, onTool, onHover, stop, following: clickMode.current && measuring.current };
}
