import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity } from '../types';

/**
 * An in-memory stand-in for Firestore that also enforces the same checks as firestore.rules
 * for entity and relationship writes (shape, ownership, DM-only). It lets us run the real
 * import code, including a second run, a partial failure, an update and a full removal.
 */
const store = new Map<string, Record<string, any>>();
const failOnce = new Set<string>(); // fails once (a network blip the retry should absorb)
const failAlways = new Set<string>(); // keeps failing until cleared
let writerUid = 'dm1';
const CAMPAIGN = { dmId: 'dm1' };
const BUILTIN = ['npc', 'settlement', 'landmark', 'country', 'faction', 'shop', 'item', 'note', 'geography', 'monster', 'quest'];

function validEntity(d: any, id: string) {
  const need = ['id', 'campaignId', 'type', 'name', 'content', 'tags', 'ownerId', 'isPublic', 'allowedPlayers', 'createdAt', 'updatedAt'];
  return (
    need.every((k) => k in d) && d.id === id && BUILTIN.includes(d.type) && typeof d.name === 'string' && d.name.length > 0 && d.name.length < 200 &&
    typeof d.content === 'string' && d.content.length < 100000 && Array.isArray(d.tags) && d.tags.length <= 100 && typeof d.isPublic === 'boolean' &&
    Array.isArray(d.allowedPlayers) && d.ownerId === writerUid && (d.locationId == null || typeof d.locationId === 'string') &&
    (d.attributes == null || typeof d.attributes === 'object') && (d.dndStats == null || typeof d.dndStats === 'object')
  );
}
function validRel(d: any) {
  return ['id', 'campaignId', 'sourceId', 'targetId', 'targetName', 'label', 'reverseId', 'createdAt'].every((k) => typeof d[k] === 'string');
}
const isDM = () => writerUid === CAMPAIGN.dmId;

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const ref = (col: string, id: string) => ({ col, id, path: `${col}/${id}` });
  const snap = (r: any) => ({ id: r.id, exists: () => store.has(r.path), data: () => store.get(r.path) });
  return {
    collection: (_db: unknown, col: string) => ({ col }),
    doc: (_db: unknown, col: string, id: string) => ref(col, id),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (c: any, w: any) => ({ ...c, w }),
    getDocFromServer: async (r: any) => snap(r),
    getDocs: async (q: any) => ({ docs: [...store.entries()].filter(([p, v]) => p.startsWith(`${q.col}/`) && v[q.w.field] === q.w.value).map(([p]) => snap(ref(q.col, p.split('/')[1]))) }),
    setDoc: async (r: any, data: any) => {
      if (failOnce.delete(r.path)) throw new Error('network down');
      if (failAlways.has(r.path)) throw new Error('network down');
      if (!isDM()) throw new Error('permission-denied');
      if (r.col === 'entities' && !validEntity(data, r.id)) throw new Error('permission-denied: invalid entity');
      if (r.col === 'relationships' && !validRel(data)) throw new Error('permission-denied: invalid relationship');
      store.set(r.path, JSON.parse(JSON.stringify(data)));
    },
    updateDoc: async (r: any, data: any) => {
      if (!isDM()) throw new Error('permission-denied');
      const cur = store.get(r.path);
      if (!cur) throw new Error('not-found');
      const next = { ...cur, ...JSON.parse(JSON.stringify(data)) };
      if (r.col === 'entities' && (!validEntity(next, r.id) || next.ownerId !== cur.ownerId)) throw new Error('permission-denied: invalid update');
      store.set(r.path, next);
    },
    deleteDoc: async (r: any) => {
      if (!isDM()) throw new Error('permission-denied');
      store.delete(r.path);
    },
  };
});

import { buildPlan } from '../lib/campaignImport';
import { removePack, runImport } from '../lib/campaignImportWrite';

const raw = () => ({
  format: 'dndocs-campaign-pack',
  version: 1,
  pack: { id: 'p', name: 'P' },
  entities: [
    { key: 'a', type: 'settlement', name: 'A', content: 'Hello [[b]]' },
    { key: 'b', type: 'npc', name: 'B', parent: 'a', gender: 'Male', attributes: { race: 'Elf' } },
    { key: 'c', type: 'note', name: 'C', parent: 'a' },
  ],
  relationships: [{ source: 'a', target: 'b', label: 'Ruler', reverseLabel: 'Realm' }],
});
const plan = () => buildPlan(raw(), { campaignId: 'camp', uid: 'dm1' });
const ids = (col: string) => [...store.keys()].filter((k) => k.startsWith(`${col}/`));

beforeEach(() => {
  store.clear();
  failOnce.clear();
  failAlways.clear();
  writerUid = 'dm1';
});

