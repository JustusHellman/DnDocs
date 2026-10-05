import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Entity } from '../types';
import { useAuth } from './AuthContext';

/**
 * The reading desk.
 *
 * Entries open in "slots" next to the page (desktop) or in a sheet (phone). Slots share a fixed
 * area instead of piling up: you can have up to MAX_SLOTS side by side, each with its own
 * back/forward history, and you rearrange them by dragging names onto a slot or its edges.
 */

export interface PeekItem {
  id: string;
  title: string;
  type: string;
  /** Highlight (e.g. the DM pushed it) until the user opens it. */
  flash?: boolean;
}

export interface Slot {
  key: string;
  history: string[];
  index: number;
}

export const MAX_SLOTS = 3;

export type DropTarget =
  | { kind: 'replace'; slot: string }
  | { kind: 'insert'; index: number };

interface PeekApi {
  /** Recently viewed entries, most recent first. */
  items: PeekItem[];
  slots: Slot[];
  focused: string | null;
  /** Entry shown in the focused slot. */
  activeId: string | null;
  isOpen: boolean;
  /** Desktop: hide the page so the slots get the whole width. */
  pageHidden: boolean;
  setPageHidden: (hidden: boolean) => void;
  /** Open an entry: in the focused slot by default, or in a new slot. */
  peek: (entity: Pick<Entity, 'id' | 'name' | 'type'>, opts?: { background?: boolean; flash?: boolean; newSlot?: boolean }) => void;
  /** Open an entry already in the recent list. */
  activate: (id: string, opts?: { newSlot?: boolean }) => void;
  drop: (entryId: string, target: DropTarget, fromSlot?: string) => void;
  focus: (slotKey: string) => void;
  back: (slotKey: string) => void;
  forward: (slotKey: string) => void;
  closeSlot: (slotKey: string) => void;
  /** Close the focused slot. */
  close: () => void;
  closeAll: () => void;
  remove: (id: string) => void;
}

const Ctx = createContext<PeekApi | undefined>(undefined);
const MAX_ITEMS = 16;
const MAX_HISTORY = 20;

interface Store {
  key: string | null;
  items: PeekItem[];
}

function storageKey(campaignId?: string) {
  return campaignId ? `peek:${campaignId}` : null;
}

function loadItems(key: string | null): PeekItem[] {
  if (!key) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    const list: unknown = Array.isArray(raw) ? raw : raw?.items;
    return Array.isArray(list)
      ? list.filter((i): i is PeekItem => !!i && typeof i === 'object' && typeof (i as PeekItem).id === 'string').slice(0, MAX_ITEMS)
      : [];
  } catch {
    return [];
  }
}

let slotSeq = 0;
const newSlot = (entryId: string): Slot => ({ key: `s${++slotSeq}`, history: [entryId], index: 0 });
const current = (s: Slot) => s.history[s.index];

function navigate(slot: Slot, entryId: string): Slot {
  if (current(slot) === entryId) return slot;
  const history = [...slot.history.slice(0, slot.index + 1), entryId].slice(-MAX_HISTORY);
  return { ...slot, history, index: history.length - 1 };
}

