import { describe, expect, it } from 'vitest';
import { buildPlan, entityIdFor, isPackEntityId, packScope } from '../lib/campaignImport';

const pack = () => ({
  format: 'dndocs-campaign-pack',
  version: 1,
  pack: { id: 'test-pack', name: 'Test Pack' },
  entities: [
    { key: 'realm', type: 'country', name: 'The Realm', content: 'See [[town]].' },
    { key: 'town', type: 'settlement', name: 'Town', parent: 'realm' },
  ],
  relationships: [{ source: 'town', target: 'realm', label: 'Lies in' }],
});

describe('the same pack in several campaigns', () => {
  const A = '3f9c2a1b-7d4e-4c1a-9b2f-1a2b3c4d5e6f';
  const B = 'aa11bb22-0000-4000-8000-000000000000';

  it('a fresh import gets ids tagged with its campaign, so they never clash', () => {
    const sa = packScope('test-pack', A, []);
    const sb = packScope('test-pack', B, []);
    expect(sa).toBe('test-pack.3f9c2a1b');
    expect(sb).not.toBe(sa);
    const a = buildPlan(pack(), { campaignId: A, uid: 'dm', idScope: sa });
    const b = buildPlan(pack(), { campaignId: B, uid: 'dm', idScope: sb });
    expect(a.ok && b.ok).toBe(true);
    const idsA = new Set([...a.entities.map((e) => e.id), ...a.relationships.map((r) => r.id)]);
    for (const id of [...b.entities.map((e) => e.id), ...b.relationships.map((r) => r.id)]) expect(idsA.has(id)).toBe(false);
    // Links inside the text point at this campaign's own copy.
    expect(a.entities.find((e) => e.name === 'The Realm')!.content).toContain(`/entity/${entityIdFor(sa, 'town')}`);
  });

  it('importing again (refresh) finds the entries it made before', () => {
    const s = packScope('test-pack', A, []);
    const first = buildPlan(pack(), { campaignId: A, uid: 'dm', idScope: s });
    expect(packScope('test-pack', A, first.entities.map((e) => e.id))).toBe(s);
  });

  it('a campaign that imported the pack before the tags keeps its old ids', () => {
    const old = [entityIdFor('test-pack', 'realm'), entityIdFor('test-pack', 'town'), 'some-other-entry'];
    expect(packScope('test-pack', A, old)).toBe('test-pack');
    expect(buildPlan(pack(), { campaignId: A, uid: 'dm', idScope: 'test-pack' }).entities.map((e) => e.id)).toEqual(old.slice(0, 2));
  });

  it('old and tagged ids of the same pack are told apart', () => {
    const tagged = entityIdFor('test-pack.3f9c2a1b', 'realm');
    expect(isPackEntityId('test-pack.3f9c2a1b', tagged)).toBe(true);
    expect(isPackEntityId('test-pack.3f9c2a1b', entityIdFor('test-pack', 'realm'))).toBe(false);
    // A campaign with tagged ids is never mistaken for an old-style one.
    expect(packScope('test-pack', A, [tagged])).toBe('test-pack.3f9c2a1b');
  });
});
