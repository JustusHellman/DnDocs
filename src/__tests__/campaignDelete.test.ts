import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../types';

/** In-memory Firestore. Like the real rules, deleting anything of a campaign needs the campaign document to still exist. */
const store = new Map<string, Record<string, any>>();
const failAlways = new Set<string>();
const log: string[] = [];

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const ref = (col: string, id: string) => ({ col, id, path: `${col}/${id}` });
  const snap = (r: any) => ({ id: r.id, ref: r, exists: () => store.has(r.path), data: () => store.get(r.path) });
  const del = async (r: any) => {
    if (failAlways.has(r.path)) throw new Error('network down');
    const data = store.get(r.path);
    if (!data) throw new Error('permission-denied (missing)');
    if (r.col !== 'campaigns' && r.col !== 'joinCodes' && !store.has(`campaigns/${data.campaignId}`)) throw new Error('permission-denied');
    log.push(r.path);
    store.delete(r.path);
  };
  return {
    // Paths may be nested: collection(db, 'scenes', id, 'tokens'), doc(db, 'scenes', id, 'secret', 'dm').
    collection: (_db: unknown, ...segs: string[]) => ({ col: segs.join('/') }),
    doc: (_db: unknown, ...segs: string[]) => ref(segs.slice(0, -1).join('/'), segs[segs.length - 1]),
    writeBatch: () => {
      const ops: any[] = [];
      return { delete: (r: any) => ops.push(r), commit: async () => { for (const r of ops) await del(r); } };
    },
    serverTimestamp: () => ({ serverTime: true }),
    Timestamp: { fromMillis: (ms: number) => ({ ms }) },
    limit: (n: number) => ({ limit: n }),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (c: any, w: any) => ({ ...c, w }),
    getDocs: async (q: any) => {
      const hits = [...store.entries()].filter(([p, v]) => p.startsWith(`${q.col}/`) && !p.slice(q.col.length + 1).includes('/') && v[q.w.field] === q.w.value);
      return { docs: hits.map(([p]) => snap(ref(q.col, p.slice(q.col.length + 1)))), size: hits.length };
    },
    deleteDoc: async (r: any) => {
      if (!store.has(r.path) && r.col !== 'joinCodes') throw new Error('not found');
      if (!store.has(r.path)) return;
      await del(r);
    },
  };
});

import { deleteCampaignCompletely } from '../lib/campaignDelete';

const camp: Campaign = { id: 'c1', name: 'Test', dmId: 'dm', players: [], joinCode: 'ABC123', createdAt: 'x' };

beforeEach(() => {
  store.clear();
  failAlways.clear();
  log.length = 0;
  store.set('campaigns/c1', camp as any);
  store.set('joinCodes/ABC123', { campaignId: 'c1', dmId: 'dm' });
  for (let i = 0; i < 30; i++) store.set(`entities/e${i}`, { campaignId: 'c1' });
  for (let i = 0; i < 5; i++) store.set(`relationships/r${i}`, { campaignId: 'c1' });
  store.set('media/m1', { campaignId: 'c1' });
  // A battle map with a token, a drawing, a ping and the DM's secret HP.
  store.set('scenes/e1', { campaignId: 'c1' });
  store.set('scenes/e1/tokens/t1', { campaignId: 'c1' });
  store.set('scenes/e1/drawings/d1', { campaignId: 'c1' });
  store.set('scenes/e1/live/dm', { campaignId: 'c1' });
  store.set('scenes/e1/secret/dm', { campaignId: 'c1' });
  // Another campaign's data must never be touched.
  store.set('campaigns/c2', { id: 'c2' });
  store.set('entities/other', { campaignId: 'c2' });
  store.set('relationships/other', { campaignId: 'c2' });
  store.set('media/other', { campaignId: 'c2' });
});

describe('delete campaign', () => {
  it('removes everything of the campaign, the campaign last, and nothing of another campaign', async () => {
    const progress: number[] = [];
    const res = await deleteCampaignCompletely(camp, (d) => progress.push(d));
    expect(res).toEqual({ entities: 30, relationships: 5, media: 1, failed: 0, campaignDeleted: true });
    expect([...store.keys()].sort()).toEqual(['campaigns/c2', 'entities/other', 'media/other', 'relationships/other']);
    expect(log[log.length - 1]).toBe('campaigns/c1');
    expect(log.indexOf('joinCodes/ABC123')).toBeLessThan(log.indexOf('campaigns/c1'));
    // Battle map parts go before the scene, and the scene before the campaign.
    expect(log.indexOf('scenes/e1/tokens/t1')).toBeLessThan(log.indexOf('scenes/e1'));
    expect(log.indexOf('scenes/e1/secret/dm')).toBeGreaterThan(-1);
    expect(progress[progress.length - 1]).toBe(30 + 5 + 1 + 2);
  });

  it('keeps the campaign when something fails, and carries on when run again', async () => {
    failAlways.add('entities/e7');
    const first = await deleteCampaignCompletely(camp);
    expect(first.failed).toBe(1);
    expect(first.campaignDeleted).toBe(false);
    expect(store.has('campaigns/c1')).toBe(true);
    expect(store.has('entities/e7')).toBe(true);
    failAlways.clear();
    const second = await deleteCampaignCompletely(camp);
    expect(second.campaignDeleted).toBe(true);
    expect(second.failed).toBe(0);
    expect(store.has('campaigns/c1')).toBe(false);
    expect(store.has('entities/e7')).toBe(false);
  });
});
