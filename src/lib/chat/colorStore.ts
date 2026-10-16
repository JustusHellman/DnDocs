/**
 * The table colours for the open campaign, shared by everything that shows them (chat, dice,
 * battle map, members). The chat (always mounted) keeps it filled; everyone else just reads.
 */
import { useSyncExternalStore } from 'react';
import { FALLBACK } from './colors';

let colors: Record<string, string> = {};
let loaded = false;
const subs = new Set<() => void>();

/** `ready`: false while the first snapshot hasn't arrived (e.g. switching campaigns). */
export function setColorsSnapshot(next: Record<string, string>, ready = true) {
  colors = next;
  loaded = ready;
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

/** Everyone's colour by uid (only those who have one). */
export const useTableColors = () => useSyncExternalStore(subscribe, () => colors);

/** Someone's colour, or the old gold for anyone without one yet. */
export const colorOf = (all: Record<string, string>, uid: string | undefined | null) => (uid && all[uid]) || FALLBACK;

/** Whether the colours have arrived from the database at least once for this campaign. */
export const colorsLoaded = () => loaded;
