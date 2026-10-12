import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign, Entity, User } from '../types';

/**
 * Runs the real save code for player characters against an in-memory store that applies the
 * same checks as firestore.rules (create: DM, or a player making their own character; update:
 * DM, or the character's creator / player changing only the fields they're allowed to).
 */
const store = new Map<string, Record<string, any>>();
let writer = 'dm';
const DM = 'dm';
const PLAYER_FIELDS = ['name', 'content', 'tags', 'isPublic', 'locationId', 'gender', 'imageUrls', 'coverThumb', 'attributes', 'statBlock', 'dndStats', 'mapConfig', 'updatedAt'];

function changedKeys(before: Record<string, any>, after: Record<string, any>) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

function rulesAllow(path: string, data: Record<string, any>): string | null {
  if (!path.startsWith('entities/')) return null;
  const before = store.get(path);
  if (!before) {
    if (data.ownerId !== writer) return 'owner must be the writer';
    if (writer === DM || data.type === 'note') return null;
    if (data.type === 'character' && data.playerId === writer) return null;
    return 'players may only create notes and their own characters';
  }
  if (data.ownerId !== before.ownerId) return 'owner changed';
  if (writer === DM) return null;
  if (before.type === 'note') return before.ownerId === writer && data.type === 'note' ? null : 'not your note';
  const creator = before.ownerId === writer;
  if (before.type !== 'character' || data.type !== 'character') return 'DM only';
  if (!creator && before.playerId !== writer) return 'not your character';
  const changed = changedKeys(before, data);
  const bad = changed.filter((k) => !PLAYER_FIELDS.includes(k) || (k === 'isPublic' && !creator));
  return bad.length ? `may not change: ${bad.join(', ')}` : null;
}

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  let n = 0;
  const ref = (col: string, id?: string) => {
    const rid = id ?? `auto${++n}`;
    return { id: rid, path: `${col}/${rid}` };
  };
  return {
    collection: (_db: unknown, col: string) => ({ col }),
    doc: (a: any, col?: string, id?: string) => (col ? ref(col, id) : ref(a.col)),
    serverTimestamp: () => ({ serverTime: true }),
    Timestamp: { fromMillis: (ms: number) => ({ ms }) },
    writeBatch: () => {
      const ops: [string, any][] = [];
      return {
        set: (r: any, d: any) => ops.push([r.path, d]),
        update: () => undefined,
        delete: () => undefined,
        commit: async () => {
          for (const [p, d] of ops) {
            const why = rulesAllow(p, d);
            if (why) throw Object.assign(new Error(`permission-denied (${why})`), { code: 'permission-denied' });
          }
          for (const [p, d] of ops) store.set(p, JSON.parse(JSON.stringify(d)));
        },
      };
    },
    deleteDoc: async () => undefined,
    getDoc: async () => ({ exists: () => false }),
    getDocFromCache: async () => ({ exists: () => false }),
    setDoc: async () => undefined,
    updateDoc: async () => undefined,
    getDocs: async () => ({ docs: [] }),
    query: () => ({}),
    where: () => ({}),
    arrayUnion: (...a: unknown[]) => a,
    arrayRemove: (...a: unknown[]) => a,
  };
});

const { saveEntity } = await import('../lib/entityService');
type Draft = Parameters<typeof saveEntity>[0];

const campaign: Campaign = { id: 'c', name: 'C', dmId: DM, players: ['p1', 'p2'], joinCode: 'X', createdAt: '' };
const user = (uid: string): User => ({ uid, displayName: uid, email: `${uid}@x`, createdAt: '' });
const players = [user('p1'), user('p2')];
const draftOf = (e: Entity, over: Partial<Draft> = {}): Draft => ({ ...e, mapImage: null, ...over });
const fresh = (over: Partial<Draft> = {}): Draft => ({
  type: 'character',
  name: 'Brin',
  content: '',
  tags: [],
  isPublic: true,
  allowedPlayers: [],
  imageUrls: [],
  attributes: { currentHp: '10' },
  mapImage: null,
  ...over,
});
const save = (uid: string, draft: Draft, previous: Entity | null) =>
  saveEntity(draft, { campaign, user: user(uid), isDM: uid === DM, players, previous });
const stored = (id: string) => store.get(`entities/${id}`) as Entity;

beforeEach(() => store.clear());

describe('saving player characters', () => {
  it('a player creates their own character, which they play', async () => {
    writer = 'p1';
    const e = await save('p1', fresh(), null);
    expect(stored(e.id)).toMatchObject({ type: 'character', ownerId: 'p1', playerId: 'p1', isPublic: true });
    expect(stored(e.id).allowedPlayers).toContain('p1');
  });

  it('the DM creates one for a player, who can then read and edit it', async () => {
    writer = DM;
    const e = await save(DM, fresh({ playerId: 'p2', isPublic: false, dmNotes: 'Secretly a doppelganger' }), null);
    expect(stored(e.id).allowedPlayers).toContain('p2');
    expect(stored(e.id).sharedWith).toEqual([]);

    writer = 'p2';
    const prev = stored(e.id);
    // The player edits their sheet; even a tampered draft can't touch sharing or DM material.
    await save('p2', draftOf(prev, { name: 'Brin the Bold', attributes: { currentHp: '4' }, isPublic: true, dmNotes: '', playerKnowledge: { p2: 'x' }, playerId: 'p1' }), prev);
    const after = stored(e.id);
    expect(after.name).toBe('Brin the Bold');
    expect(after.attributes?.currentHp).toBe('4');
    expect(after).toMatchObject({ isPublic: false, dmNotes: 'Secretly a doppelganger', playerId: 'p2', ownerId: DM });
  });

  it('the creating player may change whether the party sees it', async () => {
    writer = 'p1';
    const e = await save('p1', fresh({ isPublic: true }), null);
    const prev = stored(e.id);
    await save('p1', draftOf(prev, { isPublic: false }), prev);
    expect(stored(e.id).isPublic).toBe(false);
  });

  it('the DM edits a player’s character and the player keeps access', async () => {
    writer = 'p1';
    const e = await save('p1', fresh({ isPublic: false }), null);
    writer = DM;
    const prev = stored(e.id);
    await save(DM, draftOf(prev, { allowedPlayers: [], attributes: { currentHp: '1' } }), prev);
    expect(stored(e.id).allowedPlayers).toContain('p1');
    expect(stored(e.id).attributes?.currentHp).toBe('1');
  });

  it('other players cannot edit it, and players cannot create characters for others', async () => {
    writer = 'p1';
    const e = await save('p1', fresh(), null);
    writer = 'p2';
    await expect(save('p2', draftOf(stored(e.id), { name: 'Mine now' }), stored(e.id))).rejects.toThrow();
    // A player's new character is always their own, whatever the draft says.
    const own = await save('p2', fresh({ playerId: 'p1' }), null);
    expect(stored(own.id).playerId).toBe('p2');
  });

  it('players still cannot create DM-only entries', async () => {
    writer = 'p1';
    await expect(save('p1', fresh({ type: 'npc' }), null)).rejects.toThrow();
  });
});
