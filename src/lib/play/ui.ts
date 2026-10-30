/**
 * Opening the play dialogs (cast, rest, spells, tracker setup) from anywhere: the chat's
 * commands, the token card, the character page. One host (in the chat) shows them.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Derived, Edition, PlayDef } from './model';
import { loadSrdSpells, type Spell } from './spells';
import { useTableLive } from './live';

export type PlayOpen =
  | { kind: 'cast'; entityId: string; spellId?: string; level?: number }
  | { kind: 'spells'; entityId: string; tab?: 'ready' | 'choose' | 'write' }
  | { kind: 'rest'; entityId: string; rest: 'short' | 'long' }
  | { kind: 'settings'; entityId: string };

export function openPlay(o: PlayOpen) {
  window.dispatchEvent(new CustomEvent<PlayOpen>('dndocs:play', { detail: o }));
}

/** Place a spell's area on the open battle map (the map listens; nothing happens without one). */
export interface CastArea {
  spell: string;
  area: NonNullable<Spell['a']>;
  /** Starts at the caster (cones, lines, "Self (…)" spheres): the caster's character id… */
  fromEntity?: string;
  /** …or the token picked on the map (a creature the DM casts for). */
  fromSelected?: boolean;
  color?: string;
}
let mapsListening = 0;
/** The battle map says it can place areas (while it's open). */
export const mapListens = () => {
  mapsListening++;
  return () => {
    mapsListening--;
  };
};
export const canPlaceArea = () => mapsListening > 0;
/** The DM casts a spell for a creature (no slots: the numbers are typed in). */
export const openCreatureCast = (spellId: string) => window.dispatchEvent(new CustomEvent<{ spellId: string }>('dndocs:npccast', { detail: { spellId } }));
/** The token picked on the battle map, while one is (for a creature's spell). */
let picked: { id: string; name: string } | null = null;
export const setPickedToken = (t: { id: string; name: string } | null) => {
  picked = t;
};
export const pickedToken = () => picked;
export const placeCastArea = (a: CastArea) => window.dispatchEvent(new CustomEvent<CastArea>('dndocs:cast-area', { detail: a }));

/** All spells for the campaign's rules, plus its own cards, by id. Loads the SRD on first use. */
export function useSpellIndex(edition: Edition, enabled = true) {
  const [srd, setSrd] = useState<Spell[] | null>(null);
  const { custom, notes } = useTableLive();
  useEffect(() => {
    let live = true;
    setSrd(null);
    if (!enabled) return;
    loadSrdSpells(edition).then((s) => live && setSrd(s));
    return () => {
      live = false;
    };
  }, [edition, enabled]);
  return useMemo(() => {
    // Descriptions written at the table go onto the spells that come without text.
    const withNotes = (srd ?? []).map((s) => (notes[s.i] && !s.x ? { ...s, x: notes[s.i].x, h: notes[s.i].h ?? s.h, nb: notes[s.i].by } : s));
    const all = [...withNotes, ...custom].sort((a, b) => a.l - b.l || a.n.localeCompare(b.n));
    return { loading: !srd, all, byId: new Map(all.map((s) => [s.i, s])) };
  }, [srd, custom, notes]);
}

/** How a spell sits with this character. */
export type SpellMark = 'none' | 'known' | 'prepared' | 'always';

export function markOf(def: PlayDef, id: string): SpellMark {
  const sp = def.spells ?? {};
  if (sp.always?.includes(id)) return 'always';
  if (sp.prepared?.includes(id)) return 'prepared';
  if (sp.known?.includes(id)) return 'known';
  return 'none';
}

/** A new setup with the spell marked (a spellbook spell that gets prepared stays in the book). */
export function withMark(def: PlayDef, id: string, mark: SpellMark, d: Derived): PlayDef {
  const sp = { known: [...(def.spells?.known ?? [])], prepared: [...(def.spells?.prepared ?? [])], always: [...(def.spells?.always ?? [])] };
  const drop = (a: string[]) => a.filter((x) => x !== id);
  const book = d.prep === 'spellbook';
  sp.always = drop(sp.always);
  sp.prepared = drop(sp.prepared);
  if (!(book && mark === 'prepared')) sp.known = drop(sp.known);
  if (mark === 'always') sp.always.push(id);
  else if (mark === 'prepared') {
    sp.prepared.push(id);
    if (book && !sp.known.includes(id)) sp.known.push(id);
  } else if (mark === 'known') sp.known.push(id);
  return { ...def, spells: sp };
}

/** The spells this character can cast right now (cantrips first). */
export function readySpells(def: PlayDef, d: Derived, byId: Map<string, Spell>): Spell[] {
  const sp = def.spells ?? {};
  const ids = new Set<string>(sp.always ?? []);
  for (const id of sp.known ?? []) {
    const s = byId.get(id);
    if (s && (s.l === 0 || d.prep === 'known' || !d.prep)) ids.add(id);
  }
  if (d.prep !== 'known') for (const id of sp.prepared ?? []) ids.add(id);
  return [...ids]
    .map((id) => byId.get(id))
    .filter((s): s is Spell => !!s)
    .sort((a, b) => a.l - b.l || a.n.localeCompare(b.n));
}

/** How many prepared (or known) spells count against the limit (always-prepared ones don't). */
export function countChosen(def: PlayDef, d: Derived, byId: Map<string, Spell>) {
  const sp = def.spells ?? {};
  const list = d.prep === 'known' || !d.prep ? sp.known ?? [] : sp.prepared ?? [];
  const lvl = (id: string) => byId.get(id)?.l ?? 1;
  return {
    spells: list.filter((id) => lvl(id) > 0).length,
    cantrips: (sp.known ?? []).filter((id) => byId.get(id)?.l === 0).length,
  };
}
