import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity } from '../types';

/**
 * An in-memory stand-in for Firestore that also enforces the same checks as firestore.rules
 * for entity and relationship writes (shape, ownership, DM-only). It lets us run the real
 * import code, including a second run, a partial failure, an update and a full removal.
 */
const store = new Map<string, Record<string, any>>();
let writes = 0; // every create / update / delete, like Firestore's daily write quota
const failOnce = new Set<string>(); // fails once (a network blip the retry should absorb)
const failAlways = new Set<string>(); // keeps failing until cleared
let writerUid = 'dm1';
const CAMPAIGN = { dmId: 'dm1' };
const BUILTIN = ['npc', 'settlement', 'landmark', 'country', 'faction', 'shop', 'item', 'note', 'geography', 'monster', 'quest', 'character'];

function validEntity(d: any, id: string) {
  const need = ['id', 'campaignId', 'type', 'name', 'content', 'tags', 'ownerId', 'isPublic', 'allowedPlayers', 'createdAt', 'updatedAt'];
  return (
    need.every((k) => k in d) && d.id === id && BUILTIN.includes(d.type) && typeof d.name === 'string' && d.name.length > 0 && d.name.length < 200 &&
    typeof d.content === 'string' && d.content.length < 100000 && Array.isArray(d.tags) && d.tags.length <= 100 && typeof d.isPublic === 'boolean' &&
    Array.isArray(d.allowedPlayers) && d.ownerId === writerUid && (d.locationId == null || typeof d.locationId === 'string') &&
    (d.attributes == null || typeof d.attributes === 'object') && (d.dndStats == null || typeof d.dndStats === 'object')
  );
}
function validMedia(d: any) {
  return ['id', 'entityId', 'campaignId', 'data', 'ownerId', 'createdAt'].every((k) => typeof d[k] === 'string') && d.data.length < 1048576 && d.ownerId === writerUid;
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
    doc: (base: any, col?: string, id?: string) => (col ? ref(col, id!) : ref(base.col, `auto${Math.random().toString(36).slice(2)}`)),
    serverTimestamp: () => ({ serverTime: true }),
    Timestamp: { fromMillis: (ms: number) => ({ ms }) },
    limit: (n: number) => ({ limit: n }),
    writeBatch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (r: any, data: any) => ops.push(() => store.set(r.path, JSON.parse(JSON.stringify(data)))),
        commit: async () => {
          if (!isDM()) throw new Error('permission-denied');
          ops.forEach((f) => f());
        },
      };
    },
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (c: any, w: any) => ({ ...c, w }),
    getDocFromServer: async (r: any) => snap(r),
    getDocsFromServer: async (q: any) => ({ docs: [...store.entries()].filter(([p, v]) => p.startsWith(`${q.col}/`) && v[q.w.field] === q.w.value).map(([p]) => snap(ref(q.col, p.split('/')[1]))) }),
    getDocs: async (q: any) => ({ docs: [...store.entries()].filter(([p, v]) => p.startsWith(`${q.col}/`) && v[q.w.field] === q.w.value).map(([p]) => snap(ref(q.col, p.split('/')[1]))) }),
    deleteField: () => ({ __delete: true }),
    setDoc: async (r: any, data: any, opts?: { merge?: boolean }) => {
      writes++;
      if (r.col === 'linkBundles') {
        if (!isDM()) throw new Error('permission-denied');
        if (r.id !== `${data.campaignId}__${data.n}`) throw new Error('permission-denied: bundle id');
        const merge = (cur: any, patch: any): any => {
          const out = { ...(cur ?? {}) };
          for (const [k, v] of Object.entries(patch)) {
            if (v && typeof v === 'object' && (v as any).__delete) delete out[k];
            else if (v && typeof v === 'object' && !Array.isArray(v) && k === 'links') out[k] = merge(out[k], v);
            else out[k] = JSON.parse(JSON.stringify(v));
          }
          return out;
        };
        store.set(r.path, opts?.merge ? merge(store.get(r.path), data) : merge({}, data));
        return;
      }
      if (failOnce.delete(r.path)) throw new Error('network down');
      if (failAlways.has(r.path)) throw new Error('network down');
      if (!isDM()) throw new Error('permission-denied');
      if (r.col === 'entities' && !validEntity(data, r.id)) throw new Error('permission-denied: invalid entity');
      if (r.col === 'relationships' && !validRel(data)) throw new Error('permission-denied: invalid relationship');
      if (r.col === 'media' && !validMedia(data)) throw new Error('permission-denied: invalid media');
      store.set(r.path, JSON.parse(JSON.stringify(data)));
    },
    updateDoc: async (r: any, data: any) => {
      writes++;
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
    // Only the entry that differs from the pack is written.
    expect(res.updated).toBe(1);
    expect(res.unchanged).toBe(2);
    expect(store.get(key)).toMatchObject({ isPublic: true, imageUrls: ['media:1'], ownerId: 'dm1' });
    expect(store.get(key)!.content).toContain('Hello');
  });

  it('refresh makes the campaign match an edited pack: moves, link wording, dropped links and entries', async () => {
    await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    // The DM's own link to B, and the DM's own entry placed inside C.
    store.set('relationships/mine', { id: 'mine', campaignId: 'camp', sourceId: 'seed-p-a', targetId: 'seed-p-b', targetName: 'B', label: 'Friend', reverseId: '', createdAt: '' });
    store.set('entities/own', { ...store.get('entities/seed-p-c')!, id: 'own', name: 'Own', locationId: 'seed-p-c' });
    const edited = raw();
    edited.entities = [
      { key: 'a', type: 'settlement', name: 'A', content: 'Hello [[b]]' },
      { key: 'b', type: 'npc', name: 'B', parent: null as unknown as string, gender: 'Male', attributes: { race: 'Elf' } }, // moved to the top
      { key: 'd', type: 'npc', name: 'D', parent: 'a' },
    ];
    edited.relationships = [{ source: 'a', target: 'd', label: 'Ruler', reverseLabel: 'Realm' }];
    const p2 = buildPlan(edited, { campaignId: 'camp', uid: 'dm1' });

    const keep = await runImport(p2, { mode: 'update', campaignId: 'camp' });
    expect(keep).toMatchObject({ created: 1, updated: 1, unchanged: 1, relationshipsRemoved: 1, removed: 0, failed: [] });
    expect(store.get('entities/seed-p-b')!.locationId).toBeNull();
    expect(store.has('relationships/seedrel-p-a--b')).toBe(false); // the pack dropped it
    expect(store.has('relationships/mine')).toBe(true); // the DM's own link stays
    expect(store.has('entities/seed-p-c')).toBe(true); // not asked to remove

    const sync = await runImport(p2, { mode: 'update', campaignId: 'camp', removeMissing: true });
    expect(sync).toMatchObject({ removed: 1, failed: [] });
    expect(store.has('entities/seed-p-c')).toBe(false);
    expect(store.get('entities/own')!.locationId).toBeNull();

    // New wording for an existing link.
    const worded = raw();
    worded.entities = edited.entities;
    worded.relationships = [{ source: 'a', target: 'd', label: 'Lord', reverseLabel: 'Realm' }];
    const p3 = buildPlan(worded, { campaignId: 'camp', uid: 'dm1' });
    const w = await runImport(p3, { mode: 'update', campaignId: 'camp' });
    expect(w.relationshipsUpdated).toBe(1);
    expect(store.get('relationships/seedrel-p-a--d')!.label).toBe('Lord');
  });

  it('re-importing an unchanged pack writes nothing', async () => {
    await runImport(plan(), { mode: 'update', campaignId: 'camp' });
    writes = 0;
    const again = await runImport(plan(), { mode: 'update', campaignId: 'camp' });
    expect(again.unchanged).toBe(3);
    expect(again.updated + again.created + again.relationshipsCreated).toBe(0);
    expect(writes).toBe(0);
    writes = 0;
    await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    expect(writes).toBe(0);
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

const IMG = 'data:image/webp;base64,UklGRg==';
const withMaps = () => ({
  ...raw(),
  maps: [{ entity: 'a', image: IMG, pins: [{ target: 'b', x: 25, y: 40 }, { target: 'c', x: 70, y: 10.5 }] }],
});
const mapPlan = () => buildPlan(withMaps(), { campaignId: 'camp', uid: 'dm1' });

describe('maps', () => {
  it('stores the image, points the entry at it and places the pins', async () => {
    const res = await runImport(mapPlan(), { mode: 'skip', campaignId: 'camp' });
    expect(res).toMatchObject({ mapsSet: 1, failed: [] });
    expect(store.get('media/seedmedia-p-a')).toMatchObject({ data: IMG, entityId: 'seed-p-a', campaignId: 'camp' });
    expect(store.get('entities/seed-p-a')!.mapConfig).toEqual({
      mediaId: 'seedmedia-p-a',
      pins: [{ x: 25, y: 40, targetEntityId: 'seed-p-b' }, { x: 70, y: 10.5, targetEntityId: 'seed-p-c' }],
    });
  });

  it('is safe to run twice and never moves pins the DM placed', async () => {
    await runImport(mapPlan(), { mode: 'skip', campaignId: 'camp' });
    const e = store.get('entities/seed-p-a')!;
    e.mapConfig.pins[0] = { x: 99, y: 1, targetEntityId: 'seed-p-b' };
    const again = await runImport(mapPlan(), { mode: 'skip', campaignId: 'camp' });
    expect(again).toMatchObject({ mapsSet: 0, mapsSkipped: 1 });
    const upd = await runImport(mapPlan(), { mode: 'update', campaignId: 'camp' });
    expect(upd.failed).toEqual([]);
    expect(store.get('entities/seed-p-a')!.mapConfig.pins[0]).toEqual({ x: 99, y: 1, targetEntityId: 'seed-p-b' });
    expect(ids('media')).toHaveLength(1);
  });

  it('keeps a map the DM uploaded themselves', async () => {
    await runImport(plan(), { mode: 'skip', campaignId: 'camp' });
    store.set('entities/seed-p-a', { ...store.get('entities/seed-p-a')!, mapConfig: { mediaId: 'mine', pins: [] } });
    const res = await runImport(mapPlan(), { mode: 'update', campaignId: 'camp' });
    expect(res.mapsSkipped).toBe(1);
    expect(store.get('entities/seed-p-a')!.mapConfig.mediaId).toBe('mine');
    expect(store.has('media/seedmedia-p-a')).toBe(false);
  });

  it('removePack takes the map image out too', async () => {
    await runImport(mapPlan(), { mode: 'skip', campaignId: 'camp' });
    const current = { entities: [...store.entries()].filter(([k]) => k.startsWith('entities/')).map(([, v]) => v as Entity) };
    const r = await removePack('p', 'camp', current);
    expect(r).toMatchObject({ maps: 1, failed: 0 });
    expect(ids('media')).toHaveLength(0);
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

describe('links in bundles', () => {
  const links = () =>
    [...store.entries()].filter(([k]) => k.startsWith('linkBundles/')).flatMap(([, v]) => Object.keys(v.links ?? {}));
  it('imports, refreshes and removes links with one write per bundle', async () => {
    writes = 0;
    const first = await runImport(plan(), { mode: 'skip', campaignId: 'camp', bundles: true });
    expect(first.relationshipsCreated).toBe(1);
    expect(links()).toEqual(['seedrel-p-a--b']);
    expect(ids('relationships')).toHaveLength(0);
    expect(writes).toBe(3 + 1); // three entries, one bundle

    // An unchanged pack: nothing written at all.
    writes = 0;
    const again = await runImport(plan(), { mode: 'update', campaignId: 'camp', bundles: true });
    expect(again.relationshipsSkipped).toBe(1);
    expect(writes).toBe(0);

    // The pack drops the link and adds another: still a single bundle write per touched bundle.
    const edited = raw();
    edited.relationships = [{ source: 'b', target: 'a', label: 'Subject', reverseLabel: 'Ruler' }];
    const p2 = buildPlan(edited, { campaignId: 'camp', uid: 'dm1' });
    writes = 0;
    const sync = await runImport(p2, { mode: 'update', campaignId: 'camp', bundles: true });
    expect(sync).toMatchObject({ relationshipsCreated: 1, relationshipsRemoved: 1, failed: [] });
    expect(links()).toEqual(['seedrel-p-b--a']);
    expect(writes).toBeLessThanOrEqual(2);

    const gone = await removePack('p', 'camp', { entities: [...store.values()].filter((v) => v.type) as Entity[] }, { bundles: true });
    expect(gone.relationships).toBe(1);
    expect(links()).toEqual([]);
  });
});
