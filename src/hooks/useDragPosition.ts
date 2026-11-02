import { useCallback, useEffect, useState } from 'react';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

/**
 * A floating window you drag by its header: where it sits (its top-left corner in px, on the
 * screen), remembered on this device under `key`. null: its usual spot. It stays on screen when
 * the window shrinks; a double-click on the header (`reset`) puts it back.
 */
export function useDragPosition(key: string, panel: React.RefObject<HTMLElement | null>, fallbackWidth = 360) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const p = JSON.parse(read(key) || 'null') as { x: number; y: number } | null;
      return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
    } catch {
      return null;
    }
  });
  const clamp = useCallback(
    (p: { x: number; y: number }) => {
      const el = panel.current;
      const w = el?.offsetWidth ?? fallbackWidth;
      const h = el?.offsetHeight ?? 300;
      return { x: Math.max(4, Math.min(window.innerWidth - w - 4, p.x)), y: Math.max(4, Math.min(window.innerHeight - Math.min(h, 120) - 4, p.y)) };
    },
    [panel, fallbackWidth],
  );
  useEffect(() => {
    if (!pos) return;
    const on = () => setPos((p) => (p ? clamp(p) : p));
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [pos !== null, clamp]); // eslint-disable-line react-hooks/exhaustive-deps
  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, select, input, a, [role="tab"]')) return;
    const el = panel.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    let last = { x: r.left, y: r.top };
    const move = (ev: PointerEvent) => {
      last = clamp({ x: ev.clientX - dx, y: ev.clientY - dy });
      setPos(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      write(key, JSON.stringify(last));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };
  const reset = () => {
    setPos(null);
    write(key, null);
  };
  /** Header props: drag it, double-click it to put the window back. */
  const handle = (enabled: boolean) =>
    enabled
      ? {
          onPointerDown: startDrag,
          onDoubleClick: (e: React.MouseEvent) => !(e.target as HTMLElement).closest('button, select, input') && reset(),
          title: 'Drag to move (double-click to put it back)',
        }
      : {};
  return { pos, startDrag, reset, handle };
}
