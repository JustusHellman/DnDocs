import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MAX_SLOTS, usePeek, type DropTarget } from '../../contexts/PeekContext';
import { TypeIcon } from '../ui/bits';

/**
 * Pointer-based drag & drop for entry names (works inside iframes and doesn't depend on the
 * browser's HTML5 drag ghost). Drop targets are marked up with data attributes:
 *   data-drop-slot="<slotKey>" data-slot-index="<n>"  – a slot (edges insert, middle replaces)
 *   data-drop-insert="<n>"                             – a zone that inserts a new slot at n
 */

export interface DragPayload {
  entryId: string;
  label: string;
  type: string;
  fromSlot?: string;
}

interface DragState {
  payload: DragPayload;
  x: number;
  y: number;
  target: DropTarget | null;
  /** For highlighting: which slot / edge is hovered. */
  hover: { slot?: string; zone?: 'left' | 'right' | 'center'; insert?: number } | null;
}

interface DragApi {
  drag: DragState | null;
  start: (e: React.PointerEvent, payload: DragPayload) => void;
}

const Ctx = createContext<DragApi>({ drag: null, start: () => undefined });

function resolveTarget(x: number, y: number, slotCount: number, fromSlot?: string): Pick<DragState, 'target' | 'hover'> {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const canInsert = slotCount < MAX_SLOTS || !!fromSlot;
  const insertEl = el?.closest<HTMLElement>('[data-drop-insert]');
  if (insertEl) {
    const index = Number(insertEl.dataset.dropInsert);
    return canInsert ? { target: { kind: 'insert', index }, hover: { insert: index } } : { target: null, hover: null };
  }
  const slotEl = el?.closest<HTMLElement>('[data-drop-slot]');
  if (slotEl) {
    const slot = slotEl.dataset.dropSlot!;
    const index = Number(slotEl.dataset.slotIndex);
    const r = slotEl.getBoundingClientRect();
    const rel = (x - r.left) / r.width;
    if (canInsert && rel < 0.22) return { target: { kind: 'insert', index }, hover: { slot, zone: 'left' } };
    if (canInsert && rel > 0.78) return { target: { kind: 'insert', index: index + 1 }, hover: { slot, zone: 'right' } };
    if (slot === fromSlot) return { target: null, hover: null };
    return { target: { kind: 'replace', slot }, hover: { slot, zone: 'center' } };
  }
  return { target: null, hover: null };
}

export function DragProvider({ children }: { children: ReactNode }) {
  const { slots, drop } = usePeek();
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const slotCount = useRef(slots.length);
  slotCount.current = slots.length;

  const start = useCallback(
    (e: React.PointerEvent, payload: DragPayload) => {
      // Mouse and pen only: on touch screens a drag would fight with scrolling.
      if (e.pointerType === 'touch' || e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let active = false;

      const move = (ev: PointerEvent) => {
        if (!active) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          active = true;
          document.documentElement.classList.add('is-dragging');
        }
        ev.preventDefault();
        const t = resolveTarget(ev.clientX, ev.clientY, slotCount.current, payload.fromSlot);
        setDrag({ payload, x: ev.clientX, y: ev.clientY, ...t });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        document.documentElement.classList.remove('is-dragging');
        if (!active) return;
        const d = dragRef.current;
        setDrag(null);
        if (d?.target) drop(payload.entryId, d.target, payload.fromSlot);
        // Swallow the click that follows a drag so it doesn't also open the entry.
        const swallow = (ce: MouseEvent) => {
          ce.stopPropagation();
          ce.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 50);
      };
      const cancel = () => {
        active = false;
        up();
        setDrag(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    },
    [drop],
  );

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrag(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [!!drag]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={{ drag, start }}>
      {children}
      {drag &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[300] flex items-center gap-2 rounded-md border border-amber-500/60 bg-stone-900 px-3 py-1.5 text-sm font-semibold text-stone-100 shadow-xl"
            style={{ left: drag.x + 12, top: drag.y + 10 }}
          >
            <TypeIcon type={drag.payload.type} size={15} className="text-amber-500" />
            {drag.payload.label}
            <span className="text-xs font-normal text-stone-500 italic">
              {drag.target?.kind === 'replace' ? '→ show here' : drag.target?.kind === 'insert' ? '→ new column' : ''}
            </span>
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

export function useDrag() {
  return useContext(Ctx);
}

/** Spread onto an element to make it a drag source for an entry. */
export function useDragSource(payload: DragPayload | null) {
  const { start } = useDrag();
  return {
    onPointerDown: (e: React.PointerEvent) => payload && start(e, payload),
  };
}
