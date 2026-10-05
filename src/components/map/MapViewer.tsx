import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minimize, Minus, Plus, RotateCcw } from 'lucide-react';
import clsx from 'clsx';

export interface ViewerPin {
  key: string;
  x: number; // percent
  y: number; // percent
  render: (opts: { scale: number }) => ReactNode;
  draggable?: boolean;
}

interface Props {
  src: string;
  alt: string;
  pins: ViewerPin[];
  /** Click on empty map area (percent coordinates) – used to place pins. */
  onMapClick?: (x: number, y: number) => void;
  onPinDrop?: (key: string, x: number, y: number) => void;
  onPinClick?: (key: string) => void;
  crosshair?: boolean;
  overlay?: ReactNode;
  toolbar?: ReactNode;
}

const MIN = 1;
const MAX = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Pan / zoom map with percent-positioned pins. Works with mouse (drag, wheel),
 * touch (drag, pinch, double tap) and keyboard (+/-/0).
 */
export default function MapViewer({ src, alt, pins, onMapClick, onPinDrop, onPinClick, crosshair, overlay, toolbar }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [base, setBase] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [dragPin, setDragPin] = useState<{ key: string; x: number; y: number } | null>(null);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; start?: { x: number; y: number }; startDist?: number; startScale?: number; lastTap?: number }>({ moved: false });

  // Fit the image into the available space.
  const measure = useCallback(() => {
    const el = viewRef.current;
    if (!el || !natural) return;
    const cw = el.parentElement?.clientWidth ?? el.clientWidth;
    const maxH = fullscreen ? window.innerHeight : Math.max(280, Math.min(window.innerHeight * 0.72, 900));
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
    setBase({ w, h });
  }, [natural, fullscreen]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  useEffect(() => setView({ s: 1, x: 0, y: 0 }), [src]);

  const constrain = useCallback(
    (v: { s: number; x: number; y: number }) => {
      const s = clamp(v.s, MIN, MAX);
      const w = base.w * s;
      const h = base.h * s;
      return { s, x: clamp(v.x, base.w - w, 0), y: clamp(v.y, base.h - h, 0) };
    },
    [base],
  );

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      setView((v) => {
        const px = cx ?? base.w / 2;
        const py = cy ?? base.h / 2;
        const s = clamp(v.s * factor, MIN, MAX);
        const k = s / v.s;
        return constrain({ s, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
      });
    },
    [base, constrain],
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

  const toPercent = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clamp(((clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((clientY - r.top) / r.height) * 100, 0, 100) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    viewRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current.moved = false;
      gesture.current.start = { x: e.clientX, y: e.clientY };
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.startDist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.startScale = view.s;
      gesture.current.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    const r = viewRef.current!.getBoundingClientRect();

    if (pointers.current.size === 2 && gesture.current.startDist) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
      const target = (gesture.current.startScale ?? 1) * (dist / gesture.current.startDist);
      setView((v) => {
        const s = clamp(target, MIN, MAX);
        const k = s / v.s;
        return constrain({ s, x: mid.x - (mid.x - v.x) * k, y: mid.y - (mid.y - v.y) * k });
      });
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
    if (pointers.current.size < 2) gesture.current.startDist = undefined;
    if (!had || pointers.current.size > 0) return;
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
    else onPinClick?.(pin.key);
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
    } else {
      if (el.requestFullscreen) await el.requestFullscreen().catch(() => undefined);
      setFullscreen(true);
    }
  };
  useEffect(() => {
    const onChange = () => !document.fullscreenElement && setFullscreen(false);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => setView({ s: 1, x: 0, y: 0 }), [fullscreen]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') zoomAt(1.4);
    else if (e.key === '-') zoomAt(1 / 1.4);
    else if (e.key === '0') setView({ s: 1, x: 0, y: 0 });
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={wrapRef}
      className={clsx(
        'relative flex items-center justify-center overflow-hidden rounded-2xl border border-stone-800 bg-stone-950',
        fullscreen && 'fixed inset-0 z-[100] rounded-none border-0 bg-black',
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
        className={clsx('relative touch-none overflow-hidden select-none outline-none', crosshair ? 'cursor-crosshair' : view.s > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default')}
        style={{ width: base.w || '100%', height: base.h || 320 }}
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
          <button type="button" className="btn-icon rounded-none border-t border-stone-800" onClick={() => setView({ s: 1, x: 0, y: 0 })} aria-label="Reset view" disabled={view.s === 1}>
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
}
