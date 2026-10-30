/**
 * The table's live state, shared by everyone (Realtime Database, next to the chat):
 *   rooms/{campaign}/play/{key}     slots, resources, hit dice, concentration, reaction
 *   rooms/{campaign}/dmplay/{key}   the DM's own marks (an enemy's concentration)
 *   rooms/{campaign}/spells/{id}    the campaign's own spell cards
 * One listener each for the whole campaign (the chat keeps them running); every screen reads the
 * same snapshot.
 */
import { useSyncExternalStore } from 'react';
import { chatAvailable, chatDb } from '../chat/service';
import { logError } from '../errors';
import type { PlayLive } from './model';
import { cleanCustomSpell, type Spell } from './spells';

export interface LiveSnapshot {
  play: Record<string, PlayLive>;
  dm: Record<string, { conc?: 1 }>;
  custom: Spell[];
  /** Descriptions players wrote for spells that come without text (by spell id). */
  notes: Record<string, SpellNote>;
  ready: boolean;
}
export interface SpellNote {
  x: string;
  h?: string;
  by: string;
}

let snap: LiveSnapshot = { play: {}, dm: {}, custom: [], notes: {}, ready: false };
const subs = new Set<() => void>();
const emit = (next: Partial<LiveSnapshot>) => {
  snap = { ...snap, ...next };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
export const useTableLive = () => useSyncExternalStore(subscribe, () => snap);
export const tableLive = () => snap;

const room = (cid: string) => `rooms/${cid}`;

/** Start following the campaign's live state (the chat calls this once it's connected). */
export function listenTable(cid: string, isDM: boolean): () => void {
  if (!chatAvailable) return () => undefined;
  let stopped = false;
  const unsubs: (() => void)[] = [];
  emit({ play: {}, dm: {}, custom: [], notes: {}, ready: false });
  chatDb()
    .then(({ db, m }) => {
      if (stopped) return;
      const quiet = (what: string) => (err: Error) => !/permission/i.test(String(err)) && logError(what, err);
      unsubs.push(m.onValue(m.ref(db, `${room(cid)}/play`), (s) => emit({ play: (s.val() as Record<string, PlayLive>) ?? {}, ready: true }), quiet('Table state')));
      if (isDM) unsubs.push(m.onValue(m.ref(db, `${room(cid)}/dmplay`), (s) => emit({ dm: (s.val() as LiveSnapshot['dm']) ?? {} }), quiet('DM marks')));
      unsubs.push(
        m.onValue(
          m.ref(db, `${room(cid)}/spells`),
          (s) => {
            const out: Spell[] = [];
            const notes: Record<string, SpellNote> = {};
            s.forEach((c) => {
              const v = c.val() as { by?: string; j?: string };
              try {
                // Not a card of our own ("x-…"): a description written for an existing spell.
                if (!c.key!.startsWith('x-')) {
                  const t = JSON.parse(v.j ?? '{}') as { x?: string; h?: string };
                  if (t.x) notes[c.key!] = { x: String(t.x).slice(0, 2500), ...(t.h ? { h: String(t.h).slice(0, 600) } : {}), by: v.by ?? '' };
                  return;
                }
                out.push(cleanCustomSpell({ ...(JSON.parse(v.j ?? '{}') as Spell), i: c.key! }, v.by ?? ''));
              } catch {
                /* a broken card is skipped */
              }
            });
            emit({ custom: out.sort((a, b) => a.l - b.l || a.n.localeCompare(b.n)), notes });
          },
          quiet('Spell cards'),
        ),
      );
    })
    .catch((err) => logError('Table state', err));
  return () => {
    stopped = true;
    unsubs.forEach((u) => u());
  };
}

/**
 * Change a character's (or token's) live state. `owner`: who it belongs to (the player, or the DM
 * for monsters); the database lets only them and the DMs change it. `patch` uses paths ("s/1": 2);
 * null removes.
 */
export async function patchPlay(cid: string, key: string, owner: string, name: string, patch: Record<string, unknown>) {
  if (!chatAvailable) throw new Error('The table chat isn’t set up yet (see the README), so trackers can’t be saved.');
  const { db, m } = await chatDb();
  await m.update(m.ref(db, `${room(cid)}/play/${key}`), { uid: owner, name: name.slice(0, 80), at: m.serverTimestamp(), ...patch });
}

/** Replace a character's live state (after a rest). */
export async function setPlay(cid: string, key: string, owner: string, name: string, live: PlayLive) {
  if (!chatAvailable) throw new Error('The table chat isn’t set up yet (see the README), so trackers can’t be saved.');
  const { db, m } = await chatDb();
  const { uid: _u, name: _n, ...rest } = live;
  await m.set(m.ref(db, `${room(cid)}/play/${key}`), { ...stripEmpty(rest), uid: owner, name: name.slice(0, 80), at: m.serverTimestamp() });
}

/** DM only: an enemy is concentrating (players don't see this). */
export async function setDmConc(cid: string, key: string, on: boolean) {
  const { db, m } = await chatDb();
  await m.set(m.ref(db, `${room(cid)}/dmplay/${key}/conc`), on ? 1 : null);
}

export async function saveCustomSpell(cid: string, sp: Spell) {
  const { db, m } = await chatDb();
  const { i, by, ...rest } = sp;
  await m.set(m.ref(db, `${room(cid)}/spells/${i}`), { by, n: sp.n, j: JSON.stringify(rest), at: m.serverTimestamp() });
}
/** A description in your own words for a spell that comes without one (or remove it with an empty text). */
export async function saveSpellNote(cid: string, spell: Spell, by: string, x: string, h?: string) {
  const { db, m } = await chatDb();
  const r = m.ref(db, `${room(cid)}/spells/${spell.i}`);
  if (!x.trim()) return m.remove(r);
  await m.set(r, { by, n: spell.n.slice(0, 80), j: JSON.stringify({ x: x.trim().slice(0, 2500), ...(h?.trim() ? { h: h.trim().slice(0, 600) } : {}) }), at: m.serverTimestamp() });
}
export async function deleteCustomSpell(cid: string, id: string) {
  const { db, m } = await chatDb();
  await m.remove(m.ref(db, `${room(cid)}/spells/${id}`));
}

function stripEmpty(o: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === 0) continue;
    if (typeof v === 'object' && !Object.keys(v as object).length) continue;
    out[k] = v;
  }
  return out;
}
