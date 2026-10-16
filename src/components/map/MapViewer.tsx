import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize, Minimize, Minus, Plus, RotateCcw } from 'lucide-react';
import clsx from 'clsx';

export interface ViewerPin {
  key: string;
  x: number; // percent
  y: number; // percent
  render: (opts: { scale: number }) => ReactNode;
  draggable?: boolean;
}

/** What layers drawn on top of the image (battle maps) need from the viewer. */
export interface ViewerApi {
  scale: number;
  /** Screen position → percent of the image (not clamped, so drags can leave the map). */
  toPercent: (clientX: number, clientY: number) => { x: number; y: number };
  natural: { w: number; h: number };
}

export type ToolPhase = 'down' | 'move' | 'up' | 'cancel';

interface Props {
  src: string;
  alt: string;
  pins: ViewerPin[];
  /** Click on empty map area (percent coordinates) – used to place pins. */
  onMapClick?: (x: number, y: number) => void;
  onPinDrop?: (key: string, x: number, y: number) => void;
  onPinClick?: (key: string) => void;
  /** Double click / double tap on a pin. */
  onPinDoubleClick?: (key: string) => void;
  crosshair?: boolean;
  overlay?: ReactNode;
  toolbar?: ReactNode;
  /** Extra layers drawn over the image, moving and zooming with it. */
  layers?: (api: ViewerApi) => ReactNode;
  /**
   * While set, a one-finger / left-button drag goes to the tool instead of panning
   * (pan with two fingers, or the right / middle mouse button).
   */
  onTool?: ((phase: ToolPhase, clientX: number, clientY: number, pointerType: string) => void) | null;
  /** The mouse moved over the map with no button pressed (e.g. a click-to-click ruler following it). */
  onHover?: ((clientX: number, clientY: number) => void) | null;
  /** Fill the parent's height instead of a fixed share of the window. */
  fill?: boolean;
  /** Full screen inside the page (keeps dialogs visible) instead of the browser's full screen. */
  pageFullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

const MIN = 1;
const MAX = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Pan / zoom map with percent-positioned pins. Works with mouse (drag, wheel),
 * touch (drag, pinch, double tap) and keyboard (+/-/0).
 */
export default function MapViewer({ src, alt, pins, onMapClick, onPinDrop, onPinClick, onPinDoubleClick, crosshair, overlay, toolbar, layers, onTool, onHover, fill, pageFullscreen, onFullscreenChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [base, setBase] = useState({ w: 0, h: 0 });
  /**
   * The visible box. Usually the fitted image itself; when the map fills a panel (battle maps) or
   * the screen, the whole panel — so on a tall phone a zoomed-in map uses the space above and
   * below it instead of staying in a strip.
   */
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [dragPin, setDragPin] = useState<{ key: string; x: number; y: number } | null>(null);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    moved: boolean;
    start?: { x: number; y: number };
    startDist?: number;
    startScale?: number;
    lastTap?: number;
    lastMid?: { x: number; y: number };
    /** This gesture belongs to the active tool. */
    tool?: boolean;
  }>({ moved: false });
  const lastPinTap = useRef<{ key: string; at: number } | null>(null);
  const toolRef = useRef(onTool);
  toolRef.current = onTool;
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  // Fit the image into the available space.
  // Widths seen by the last two measurements (see `measure`).
  const widths = useRef<{ prev: number[]; lock: [number, number] | null }>({ prev: [], lock: null });
  const measure = useCallback(() => {
    const el = viewRef.current;
    if (!el || !natural) return;
    let cw = el.parentElement?.clientWidth ?? el.clientWidth;
    // A map just tall enough to bring up the page's scroll bar narrows the page, which makes the
    // map shorter, which hides the scroll bar again… and the map shakes. Once the width flips
    // back and forth between two values, keep the narrower one until a real resize comes along.
    const wd = widths.current;
    if (wd.lock && (Math.abs(cw - wd.lock[0]) < 1 || Math.abs(cw - wd.lock[1]) < 1)) cw = wd.lock[0];
    else {
      wd.lock = null;
      const [a, b] = wd.prev;
      if (a !== undefined && b !== undefined && Math.abs(cw - a) < 1 && Math.abs(cw - b) >= 1 && Math.abs(cw - b) <= 40) {
        wd.lock = [Math.min(cw, b), Math.max(cw, b)];
        cw = wd.lock[0];
      }
      wd.prev = [b ?? cw, cw];
    }
    const holder = fill ? wrapRef.current?.parentElement : null;
    const pad = holder ? parseFloat(getComputedStyle(holder).paddingTop) + parseFloat(getComputedStyle(holder).paddingBottom) : 0;
    const fillH = holder ? holder.clientHeight - pad : 0;
    const maxH = fullscreen ? window.innerHeight : fillH ? Math.max(240, fillH) : Math.max(280, Math.min(window.innerHeight * 0.72, 900));
    const ratio = natural.h / natural.w;
    let w = cw;
    let h = cw * ratio;
    if (h > maxH) {
      h = maxH;
      w = h / ratio;
    }
    if (fullscreen) {
      w = Math.min(cw, window.innerWidth);
      h = w * ratio;
      if (h > window.innerHeight) {
        h = window.innerHeight;
        w = h / ratio;
      }
    }
    // Whole pixels, and no new render for the same size (sub-pixel jitter is a loop of its own).
    const same = (a: { w: number; h: number }, b: { w: number; h: number }) => (a.w === b.w && a.h === b.h ? a : b);
    const px = (v: { w: number; h: number }) => ({ w: Math.floor(v.w), h: Math.floor(v.h) });
    setBase((old) => same(old, px({ w, h })));
    const f = fullscreen ? { w: window.innerWidth, h: window.innerHeight } : fill && fillH ? { w: cw, h: Math.max(h, fillH) } : { w, h };
    setFrame((old) => same(old, px(f)));
  }, [natural, fullscreen, fill]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (fill && wrapRef.current?.parentElement) ro.observe(wrapRef.current.parentElement);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, fill]);

