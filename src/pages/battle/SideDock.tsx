import clsx from 'clsx';
import { Swords, X } from 'lucide-react';
import type { ReactNode } from 'react';

type Tab = 'turn' | 'token';

/**
 * The right side of the battle map: the initiative (or the DM's settings) on top and, under it, one
 * panel with two tabs — what the acting creature can do (the turn helper puts its list into
 * `turnSlot`) and the picked token's card. On phones the initiative stays top right and the panel is
 * a sheet at the bottom (`lift`: above the turn dots).
 */
export default function SideDock({
  top,
  lift,
  turnTab,
  tokenTab,
  tab,
  onTab,
  onClose,
  turnSlot,
  card,
}: {
  top: ReactNode;
  lift: boolean;
  turnTab: { label: string; title: string } | null;
  tokenTab: { label: string } | null;
  /** The tab showing (null: no panel). */
  tab: Tab | null;
  onTab: (t: Tab) => void;
  onClose: () => void;
  turnSlot: (el: HTMLDivElement | null) => void;
  card: ReactNode;
}) {
  const tabButton = (t: Tab, label: ReactNode, title?: string) => (
    <button
      type="button"
      onClick={() => onTab(t)}
      aria-pressed={tab === t}
      title={title}
      className={clsx('min-w-0 flex-1 truncate rounded-md px-2 py-1 text-xs font-semibold', tab === t ? 'bg-stone-800 text-stone-100' : 'text-stone-400 hover:text-stone-200')}
    >
      {label}
    </button>
  );
  return (
    <div
      className={clsx(
        'pointer-events-none absolute top-14 right-14 bottom-2 left-2 flex flex-col justify-between gap-2 sm:top-2 sm:right-14 sm:left-auto sm:w-[21rem] sm:justify-start sm:pt-safe',
        lift && 'max-sm:bottom-[3.5rem]',
      )}
    >
      <div className="pointer-events-auto flex shrink-0 flex-col items-end">{top}</div>
      {tab && (
        <div
          className="pointer-events-auto flex max-h-[60%] min-h-0 flex-col overflow-hidden rounded-xl border border-stone-700/80 bg-stone-950/95 shadow-2xl backdrop-blur sm:max-h-none"
          role="complementary"
          aria-label="Side panel"
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-stone-800 px-1.5 py-1">
            {turnTab &&
              tabButton(
                'turn',
                <>
                  <Swords size={12} className="mr-1 inline align-[-1px] text-amber-400" />
                  {turnTab.label}
                </>,
                turnTab.title,
              )}
            {tokenTab && tabButton('token', tokenTab.label)}
            <button type="button" className="btn-icon-sm shrink-0" aria-label={tab === 'turn' ? 'Close the list' : 'Close the token card'} onClick={onClose}>
              <X size={15} />
            </button>
          </div>
          <div ref={turnSlot} className={clsx('min-h-0 flex-1 flex-col', tab === 'turn' ? 'flex' : 'hidden')} />
          {tab === 'token' && <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{card}</div>}
        </div>
      )}
    </div>
  );
}
