import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../components/ui/Modal';

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | undefined>(undefined);

/** Promise based replacement for window.confirm that looks like the rest of the app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | undefined>(undefined);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = undefined;
    setOpts(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => close(false)}
        title={opts?.title}
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => close(false)}>
              Cancel
            </button>
            <button
              autoFocus
              className={opts?.danger ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={() => close(true)}
            >
              {opts?.confirmLabel ?? 'Confirm'}
            </button>
          </>
        }
      >
        {opts?.message && <div className="text-sm text-stone-300">{opts.message}</div>}
      </Modal>
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