  const constrain = useCallback(
    (v: { s: number; x: number; y: number }) => {
      const s = clamp(v.s, MIN, MAX);
      const w = base.w * s;
      const h = base.h * s;
      const fw = frame.w || base.w;
      const fh = frame.h || base.h;
      // Smaller than the box on an axis: centred on it; bigger: no empty edge shows.
      return { s, x: w <= fw ? (fw - w) / 2 : clamp(v.x, fw - w, 0), y: h <= fh ? (fh - h) / 2 : clamp(v.y, fh - h, 0) };
    },
    [base, frame],
  );
  const home = useCallback(() => setView(constrain({ s: 1, x: 0, y: 0 })), [constrain]);
  // New image, other screen mode or size: back to the whole map, centred.
  useEffect(() => home(), [src, fullscreen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setView((v) => constrain(v)), [constrain]);

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      setView((v) => {
        const px = cx ?? (frame.w || base.w) / 2;
        const py = cy ?? (frame.h || base.h) / 2;
        const s = clamp(v.s * factor, MIN, MAX);
        const k = s / v.s;
        return constrain({ s, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
      });
    },
    [base, frame, constrain],
  );

  // Wheel zoom (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const rawPercent = useCallback((clientX: number, clientY: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return { x: 0, y: 0 };
    return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
  }, []);
  const toPercent = (clientX: number, clientY: number) => {
    const p = rawPercent(clientX, clientY);
    return { x: clamp(p.x, 0, 100), y: clamp(p.y, 0, 100) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const otherButton = e.button !== 0 && e.pointerType === 'mouse';
    // The right / middle button pans while a tool is active; otherwise only the left button counts.
    if (otherButton && !toolRef.current) return;
    viewRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current.moved = false;
      gesture.current.start = { x: e.clientX, y: e.clientY };
      gesture.current.tool = !!toolRef.current && !otherButton;
      if (gesture.current.tool) toolRef.current!('down', e.clientX, e.clientY, e.pointerType);
    }
    if (pointers.current.size === 2) {
      if (gesture.current.tool) {
        // A second finger: this is a pinch, not a stroke.
        toolRef.current?.('cancel', e.clientX, e.clientY, e.pointerType);
        gesture.current.tool = false;
      }
      const [a, b] = [...pointers.current.values()];
      gesture.current.startDist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.startScale = view.s;
      gesture.current.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture.current.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') hoverRef.current?.(e.clientX, e.clientY);
      return;
    }
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    const r = viewRef.current!.getBoundingClientRect();

    if (pointers.current.size === 2 && gesture.current.startDist) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midAbs = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const mid = { x: midAbs.x - r.left, y: midAbs.y - r.top };
      // Two fingers also pan: follow the midpoint.
      const last = gesture.current.lastMid ?? midAbs;
      const pan = { x: midAbs.x - last.x, y: midAbs.y - last.y };
      gesture.current.lastMid = midAbs;
      const target = (gesture.current.startScale ?? 1) * (dist / gesture.current.startDist);
      setView((v) => {
        const s = clamp(target, MIN, MAX);
        const k = s / v.s;
        return constrain({ s, x: mid.x - (mid.x - v.x - pan.x) * k, y: mid.y - (mid.y - v.y - pan.y) * k });
      });
      return;
    }
    if (gesture.current.tool) {
      gesture.current.moved = true;
      toolRef.current?.('move', cur.x, cur.y, e.pointerType);
      return;
    }
    const start = gesture.current.start ?? prev;
    if (!gesture.current.moved && Math.hypot(cur.x - start.x, cur.y - start.y) > 5) gesture.current.moved = true;
    if (gesture.current.moved) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      setView((v) => constrain({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const had = pointers.current.has(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      gesture.current.startDist = undefined;
      gesture.current.lastMid = undefined;
    }
    if (!had || pointers.current.size > 0) return;
    if (gesture.current.tool) {
      gesture.current.tool = false;
      toolRef.current?.(e.type === 'pointercancel' ? 'cancel' : 'up', e.clientX, e.clientY, e.pointerType);
      return;
    }
    if (gesture.current.moved) return;

    // A tap / click on the map.
    const now = Date.now();
    const r = viewRef.current!.getBoundingClientRect();
    if (gesture.current.lastTap && now - gesture.current.lastTap < 300 && !onMapClick) {
      zoomAt(2, e.clientX - r.left, e.clientY - r.top);
      gesture.current.lastTap = undefined;
      return;
    }
    gesture.current.lastTap = now;
    if (onMapClick) {
      const p = toPercent(e.clientX, e.clientY);
      onMapClick(p.x, p.y);
    }
  };

  // Pin dragging
  const pinDown = (pin: ViewerPin) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!pin.draggable) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current.moved = false;
    setDragPin({ key: pin.key, x: pin.x, y: pin.y });
  };
  const pinMove = (e: React.PointerEvent) => {
    if (!dragPin) return;
    e.stopPropagation();
    gesture.current.moved = true;
    const p = toPercent(e.clientX, e.clientY);
    setDragPin((d) => (d ? { ...d, ...p } : d));
  };
  const pinUp = (pin: ViewerPin) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (dragPin && gesture.current.moved) onPinDrop?.(dragPin.key, dragPin.x, dragPin.y);
    else {
      const now = Date.now();
      const last = lastPinTap.current;
      if (onPinDoubleClick && last && last.key === pin.key && now - last.at < 350) {
        lastPinTap.current = null;
        onPinDoubleClick(pin.key);
      } else {
        lastPinTap.current = { key: pin.key, at: now };
        onPinClick?.(pin.key);
      }
    }
    setDragPin(null);
    gesture.current.moved = false;
  };

  // Fullscreen (native where possible, CSS fallback for iOS Safari)
  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (fullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setFullscreen(false);
    } else if (pageFullscreen) {
      // The whole page goes full screen (so dialogs still show) and the map covers it.
      setFullscreen(true);
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      if (el.requestFullscreen) await el.requestFullscreen().catch(() => undefined);
      setFullscreen(true);
    }
  };
  useEffect(() => {
    // Leaving the browser's full screen (Esc) leaves ours too.
    const onChange = () => !document.fullscreenElement && setFullscreen(false);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [pageFullscreen]);
  const fsCallback = useRef(onFullscreenChange);
  fsCallback.current = onFullscreenChange;
  useEffect(() => fsCallback.current?.(fullscreen), [fullscreen]);
  useEffect(() => {
    if (!fullscreen || !pageFullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role="dialog"]') && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, pageFullscreen]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') zoomAt(1.4);
    else if (e.key === '-') zoomAt(1 / 1.4);
    else if (e.key === '0') home();
    else return;
    e.preventDefault();
  };

  const content = (
    <div
      ref={wrapRef}
      className={clsx(
        'flex items-center justify-center overflow-hidden',
        // `relative` and `fixed` can't both be set: the stylesheet order would decide.
        fullscreen ? 'fixed inset-0 z-[100] bg-black' : 'relative rounded-2xl border border-stone-800 bg-stone-950',
        fill && !fullscreen && 'h-full',
      )}
    >
      <div
        ref={viewRef}
        tabIndex={0}
        role="application"
        aria-label={`${alt} map. Drag to pan, pinch or scroll to zoom.`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onTool ? (e) => e.preventDefault() : undefined}
        className={clsx('relative touch-none overflow-hidden select-none outline-none', crosshair || onTool ? 'cursor-crosshair' : view.s > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default')}
        style={{ width: frame.w || base.w || '100%', height: frame.h || base.h || 320 }}
      >
        <div
          ref={stageRef}
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: base.w, height: base.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transition: pointers.current.size ? 'none' : 'transform 60ms linear' }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
            className="pointer-events-none block size-full"
            referrerPolicy="no-referrer"
          />
          {layers && natural && layers({ scale: view.s, toPercent: rawPercent, natural })}
          {pins.map((pin) => {
            const pos = dragPin?.key === pin.key ? dragPin : pin;
            return (
              <div
                key={pin.key}
                className={clsx('absolute', pin.draggable && 'cursor-grab touch-none active:cursor-grabbing', dragPin?.key === pin.key && 'z-30')}
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: `translate(-50%, -100%) scale(${1 / view.s})`, transformOrigin: '50% 100%' }}
                onPointerDown={pinDown(pin)}
                onPointerMove={pinMove}
                onPointerUp={pinUp(pin)}
              >
                {pin.render({ scale: view.s })}
              </div>
            );
          })}
        </div>
        {!natural && <div className="absolute inset-0 animate-pulse bg-stone-900" />}
      </div>

      {overlay}

      {/* Controls */}
      <div className="absolute right-2 bottom-2 flex flex-col gap-1 pb-safe">
        <div className="flex flex-col overflow-hidden rounded-lg border border-stone-700/70 bg-stone-900/85 backdrop-blur">
          <button type="button" className="btn-icon rounded-none" onClick={() => zoomAt(1.5)} aria-label="Zoom in">
            <Plus size={18} />
          </button>
          <button type="button" className="btn-icon rounded-none border-t border-stone-800" onClick={() => zoomAt(1 / 1.5)} aria-label="Zoom out">
            <Minus size={18} />
          </button>
          <button type="button" className="btn-icon rounded-none border-t border-stone-800" onClick={home} aria-label="Reset view" disabled={view.s === 1}>
            <RotateCcw size={16} />
          </button>
        </div>
        <button type="button" className="btn-icon rounded-lg border border-stone-700/70 bg-stone-900/85 backdrop-blur" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>
          {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
        </button>
      </div>
      {toolbar && <div className="absolute top-2 left-2 flex flex-wrap gap-1.5 pt-safe">{toolbar}</div>}
    </div>
  );
  // In-page full screen is drawn at the top of the page: inside the app's scroll area a fixed
  // element would be held in by its container.
  return fullscreen && pageFullscreen ? createPortal(content, document.body) : content;
}