export function PeekProvider({ children }: { children: ReactNode }) {
  const { currentCampaign } = useAuth();
  const key = storageKey(currentCampaign?.id);
  const [store, setStore] = useState<Store>({ key: null, items: [] });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  const [pageHidden, setPageHidden] = useState(false);
  const focusedRef = useRef<string | null>(null);
  focusedRef.current = focused;
  const items = store.key === key ? store.items : [];

  useEffect(() => {
    setSlots([]);
    setFocused(null);
    setStore({ key, items: loadItems(key) });
  }, [key]);

  useEffect(() => {
    if (!store.key) return;
    try {
      localStorage.setItem(store.key, JSON.stringify({ items: store.items.map((i) => ({ id: i.id, title: i.title, type: i.type })) }));
    } catch {
      /* storage unavailable – recents just aren't remembered */
    }
  }, [store]);

  // Keep focus pointing at an existing slot.
  useEffect(() => {
    if (!slots.length) {
      if (focused) setFocused(null);
      setPageHidden(false);
    } else if (!slots.some((s) => s.key === focused)) setFocused(slots[slots.length - 1].key);
  }, [slots, focused]);

  const remember = useCallback((entity: Pick<Entity, 'id' | 'name' | 'type'>, flash?: boolean, background?: boolean) => {
    setStore((s) => {
      const existing = s.items.find((i) => i.id === entity.id);
      const item: PeekItem = {
        id: entity.id,
        title: entity.name,
        type: entity.type,
        flash: !!flash || (background ? !!existing?.flash : false),
      };
      return { ...s, items: [item, ...s.items.filter((i) => i.id !== entity.id)].slice(0, MAX_ITEMS) };
    });
  }, []);

  const unflash = useCallback((id: string) => {
    setStore((s) => (s.items.some((i) => i.id === id && i.flash) ? { ...s, items: s.items.map((i) => (i.id === id ? { ...i, flash: false } : i)) } : s));
  }, []);

  const open = useCallback(
    (id: string, opts?: { newSlot?: boolean }) => {
      unflash(id);
      setSlots((prev) => {
        // Already visible somewhere? Just focus it.
        const showing = prev.find((s) => current(s) === id);
        if (showing && !opts?.newSlot) {
          setFocused(showing.key);
          return prev;
        }
        if (!prev.length || (opts?.newSlot && prev.length < MAX_SLOTS)) {
          const s = newSlot(id);
          setFocused(s.key);
          return [...prev, s];
        }
        const target = prev.find((s) => s.key === focusedRef.current) ?? prev[prev.length - 1];
        setFocused(target.key);
        return prev.map((s) => (s.key === target.key ? navigate(s, id) : s));
      });
    },
    [unflash],
  );

  const peek = useCallback<PeekApi['peek']>(
    (entity, opts) => {
      remember(entity, opts?.flash, opts?.background);
      if (!opts?.background) open(entity.id, opts);
    },
    [remember, open],
  );

  const drop = useCallback<PeekApi['drop']>(
    (entryId, target, fromSlot) => {
      unflash(entryId);
      setSlots((prev) => {
        let next = prev;
        if (target.kind === 'replace') {
          if (fromSlot === target.slot) return prev;
          next = prev.map((s) => (s.key === target.slot ? navigate(s, entryId) : s));
          setFocused(target.slot);
        } else {
          // Moving a slot: take it out first so the count stays the same.
          const moving = fromSlot ? prev.find((s) => s.key === fromSlot) : undefined;
          const rest = moving ? prev.filter((s) => s.key !== fromSlot) : prev;
          if (!moving && rest.length >= MAX_SLOTS) {
            // Full: replace the slot nearest to the drop position instead.
            const near = rest[Math.min(Math.max(target.index, 0), rest.length - 1)];
            setFocused(near.key);
            return rest.map((s) => (s.key === near.key ? navigate(s, entryId) : s));
          }
          const originalIndex = moving ? prev.findIndex((s) => s.key === fromSlot) : -1;
          const index = moving && originalIndex < target.index ? target.index - 1 : target.index;
          const slot = moving ?? newSlot(entryId);
          next = [...rest];
          next.splice(Math.min(Math.max(index, 0), next.length), 0, slot);
          setFocused(slot.key);
        }
        return next;
      });
    },
    [unflash],
  );

  const closeSlot = useCallback((slotKey: string) => setSlots((prev) => prev.filter((s) => s.key !== slotKey)), []);

  const api = useMemo<PeekApi>(() => {
    const focusedSlot = slots.find((s) => s.key === focused) ?? slots[slots.length - 1];
    return {
      items,
      slots,
      focused: focusedSlot?.key ?? null,
      activeId: focusedSlot ? current(focusedSlot) : null,
      isOpen: slots.length > 0,
      pageHidden: pageHidden && slots.length > 0,
      setPageHidden,
      peek,
      activate: (id, opts) => open(id, opts),
      drop,
      focus: setFocused,
      back: (k) => setSlots((prev) => prev.map((s) => (s.key === k && s.index > 0 ? { ...s, index: s.index - 1 } : s))),
      forward: (k) => setSlots((prev) => prev.map((s) => (s.key === k && s.index < s.history.length - 1 ? { ...s, index: s.index + 1 } : s))),
      closeSlot,
      close: () => focusedSlot && closeSlot(focusedSlot.key),
      closeAll: () => setSlots([]),
      remove: (id) => {
        setStore((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));
        setSlots((prev) => prev.filter((s) => current(s) !== id));
      },
    };
  }, [items, slots, focused, pageHidden, peek, open, drop, closeSlot]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePeek() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePeek must be used inside PeekProvider');
  return ctx;
}

export const slotEntry = current;
