import { useLayoutEffect, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useEscape } from './Modal';

interface PopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  align?: 'start' | 'end';
  className?: string;
}

/** Small floating panel positioned next to an anchor and kept inside the viewport. */
export function Popover({ anchorRef, open, onClose, children, width = 260, align = 'end', className }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  useEscape(open, onClose);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - 16);
      let left = align === 'end' ? a.right - w : a.left;
      left = Math.max(8, Math.min(left, vw - w - 8));
      const panelH = panelRef.current?.offsetHeight ?? 240;
      const below = vh - a.bottom - 8;
      const openUp = below < Math.min(panelH, 240) && a.top > below;
      const top = openUp ? Math.max(8, a.top - 6 - Math.min(panelH, a.top - 16)) : a.bottom + 6;
      setPos({ top, left, maxHeight: openUp ? a.top - 16 : below - 8 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, width, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panelRef}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: Math.min(width, window.innerWidth - 16), maxHeight: pos?.maxHeight }}
      className={clsx(
        'fixed z-[150] overflow-y-auto rounded-xl border border-stone-700/80 bg-stone-900 p-1.5 shadow-2xl shadow-black/50 animate-pop-in',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
  active,
  disabled,
}: {
  icon?: React.ElementType;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-50',
        danger ? 'text-rose-300 hover:bg-rose-950/50' : 'text-stone-200 hover:bg-stone-800',
        active && 'bg-stone-800 text-amber-300',
      )}
    >
      {Icon && <Icon size={16} className="shrink-0" />}
      <span className="flex-1">{children}</span>
    </button>
  );
}
