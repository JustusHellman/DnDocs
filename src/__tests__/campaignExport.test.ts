import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPlan } from '../lib/campaignImport';
import { buildExportPack } from '../lib/campaignExport';
import { applyTypeConfig } from '../lib/entityTypes';
import type { Entity } from '../types';

const ctx = { campaignId: 'camp1', uid: 'dm1', now: '2026-01-01T00:00:00.000Z' };
const IMG = 'data:image/webp;base64,UklGRg==';

const pack = () => ({
  format: 'dndocs-campaign-pack',
  version: 1,
  pack: { id: 'test-pack', name: 'Test Pack' },
  entities: [
    { key: 'realm', type: 'country', name: 'The Realm', content: 'See [[town]] and [[mayor]].', dmNotes: 'Secret [[inn]].' },
    { key: 'town', type: 'settlement', name: 'Town', parent: 'realm', attributes: { settlementType: 'City' }, tags: ['act-1'] },
    { key: 'mayor', type: 'npc', name: 'Mayor', parent: 'town', gender: 'Female', attributes: { race: 'Human', isAlive: true } },
    { key: 'inn', type: 'shop', name: 'The Inn', parent: 'town', attributes: { personnel: '@mayor', pricing: 'Medium' } },
  ],
  relationships: [{ source: 'mayor', target: 'inn', label: 'Owns', reverseLabel: 'Owned by' }],
  maps: [{ entity: 'town', image: IMG, pins: [{ target: 'inn', x: 10, y: 20 }] }],
});

afterEach(() => applyTypeConfig(null));

function imported() {
  const plan = buildPlan(pack(), ctx);
  expect(plan.issues).toEqual([]);
  const media = new Map(plan.maps.map((m) => [m.media.id, m.media.data]));
  const entities = plan.entities.map((e) => {
    const m = plan.maps.find((x) => x.entityId === e.id);
    return m ? { ...e, mapConfig: { mediaId: m.media.id, pins: m.pins } } : e;
  });
  return { entities, rels: plan.relationships, media };
}

const campaign = { id: 'camp1', name: 'My Campaign' };

describe('campaign export', () => {
  it('a full copy imports again with the same shape', () => {
    const { entities, rels, media } = imported();
    const res = buildExportPack(campaign, entities, rels, { mode: 'full', uid: 'dm1', media });
    expect(res.error).toBeUndefined();
    expect(res.counts).toEqual({ entries: 4, relationships: 1, maps: 1 });
    const again = buildPlan(res.pack, ctx);
    expect(again.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(again.entities).toHaveLength(4);
    expect(again.relationships).toHaveLength(1);
    expect(again.maps[0].pins).toHaveLength(1);
    const realm = again.entities.find((e) => e.name === 'The Realm')!;
    expect(realm.dmNotes).toContain('Secret');
    const inn = again.entities.find((e) => e.name === 'The Inn')!;
    expect(inn.attributes?.personnel).toBe(again.entities.find((e) => e.name === 'Mayor')!.id);
    // Links in the text were turned back into pack links and resolved again.
    expect(realm.content).toMatch(/\[Town\]\(\/entity\/seed-my-campaign-town\)/);
  });

  it('a player copy has only public entries and no DM notes', () => {
    const { entities, rels, media } = imported();
    const pub: Entity[] = entities.map((e) => (['realm', 'town'].some((k) => e.id.endsWith(`-${k}`)) ? { ...e, isPublic: true } : e));
    const res = buildExportPack(campaign, pub, rels, { mode: 'public', uid: 'dm1', media });
    expect(res.pack!.entities.map((e) => e.name).sort()).toEqual(['The Realm', 'Town']);
    expect(JSON.stringify(res.pack)).not.toContain('Secret');
    expect(res.pack!.entities.every((e) => !e.dmNotes)).toBe(true);
    expect(res.pack!.relationships ?? []).toEqual([]);
    // A link to an entry that is not in the copy becomes plain text.
    expect(res.pack!.entities.find((e) => e.name === 'The Realm')!.content).toBe('See [[town|Town]] and Mayor.');
    expect(res.pack!.maps?.[0].pins ?? []).toEqual([]);
    expect(buildPlan(res.pack, ctx).ok).toBe(true);
  });

  it('hides fields the DM kept secret on a public entry', () => {
    const { entities, rels, media } = imported();
    const pub = entities.map((e) => (e.name === 'Mayor' ? { ...e, isPublic: true, fieldPermissions: { race: { isPublic: false, allowedPlayers: [] } } } : e));
    const res = buildExportPack(campaign, pub, rels, { mode: 'public', uid: 'dm1', media });
    const mayor = res.pack!.entities.find((e) => e.name === 'Mayor')!;
    expect(mayor.attributes?.race).toBeUndefined();
    expect(mayor.attributes?.isAlive).toBe(true);
  });

  it('never exports other people\'s notes, and says when there is nothing to export', () => {
    const { entities, rels, media } = imported();
    const note = { ...entities[0], id: 'n1', type: 'note', name: 'Player note', ownerId: 'p1', isPublic: false } as Entity;
    const res = buildExportPack(campaign, [...entities, note], rels, { mode: 'full', uid: 'dm1', media });
    expect(res.pack!.entities.some((e) => e.name === 'Player note')).toBe(false);
    const none = buildExportPack(campaign, entities, rels, { mode: 'public', uid: 'dm1', media });
    expect(none.pack).toBeNull();
    expect(none.error).toMatch(/public/);
  });

  it('keeps keys unique when names repeat', () => {
    const { entities, rels, media } = imported();
    const dup = { ...entities[1], id: 'dup', createdAt: '2027-01-01' } as Entity;
    const res = buildExportPack(campaign, [...entities, dup], rels, { mode: 'full', uid: 'dm1', media });
    const keys = res.pack!.entities.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

const packFile = process.env.PACK_FILE;
describe.skipIf(!packFile)('exporting a real pack file', () => {
  it('imports, exports and imports again without losing anything', () => {
    const raw = JSON.parse(readFileSync(packFile!, 'utf8'));
    const plan = buildPlan(raw, ctx);
    expect(plan.ok).toBe(true);
    const media = new Map(plan.maps.map((m) => [m.media.id, m.media.data]));
    const entities = plan.entities.map((e) => {
      const m = plan.maps.find((x) => x.entityId === e.id);
      return m ? { ...e, mapConfig: { mediaId: m.media.id, pins: m.pins } } : e;
    });
    const res = buildExportPack(campaign, entities, plan.relationships, { mode: 'full', uid: 'dm1', media });
    expect(res.error).toBeUndefined();
    const again = buildPlan(res.pack, ctx);
    expect(JSON.stringify(again.issues.filter((i) => i.level === 'error')).slice(0, 400)).toBe('[]');
    expect(again.entities.length).toBe(raw.entities.length);
    expect(again.relationships.length).toBe(raw.relationships.length);
    expect(again.maps.length).toBe(raw.maps.length);
    // A player copy of a pack that is entirely secret has nothing in it.
    expect(buildExportPack(campaign, entities, plan.relationships, { mode: 'public', uid: 'dm1', media }).pack).toBeNull();
  });
});
