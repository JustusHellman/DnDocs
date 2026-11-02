/**
 * The app's own events between parts that don't share a parent: the chat, the spellbook panel,
 * the play dialogs and the battle map. One typed list of what can be said and what comes with it,
 * instead of loose `window` events with a string name and an untyped detail each.
 */
import { useEffect, useRef } from 'react';
import type { AreaShape } from '../chat/events';
import type { HitRequest } from '../battle/aimStore';
import type { AreaHit, CastArea, PlayOpen } from './ui';

export interface TableEvents {
  /** Open a play dialog (cast, rest, spells, set-up, level up). */
  play: PlayOpen;
  /** The DM casts a spell for a creature. */
  npccast: { spellId: string };
  /** Open, toggle or close the spellbook panel. */
  book: { entityId?: string; toggle?: boolean; close?: boolean };
  /** Place a spell's area on the open battle map. */
  'cast-area': CastArea;
  /** The DM applies a player's area (from the chat) on the battle map. */
  'area-apply': { spell: string; scene: string; shape: AreaShape; hit: AreaHit };
  /** Damage or healing for chosen tokens: the battle map shows it first, then applies it. */
  hit: HitRequest;
}

type Name = keyof TableEvents;
const type = (name: Name) => `dndocs:${name}`;

export function emit<K extends Name>(name: K, detail: TableEvents[K]) {
  window.dispatchEvent(new CustomEvent(type(name), { detail }));
}

/** Listen until the returned function is called. */
export function listen<K extends Name>(name: K, handler: (detail: TableEvents[K]) => void): () => void {
  const on = (e: Event) => handler((e as CustomEvent<TableEvents[K]>).detail);
  window.addEventListener(type(name), on);
  return () => window.removeEventListener(type(name), on);
}

/** Listen while the component is mounted (the latest handler is called, no re-subscribing). */
export function useTableEvent<K extends Name>(name: K, handler: (detail: TableEvents[K]) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => (enabled ? listen(name, (d) => ref.current(d)) : undefined), [name, enabled]);
}
