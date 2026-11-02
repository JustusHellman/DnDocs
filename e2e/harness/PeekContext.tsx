export const usePeek = () => ({ peek: () => {}, remove: () => {}, close: () => {}, activeId: null }) as never;
export function PeekProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
export const MAX_SLOTS = 3;
export const slotEntry = (s: { entries: string[]; index: number }) => s?.entries?.[s.index];
