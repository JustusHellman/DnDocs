import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { friendlyError, logError } from '../lib/errors';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, opts?: { kind?: ToastKind; action?: Toast['action']; duration?: number }) => void;
  success: (message: string) => void;
  error: (error: unknown, context?: string) => void;
}

const Ctx = createContext<ToastApi | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastApi['show']>(
    (message, opts) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, message, kind: opts?.kind ?? 'info', action: opts?.action }]);
      window.setTimeout(() => dismiss(id), opts?.duration ?? (opts?.action ? 8000 : 4000));
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, { kind: 'success' }),
      error: (err, context) => {
        if (context) logError(context, err);
        show(friendlyError(err), { kind: 'error', duration: 6000 });
      },
    }),
    [show],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[200] flex flex-col items-center gap-2 px-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-6 md:items-end md:right-6 md:left-auto"
      >
        {toasts.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertTriangle : Info;
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={clsx(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-md animate-toast-in',
                t.kind === 'error' && 'border-rose-800/60 bg-rose-950/90 text-rose-100',
                t.kind === 'success' && 'border-emerald-800/60 bg-emerald-950/90 text-emerald-100',
                t.kind === 'info' && 'border-stone-700 bg-stone-900/95 text-stone-100',
              )}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1">{t.message}</p>
              {t.action && (
                <button
                  className="shrink-0 font-semibold text-amber-300 hover:text-amber-200"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button aria-label="Dismiss" className="shrink-0 text-stone-400 hover:text-stone-100" onClick={() => dismiss(t.id)}>
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
