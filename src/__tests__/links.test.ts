import { describe, expect, it, vi } from 'vitest';

const store = new Map<string, any>();
const calls: string[] = [];
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const ref = (col: string, id: string) => ({ col, id, path: `${col}/${id}` });
  const snap = (path: string) => ({ id: path.split('/')[1], ref: ref(path.split('/')[0], path.split('/')[1]), data: () => store.get(path) });
  const run = (q: any) => ({ docs: [...store.keys()].filter((p) => p.startsWith(`${q.col}/`) && store.get(p)[q.w.field] === q.w.value).map(snap) });
  return {
    collection: (_db: unknown, col: string) => ({ col }),
    doc: (base: any, col?: string, id?: string) => (col ? ref(col, id!) : ref(base.col, `auto${Math.random().toString(36).slice(2, 8)}`)),
    query: (c: any, w: any) => ({ ...c, w }),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    getDocs: async (q: any) => run(q),
    getDocsFromServer: async (q: any) => Object.assign(run(q), { get empty() { return run(q).docs.length === 0; } }),
    getDocFromServer: async (r: any) => ({ exists: () => store.has(r.path), data: () => store.get(r.path) }),
    deleteField: () => ({ __delete: true }),
    setDoc: async (r: any, data: any, opts?: { merge?: boolean }) => {
      calls.push(`set ${r.path}`);
      const cur = opts?.merge ? store.get(r.path) ?? {} : {};
      const links = { ...(cur.links ?? {}) };
      for (const [k, v] of Object.entries(data.links ?? {})) if ((v as any).__delete) delete links[k];
      else links[k] = v;
      store.set(r.path, { ...cur, ...data, links });
    },
    updateDoc: async (r: any, data: any) => {
      calls.push(`update ${r.path}`);
      store.set(r.path, { ...store.get(r.path), ...data });
    },
    deleteDoc: async (r: any) => {
      calls.push(`delete ${r.path}`);
      store.delete(r.path);
    },
  };
});

import { BUNDLES, bundleOf, fetchLinks, migrateLinks, sweepOldLinks, writeLinks } from '../lib/links';

const rel = (id: string) => ({ id, campaignId: 'c', sourceId: 'a', targetId: 'b', targetName: 'B', label: 'Friend', reverseId: '', createdAt: '' });

describe('link bundles', () => {
  it('always puts a link in the same bundle, spread over all of them', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const n = bundleOf(`link${i}`);
      expect(n).toBe(bundleOf(`link${i}`));
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(BUNDLES);
      seen.add(n);
    }
    expect(seen.size).toBe(BUNDLES);
  });

  it('writes many links with at most one write per bundle, and removes them again', async () => {
    store.clear();
    calls.length = 0;
    const many = Array.from({ length: 300 }, (_, i) => rel(`r${i}`));
    expect(await writeLinks('c', { put: many })).toBeLessThanOrEqual(BUNDLES);
    expect(calls.length).toBeLessThanOrEqual(BUNDLES);
    expect((await fetchLinks('c')).length).toBe(300);
    await writeLinks('c', { remove: ['r1', 'r2'], put: [{ ...rel('r3'), label: 'Enemy' }] });
    const now = await fetchLinks('c');
    expect(now.length).toBe(298);
    expect(now.find((l) => l.id === 'r3')!.label).toBe('Enemy');
  });

  it('moves an older campaign over: bundles first, then the flag, then the old documents go', async () => {
    store.clear();
    calls.length = 0;
    store.set('campaigns/c', { id: 'c' });
    for (let i = 0; i < 25; i++) store.set(`relationships/old${i}`, { ...rel(`old${i}`), syncAt: { server: true } });
    const res = await migrateLinks('c');
    expect(res.moved).toBe(25);
    expect(store.get('campaigns/c').linksV2).toBe(true);
    expect([...store.keys()].filter((k) => k.startsWith('relationships/'))).toEqual([]);
    const links = await fetchLinks('c');
    expect(links.length).toBe(25);
    expect(links.every((l) => !('syncAt' in l))).toBe(true);
    // Order: no old document is deleted before the flag is set.
    const flagAt = calls.indexOf('update campaigns/c');
    expect(calls.findIndex((c) => c.startsWith('delete'))).toBeGreaterThan(flagAt);
    expect(calls.slice(0, flagAt).every((c) => c.startsWith('set linkBundles/'))).toBe(true);
  });

  it('never re-runs on a campaign that was already moved; stragglers are swept in instead', async () => {
    store.clear();
    calls.length = 0;
    store.set('campaigns/c', { id: 'c', linksV2: true });
    await writeLinks('c', { put: [rel('kept')] });
    // A link an old tab wrote the old way after the move.
    store.set('relationships/late', rel('late'));
    const res = await migrateLinks('c');
    expect(res.moved).toBe(1);
    expect((await fetchLinks('c')).map((l) => l.id).sort()).toEqual(['kept', 'late']);
    expect(store.has('relationships/late')).toBe(false);
    expect((await sweepOldLinks('c')).moved).toBe(0);
  });

  it('a second, interrupted attempt cannot bring back links deleted since', async () => {
    store.clear();
    store.set('campaigns/c', { id: 'c' });
    // Leftover bundle from an earlier attempt that never set the flag, holding a since-deleted link.
    await writeLinks('c', { put: [rel('deleted-since')] });
    store.set('relationships/a1', rel('a1'));
    await migrateLinks('c');
    expect((await fetchLinks('c')).map((l) => l.id)).toEqual(['a1']);
  });
});
