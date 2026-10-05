import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, GripVertical, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import clsx from 'clsx';
import { MAX_SLOTS, slotEntry, usePeek, type PeekItem, type Slot } from '../../contexts/PeekContext';
import { useCampaignData } from '../../contexts/CampaignDataContext';
import { TypeIcon } from '../ui/bits';
import { useEscape, useScrollLock } from '../ui/Modal';
import EntityView from '../entity/EntityView';
import { useDrag, useDragSource } from './drag';

/** Keeps one broken entry from taking the whole app down, and shows what went wrong. */
class SlotErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[DnDocs] Entry view crashed', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-4 rounded-lg border border-rose-800/50 bg-rose-950/60 p-4 text-sm text-rose-200">
        <p className="mb-2 font-semibold">This entry couldn’t be shown.</p>
        <p className="mb-3 font-mono text-xs break-words opacity-80">{this.state.error.message}</p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={this.props.onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }
}

function ShelfChip({ item }: { item: PeekItem }) {
  const { slots, activate } = usePeek();
  const { entityMap } = useCampaignData();
  const live = entityMap.get(item.id);
  const label = live?.name ?? item.title;
  const type = live?.type ?? item.type;
  const drag = useDragSource({ entryId: item.id, label, type });
  const open = slots.some((s) => slotEntry(s) === item.id);
  return (
    <button
      type="button"
      {...drag}
      onClick={(e) => activate(item.id, { newSlot: e.ctrlKey || e.metaKey })}
      aria-pressed={open}
      title="Click to open · drag onto a column (or its edge for a new column)"
      className={clsx(
        'flex max-w-[12rem] shrink-0 cursor-grab items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors select-none active:cursor-grabbing',
        open ? 'border-amber-500/60 bg-amber-500/10 text-amber-300' : 'border-stone-800 bg-stone-900 text-stone-400 hover:text-stone-200',
        item.flash && !open && 'animate-flash border-amber-500/60 text-amber-300',
      )}
    >
      <TypeIcon type={type} size={12} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Recently viewed entries: click to open, drag to place. */
function Shelf({ className }: { className?: string }) {
  const { items } = usePeek();
  if (!items.length) return null;
  return (
    <div className={clsx('scrollbar-none flex gap-1.5 overflow-x-auto', className)} aria-label="Recently viewed">
      {items.map((item) => (
        <ShelfChip key={item.id} item={item} />
      ))}
    </div>
  );
}

function SlotHeader({ slot, compact, onClose }: { slot: Slot; compact?: boolean; onClose: () => void }) {
  const { back, forward, slots, focused } = usePeek();
  const { entityMap } = useCampaignData();
  const navigate = useNavigate();
  const id = slotEntry(slot);
  const entity = entityMap.get(id);
  const drag = useDragSource(compact || !entity ? null : { entryId: id, label: entity.name, type: entity.type, fromSlot: slot.key });
  const isFocused = focused === slot.key && slots.length > 1;
  return (
    <div className={clsx('flex items-center gap-0.5 border-b bg-stone-900 px-1.5 py-1', isFocused ? 'border-amber-500/50' : 'border-stone-800')}>
      <button type="button" className="btn-icon-sm size-7" disabled={slot.index === 0} onClick={() => back(slot.key)} aria-label="Back" title="Back">
        <ArrowLeft size={15} />
      </button>
      {slot.index < slot.history.length - 1 && (
        <button type="button" className="btn-icon-sm size-7" onClick={() => forward(slot.key)} aria-label="Forward" title="Forward">
          <ArrowRight size={15} />
        </button>
      )}
      <div
        {...drag}
        className={clsx('flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 select-none', !compact && 'cursor-grab active:cursor-grabbing hover:bg-stone-800/60')}
        title={compact ? undefined : 'Drag to move this column'}
      >
        {!compact && <GripVertical size={13} className="shrink-0 text-stone-600" />}
        {entity && <TypeIcon type={entity.type} size={14} className="shrink-0 text-stone-500" />}
        <span className="truncate text-sm font-semibold text-stone-200">{entity?.name ?? 'Entry'}</span>
      </div>
      {!compact && (
        <button type="button" className="btn-icon-sm size-7" onClick={() => navigate(`/entity/${id}`)} aria-label="Open full page" title="Open full page">
          <BookOpen size={15} />
        </button>
      )}
      <button type="button" className="btn-icon-sm size-7" onClick={onClose} aria-label="Close" title="Close">
        <X size={16} />
      </button>
    </div>
  );
}

function SlotBody({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  const id = slotEntry(slot);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [id]);
  return (
    <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <SlotErrorBoundary key={id} onClose={onClose}>
        <EntityView key={id} entityId={id} variant="panel" />
      </SlotErrorBoundary>
    </div>
  );
}

function SlotColumn({ slot, index }: { slot: Slot; index: number }) {
  const { focus, closeSlot } = usePeek();
  const { drag } = useDrag();
  const hover = drag?.hover?.slot === slot.key ? drag.hover.zone : undefined;
  return (
    <section
      data-drop-slot={slot.key}
      data-slot-index={index}
      onPointerDownCapture={() => focus(slot.key)}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-stone-950"
    >
      <SlotHeader slot={slot} onClose={() => closeSlot(slot.key)} />
      <SlotBody slot={slot} onClose={() => closeSlot(slot.key)} />
      {drag && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className={clsx('absolute inset-y-0 left-0 w-[22%] transition-colors', hover === 'left' && 'border-l-4 border-amber-500 bg-amber-500/15')} />
          <div className={clsx('absolute inset-y-0 right-0 w-[22%] transition-colors', hover === 'right' && 'border-r-4 border-amber-500 bg-amber-500/15')} />
          <div className={clsx('absolute inset-y-0 left-[22%] right-[22%] transition-colors', hover === 'center' && 'bg-amber-500/10 ring-2 ring-inset ring-amber-500/60')} />
        </div>
      )}
    </section>
  );
}

function readWidth(): number | null {
  try {
    const v = Number(localStorage.getItem('desk:width'));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Desktop reading desk: up to three entries side by side in a resizable area next to the page.
 * The area never grows past what you give it – extra columns share the space.
 */
export function Desk() {
  const { slots, pageHidden, setPageHidden, closeAll, close } = usePeek();
  const { drag } = useDrag();
  const [width, setWidth] = useState<number | null>(readWidth);
  const ref = useRef<HTMLElement>(null);
  useEscape(slots.length > 0 && !drag, close);

  if (!slots.length) return null;

  // Default width grows a little with the number of columns; a dragged width wins.
  const auto = Math.min(420 + (slots.length - 1) * 300, Math.round(window.innerWidth * 0.62));
  const w = width ?? auto;

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const start = ref.current?.offsetWidth ?? w;
    const max = window.innerWidth - 68 - 360;
    let last = start;
    const move = (ev: PointerEvent) => {
      last = Math.max(320, Math.min(max, start + (sx - ev.clientX)));
      setWidth(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.documentElement.classList.remove('is-resizing');
      try {
        localStorage.setItem('desk:width', String(Math.round(last)));
      } catch {
        /* ignore */
      }
    };
    document.documentElement.classList.add('is-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <aside
      ref={ref}
      aria-label="Reading desk"
      className={clsx('relative flex h-full min-w-0 flex-col border-l border-stone-700 bg-stone-950/70 animate-panel-in', pageHidden ? 'flex-1' : 'min-w-[320px] shrink')}
      style={pageHidden ? undefined : { width: w }}
    >
      {!pageHidden && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize"
          title="Drag to resize · double-click to reset"
          onPointerDown={startResize}
          onDoubleClick={() => {
            setWidth(null);
            try {
              localStorage.removeItem('desk:width');
            } catch {
              /* ignore */
            }
          }}
          className="group absolute inset-y-0 -left-1.5 z-20 w-3 cursor-col-resize"
        >
          <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-amber-500/60" />
        </div>
      )}
      <div className="flex items-center gap-2 border-b border-stone-800 px-2 py-1.5">
        <button
          type="button"
          className="btn-icon-sm shrink-0"
          onClick={() => setPageHidden(!pageHidden)}
          aria-label={pageHidden ? 'Show the page' : 'Hide the page'}
          title={pageHidden ? 'Show the page' : 'Hide the page – give the desk the whole screen'}
        >
          {pageHidden ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <Shelf className="min-w-0 flex-1 py-0.5" />
        <button type="button" onClick={closeAll} className="btn-icon-sm shrink-0" aria-label="Close all" title="Close all">
          <X size={17} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 gap-px bg-stone-700/70">
        {slots.map((s, i) => (
          <SlotColumn key={s.key} slot={s} index={i} />
        ))}
      </div>
      {slots.length === 1 && !drag && (
        <p className="border-t border-stone-800 px-3 py-1.5 text-center text-[11px] text-stone-500 italic">
          Drag a name from the shelf (or a card from the page) onto an edge to read two side by side · Ctrl-click opens a new column
        </p>
      )}
    </aside>
  );
}

/** Shown over the page while dragging: drop here to open a new column. */
export function PageDropZone() {
  const { drag } = useDrag();
  const { slots } = usePeek();
  if (!drag || drag.payload.fromSlot || slots.length >= MAX_SLOTS) return null;
  const active = drag.hover?.insert === 0;
  return (
    <div
      data-drop-insert={0}
      className={clsx(
        'absolute inset-y-4 right-4 z-30 flex w-56 items-center justify-center rounded-xl border-2 border-dashed text-center text-sm font-semibold transition-colors',
        active ? 'border-amber-500 bg-amber-500/15 text-amber-400' : 'border-stone-600 bg-stone-900/80 text-stone-500',
      )}
    >
      {slots.length ? 'Drop to open in a new column' : 'Drop to open'}
    </div>
  );
}

/** Phones & tablets: one entry at a time in a sheet that can be swiped down to close. */
export function PeekSheet() {
  const { slots, focused, closeAll } = usePeek();
  const slot = slots.find((s) => s.key === focused) ?? slots[slots.length - 1];
  const isOpen = !!slot;
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);
  useScrollLock(isOpen);
  useEscape(isOpen, closeAll);

  useEffect(() => setDragY(0), [isOpen]);
  if (!slot) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current === null) return;
    setDragY(Math.max(0, e.clientY - start.current));
  };
  const onPointerUp = () => {
    if (dragY > 110) closeAll();
    else setDragY(0);
    start.current = null;
  };

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={closeAll} style={{ opacity: Math.max(0.2, 1 - dragY / 400) }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick view"
        className="absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col rounded-t-2xl border-t border-stone-700 bg-stone-950 shadow-2xl animate-sheet-up md:inset-x-auto md:top-0 md:right-0 md:h-dvh md:w-[min(560px,90vw)] md:rounded-none md:border-t-0 md:border-l md:animate-panel-in"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: start.current === null ? 'transform 180ms ease' : 'none' }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 md:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="h-1.5 w-12 rounded-full bg-stone-700" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col pb-safe md:pt-safe">
          <Shelf className="px-3 pt-1 pb-2" />
          <SlotHeader slot={slot} compact onClose={closeAll} />
          <SlotBody slot={slot} onClose={closeAll} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
