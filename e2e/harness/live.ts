import { useSyncExternalStore } from 'react';
import type { PlayLive } from '../../src/lib/play/model';
import type { Spell } from '../../src/lib/play/spells';
export interface SpellNote { x: string; h?: string; by: string }
export interface LiveSnapshot { play: Record<string, PlayLive>; dm: Record<string, { conc?: 1 }>; custom: Spell[]; notes: Record<string, SpellNote>; ready: boolean }
let snap: LiveSnapshot = { play: {
    c_lyra: { uid: 'p1', name: 'Lyra Starwhisper', s: { '1': 1 }, r: { x_star: 1 }, h: { '8': 2 } },
    c_brom: { uid: 'p2', name: 'Brom Ironfist', r: { surge: 1 }, re: 1 },
    t_gob2: { uid: 'dm1', name: 'Goblin Boss', re: 1 } }, dm: {}, custom: [], notes: {}, ready: true };
const subs = new Set<() => void>();
const emit = (n: Partial<LiveSnapshot>) => { snap = { ...snap, ...n }; subs.forEach((f) => f()); };
export const useTableLive = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => snap);
export const tableLive = () => snap;
export function listenTable() { return () => undefined; }
export async function patchPlay(_c: string, key: string, owner: string, name: string, patch: Record<string, unknown>) {
  const cur = structuredClone(snap.play[key] ?? {}) as Record<string, unknown>;
  cur.uid = owner; cur.name = name;
  for (const [k, v] of Object.entries(patch)) {
    const path = k.split('/'); let o = cur;
    for (const p of path.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
    if (v === null) delete o[path[path.length - 1]]; else o[path[path.length - 1]] = v;
  }
  emit({ play: { ...snap.play, [key]: cur as PlayLive } });
}
export async function setPlay(_c: string, key: string, owner: string, name: string, live: PlayLive) { emit({ play: { ...snap.play, [key]: { ...live, uid: owner, name } } }); }
export async function setDmConc(_c: string, key: string, on: boolean) { emit({ dm: { ...snap.dm, [key]: on ? { conc: 1 } : {} } }); }
export async function saveCustomSpell(_c: string, sp: Spell) { emit({ custom: [...snap.custom.filter((s) => s.i !== sp.i), sp] }); }
export async function deleteCustomSpell(_c: string, id: string) { emit({ custom: snap.custom.filter((s) => s.i !== id) }); }

export async function saveSpellNote(_c: string, sp: Spell, by: string, x: string, h?: string) {
  const notes = { ...snap.notes };
  if (!x.trim()) delete notes[sp.i]; else notes[sp.i] = { x, ...(h ? { h } : {}), by };
  emit({ notes });
}