describe('runImport', () => {
  it('creates everything, secret, and is safe to run twice', async () => {
    const first = await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    expect(first).toMatchObject({ created: 3, skipped: 0, relationshipsCreated: 1, failed: [] });
    expect(ids('entities')).toHaveLength(3);
    for (const k of ids('entities')) expect(store.get(k)!.isPublic).toBe(false);

    const second = await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    expect(second).toMatchObject({ created: 0, skipped: 3, relationshipsCreated: 0, relationshipsSkipped: 1, failed: [] });
    expect(ids('entities')).toHaveLength(3);
    expect(ids('relationships')).toHaveLength(1);
  });

  it('never overwrites what the DM has edited or revealed (skip mode)', async () => {
    await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    const key = 'entities/seed-p-b';
    store.set(key, { ...store.get(key)!, content: 'my edit', isPublic: true, allowedPlayers: ['u2'] });
    await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    expect(store.get(key)).toMatchObject({ content: 'my edit', isPublic: true, allowedPlayers: ['u2'] });
  });

  it('update mode refreshes text but keeps visibility, images and ownership', async () => {
    await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    const key = 'entities/seed-p-a';
    store.set(key, { ...store.get(key)!, isPublic: true, imageUrls: ['media:1'], content: 'old' });
    const res = await runImport(plan(), { mode: 'update', campaignId: 'camp' });
    expect(res.updated).toBe(3);
    expect(store.get(key)).toMatchObject({ isPublic: true, imageUrls: ['media:1'], ownerId: 'dm1' });
    expect(store.get(key)!.content).toContain('Hello');
  });

  it('absorbs a brief network blip with a retry', async () => {
    failOnce.add('entities/seed-p-b');
    const res = await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    expect(res.failed).toEqual([]);
    expect(ids('entities')).toHaveLength(3);
  });

  it('resumes after a real failure without duplicating', async () => {
    failAlways.add('entities/seed-p-b');
    const first = await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    expect(first.failed.map((f) => f.name)).toContain('B');
    expect(first.relationshipsCreated).toBe(0); // its link waits until both ends exist
    expect(store.has('entities/seed-p-b')).toBe(false);
    failAlways.clear();
    const second = await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    expect(second.failed).toEqual([]);
    expect(second.created).toBe(1);
    expect(second.skipped).toBe(2);
    expect(ids('entities')).toHaveLength(3);
    expect(ids('relationships')).toHaveLength(1);
  });

  it('reports permission problems instead of pretending', async () => {
    writerUid = 'someone-else';
    const res = await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    expect(res.created).toBe(0);
    expect(res.failed.length).toBe(4);
    expect(store.size).toBe(0);
  });

  it('refuses a plan with errors', async () => {
    const bad = buildPlan({ ...raw(), entities: [{ key: 'a', type: 'nonsense', name: 'A' }] }, { campaignId: 'camp', uid: 'dm1' });
    await expect(runImport(bad, { mode: 'skip', campaignId: 'camp' })).rejects.toThrow();
    expect(store.size).toBe(0);
  });

  it('refuses to touch an entry that belongs to another campaign', async () => {
    store.set('entities/seed-p-a', { id: 'seed-p-a', campaignId: 'other' });
    const res = await runImport(plan(), { mode: 'update', campaignId: 'camp' });
    expect(res.failed.some((f) => /another campaign/.test(f.error))).toBe(true);
    expect(store.get('entities/seed-p-a')).toEqual({ id: 'seed-p-a', campaignId: 'other' });
  });
});

describe('removePack', () => {
  it('removes the pack, keeps the DM\'s own entries and detaches them', async () => {
    await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    store.set('entities/mine', { id: 'mine', campaignId: 'camp', type: 'npc', name: 'Mine', content: '', tags: [], ownerId: 'dm1', isPublic: false, allowedPlayers: [], createdAt: 'z', updatedAt: 'z', locationId: 'seed-p-a' });
    store.set('relationships/hand', { id: 'hand', campaignId: 'camp', sourceId: 'mine', targetId: 'seed-p-b', label: 'x', reverseId: '', createdAt: 'z' });
    store.set('entities/other-campaign', { id: 'other-campaign', campaignId: 'camp2', type: 'npc', name: 'Other' });

    const current = { entities: [...store.entries()].filter(([k]) => k.startsWith('entities/')).map(([, v]) => v as Entity) };
    const r = await removePack('p', 'camp', current);
    expect(r).toMatchObject({ entities: 3, relationships: 2, detached: 1, failed: 0 });
    expect(ids('entities').sort()).toEqual(['entities/mine', 'entities/other-campaign']);
    expect(store.get('entities/mine')!.locationId).toBeNull();
    expect(ids('relationships')).toHaveLength(0);
  });
});

// PACK_FILE=/path/to/rooted-city.pack.json npm test
import { readFileSync } from 'node:fs';
describe.skipIf(!process.env.PACK_FILE)('a real pack file, end to end', () => {
  it('imports, re-imports and removes cleanly', async () => {
    const pack = JSON.parse(readFileSync(process.env.PACK_FILE!, 'utf8'));
    const p = buildPlan(pack, { campaignId: 'camp', uid: 'dm1' });
    expect(p.ok).toBe(true);
    const first = await runImport(p, { mode: 'skip', campaignId: 'camp' });
    expect(first.failed).toEqual([]);
    expect(first.created).toBe(pack.entities.length);
    expect(first.relationshipsCreated).toBe(pack.relationships.length);
    const again = await runImport(p, { mode: 'skip', campaignId: 'camp' });
    expect(again.created + again.relationshipsCreated).toBe(0);
    const current = { entities: [...store.entries()].filter(([k]) => k.startsWith('entities/')).map(([, v]) => v as Entity) };
    const gone = await removePack(pack.pack.id, 'camp', current);
    expect(gone).toMatchObject({ entities: pack.entities.length, relationships: pack.relationships.length, failed: 0 });
    expect(store.size).toBe(0);
  });
});
