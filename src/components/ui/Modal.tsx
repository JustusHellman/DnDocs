import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

let openCount = 0;

/** Locks body scroll while at least one overlay is open. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    openCount++;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      openCount--;
      if (openCount === 0) document.documentElement.style.overflow = '';
    };
  }, [active]);
}

/** Escape closes only the top-most overlay. */
const escapeStack: (() => void)[] = [];
export function useEscape(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const fn = () => handler.current();
    escapeStack.push(fn);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escapeStack[escapeStack.length - 1] === fn) {
        e.stopPropagation();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = escapeStack.indexOf(fn);
      if (i >= 0) escapeStack.splice(i, 1);
    };
  }, [active]);
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Hide the default header (for custom layouts like image viewers). */
  bare?: boolean;
  className?: string;
}

/** Centered dialog on larger screens, bottom sheet on phones. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', bare, className }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(open);
  useEscape(open, onClose);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const first = panel.querySelector<HTMLElement>('[autofocus], input, textarea, select, button:not([data-close])');
      (first ?? panel).focus();
    }, 30);
    return () => {
      window.clearTimeout(t);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-stone-800 bg-stone-900 shadow-2xl outline-none',
          'rounded-t-2xl animate-sheet-up sm:rounded-2xl sm:animate-pop-in',
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
          size === 'xl' && 'sm:max-w-4xl',
          className,
        )}
      >
        {!bare && (
          <div className="flex items-start gap-3 border-b border-stone-800 px-5 pt-4 pb-3">
            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-stone-700 sm:hidden absolute left-1/2 top-1.5 -translate-x-1/2" />
            <div className="min-w-0 flex-1 pt-1">
              {title && (
                <h2 id={titleId} className="font-display text-lg font-semibold text-stone-50">
                  {title}
                </h2>
              )}
              {description && <p className="mt-0.5 text-sm text-stone-400">{description}</p>}
            </div>
            <button data-close className="btn-icon -mr-2 shrink-0" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        )}
        <div className={clsx('min-h-0 flex-1 overflow-y-auto overscroll-contain', !bare && 'px-5 py-4')}>{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-800 bg-stone-950/40 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
