// The harness says yes to every question, and keeps them (window.__confirms) so a test can check what was asked.
type Q = { title?: string; message?: string; confirmLabel?: string };
export const useConfirm = () => async (q: Q) => {
  const w = window as unknown as { __confirms?: Q[] };
  (w.__confirms ??= []).push(q);
  return true;
};
export function ConfirmProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
