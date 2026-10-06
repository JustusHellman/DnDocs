import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPlan, entityIdFor, isPackEntityId, parsePackText, relationshipIdFor } from '../lib/campaignImport';
import { applyTypeConfig, typeMeta } from '../lib/entityTypes';

const ctx = { campaignId: 'camp1', uid: 'dm1', now: '2026-01-01T00:00:00.000Z' };

const base = () => ({
  format: 'dndocs-campaign-pack',
  version: 1,
  pack: { id: 'test-pack', name: 'Test Pack' },
  entities: [
    { key: 'realm', type: 'country', name: 'The Realm', content: 'See [[town]].' },
    { key: 'town', type: 'settlement', name: 'Town', parent: 'realm', attributes: { settlementType: 'City', securityLevel: '12' } },
    { key: 'mayor', type: 'npc', name: 'Mayor', parent: 'town', gender: 'Female', attributes: { race: 'Human', isAlive: true } },
    { key: 'inn', type: 'shop', name: 'The Inn', parent: 'town', attributes: { personnel: '@mayor', pricing: 'Medium' } },
  ],
  relationships: [{ source: 'mayor', target: 'inn', label: 'Owns', reverseLabel: 'Owned by' }],
});

afterEach(() => applyTypeConfig(null));

describe('campaign pack import', () => {
  it('builds secret, linked documents with stable ids', () => {
    const plan = buildPlan(base(), ctx);
    expect(plan.issues).toEqual([]);
    expect(plan.ok).toBe(true);
    expect(plan.entities).toHaveLength(4);
    const realm = plan.entities.find((e) => e.id === entityIdFor('test-pack', 'realm'))!;
    expect(realm.content).toBe(`See [Town](/entity/${entityIdFor('test-pack', 'town')}).`);
    for (const e of plan.entities) {
      expect(e.isPublic).toBe(false);
      expect(e.allowedPlayers).toEqual([]);
      expect(e.ownerId).toBe('dm1');
      expect(e.campaignId).toBe('camp1');
      expect(isPackEntityId('test-pack', e.id)).toBe(true);
      expect(e.id.length).toBeLessThan(100);
    }
    const inn = plan.entities.find((e) => e.name === 'The Inn')!;
    expect(inn.locationId).toBe(entityIdFor('test-pack', 'town'));
    expect(inn.attributes?.personnel).toBe(entityIdFor('test-pack', 'mayor'));
    expect(plan.relationships[0]).toMatchObject({
      id: relationshipIdFor('test-pack', 'mayor', 'inn'),
      sourceId: entityIdFor('test-pack', 'mayor'),
      targetId: entityIdFor('test-pack', 'inn'),
      targetName: 'The Inn',
      label: 'Owns',
      reverseLabel: 'Owned by',
      reverseId: '',
      v: 2,
    });
  });

  it('is deterministic: the same pack always yields the same ids', () => {
    const a = buildPlan(base(), ctx).entities.map((e) => e.id);
    const b = buildPlan(base(), ctx).entities.map((e) => e.id);
    expect(a).toEqual(b);
  });

  it('contains no undefined values (Firestore rejects them)', () => {
    const plan = buildPlan(base(), ctx);
    expect(JSON.stringify(plan.entities)).not.toContain('undefined');
    const walk = (v: unknown): void => {
      if (v === undefined) throw new Error('undefined found');
      if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    plan.entities.forEach(walk);
  });

  it('rejects things that would silently go wrong', () => {
    const cases: [string, (p: any) => void, RegExp][] = [
      ['wrong format', (p) => (p.format = 'nope'), /Not a campaign pack/],
      ['unknown type', (p) => (p.entities[0].type = 'dragonlair'), /Unknown entry type/],
      ['duplicate key', (p) => p.entities.push({ ...p.entities[0] }), /Duplicate key/],
      ['missing parent', (p) => (p.entities[1].parent = 'ghost'), /isn't in the pack/],
      ['bad parent type', (p) => (p.entities[0].parent = 'mayor'), /can't be located in/],
      ['dead link', (p) => (p.entities[0].content = 'See [[ghost]]'), /\[\[ghost\]\]/],
      ['unknown field', (p) => (p.entities[2].attributes.favouriteColour = 'red'), /Unknown field/],
      ['bad select option', (p) => (p.entities[1].attributes.settlementType = 'Metropolis'), /must be one of/],
      ['rating out of range', (p) => (p.entities[1].attributes.securityLevel = '25'), /rating from 1 to 20/],
      ['boolean as text', (p) => (p.entities[2].attributes.isAlive = 'yes'), /true or false/],
      ['entity-select wrong type', (p) => (p.entities[3].attributes.personnel = '@town'), /expects a NPC/],
      ['entity-select not a ref', (p) => (p.entities[3].attributes.personnel = 'Mayor'), /"@"/],
      ['relationship to nowhere', (p) => (p.relationships[0].target = 'ghost'), /isn't in the pack/],
      ['self relationship', (p) => (p.relationships[0].target = 'mayor'), /itself/],
      ['bad key', (p) => (p.entities[0].key = 'Bad Key!'), /Needs a "key"/],
      ['parent loop', (p) => { p.entities[0].type = 'geography'; p.entities[1].type = 'geography'; p.entities[0].parent = 'town'; }, /loops back/],
    ];
    for (const [name, mutate, re] of cases) {
      const p = base();
      mutate(p);
      const plan = buildPlan(p, ctx);
      expect(plan.ok, name).toBe(false);
      expect(plan.issues.map((i) => i.message).join('\n'), name).toMatch(re);
      expect(plan.entities, name).toEqual([]); // nothing to write when there are errors
    }
  });

  it('refuses non-packs without throwing', () => {
    for (const junk of [null, 42, 'text', [], {}]) expect(buildPlan(junk, ctx).ok).toBe(false);
    expect(parsePackText('{nope').error).toMatch(/valid JSON/);
  });

  it('validates stat blocks', () => {
    const p: any = base();
    p.entities.push({ key: 'wolf', type: 'monster', name: 'Wolf', dndStats: { armorClass: '13', str: 12 } });
    expect(buildPlan(p, ctx).ok).toBe(false);
  });

  it('respects fields a campaign has hidden (warning, not error)', () => {
    applyTypeConfig({ overrides: { npc: { hiddenFields: ['age'] } } });
    const p: any = base();
    p.entities[2].attributes.age = '40';
    const plan = buildPlan(p, ctx);
    expect(plan.ok).toBe(true);
    expect(plan.issues.some((i) => i.level === 'warning' && /hidden/.test(i.message))).toBe(true);
  });

  it('works with a campaign\'s own entry types', () => {
    applyTypeConfig({ custom: [{ id: 'c_spell', label: 'Spell', plural: 'Spells', icon: 'spellbook', tone: 'faction', base: 'item', group: 'Adventure', fields: [{ key: 'x_school', label: 'School', type: 'text' }] }] });
    const p: any = base();
    p.entities.push({ key: 'bolt', type: 'c_spell', name: 'Bolt', attributes: { x_school: 'Evocation' } });
    const plan = buildPlan(p, ctx);
    expect(plan.ok).toBe(true);
    const bolt = plan.entities.find((e) => e.name === 'Bolt')!;
    expect(bolt.type).toBe('item'); // stored as its base type, so the security rules accept it
    expect(bolt.customType).toBe('c_spell');
    expect(typeMeta('c_spell').label).toBe('Spell');
  });

  it('produces only documents the Firestore rules accept', () => {
    // Mirrors isValidEntity() in firestore.rules.
    const BUILTIN = ['npc', 'settlement', 'landmark', 'country', 'faction', 'shop', 'item', 'note', 'geography', 'monster', 'quest'];
    for (const e of buildPlan(base(), ctx).entities) {
      expect(BUILTIN).toContain(e.type);
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.name.length).toBeLessThan(200);
      expect(e.content.length).toBeLessThan(100000);
      expect(Array.isArray(e.tags) && e.tags.length <= 100).toBe(true);
      expect(typeof e.isPublic).toBe('boolean');
      expect(Array.isArray(e.allowedPlayers)).toBe(true);
    }
  });
});

// Run against a real pack file:  PACK_FILE=/path/to/rooted-city.pack.json npm test
const packFile = process.env.PACK_FILE;
describe.skipIf(!packFile)('a real pack file', () => {
  it('imports cleanly', () => {
    const raw = JSON.parse(readFileSync(packFile!, 'utf8'));
    const plan = buildPlan(raw, ctx);
    const errors = plan.issues.filter((i) => i.level === 'error');
    expect(JSON.stringify(errors).slice(0,400)).toBe("[]");
    expect(plan.entities.length).toBe(raw.entities.length);
    expect(plan.relationships.length).toBe(raw.relationships.length);
    // Nothing leaks to players.
    expect(plan.entities.every((e) => !e.isPublic && e.allowedPlayers.length === 0)).toBe(true);
    // Every parent actually exists in the plan.
    const ids = new Set(plan.entities.map((e) => e.id));
    expect(plan.entities.every((e) => !e.locationId || ids.has(e.locationId))).toBe(true);
    // Every in-text link points at something that will exist.
    for (const e of plan.entities) {
      for (const field of [e.content, e.dmNotes ?? '', e.statBlock ?? '']) {
        for (const m of field.matchAll(/\]\(\/entity\/([^)]+)\)/g)) expect(ids.has(m[1]), `${e.name} links to missing ${m[1]}`).toBe(true);
      }
    }
  });
});

describe('maps and default-hidden fields', () => {
  const IMG = 'data:image/webp;base64,UklGRg==';
  const withMap = (m: unknown) => ({ ...base(), maps: [m] });

  it('plans a map with pins as percentages', () => {
    const plan = buildPlan(withMap({ entity: 'town', image: IMG, pins: [{ target: 'inn', x: 10, y: 90.123 }] }), ctx);
    expect(plan.issues).toEqual([]);
    expect(plan.maps).toHaveLength(1);
    expect(plan.maps[0].media.id).toBe('seedmedia-test-pack-town');
    expect(plan.maps[0].pins).toEqual([{ x: 10, y: 90.12, targetEntityId: entityIdFor('test-pack', 'inn') }]);
  });

  it.each([
    ['an entry that is not in the pack', { entity: 'nowhere', image: IMG }],
    ['a pin to nowhere', { entity: 'town', image: IMG, pins: [{ target: 'nowhere', x: 1, y: 1 }] }],
    ['a pin outside the picture', { entity: 'town', image: IMG, pins: [{ target: 'inn', x: 101, y: 1 }] }],
    ['an image that is not a data URL', { entity: 'town', image: 'https://example.com/a.png' }],
    ['an image that is too big', { entity: 'town', image: 'data:image/png;base64,' + 'A'.repeat(1_000_000) }],
    ['an svg image', { entity: 'town', image: 'data:image/svg+xml;base64,AAAA' }],
  ])('rejects %s', (_name, m) => {
    const plan = buildPlan(withMap(m), ctx);
    expect(plan.ok).toBe(false);
    expect(plan.issues.some((i) => i.level === 'error')).toBe(true);
  });

  it('rejects two maps for one entry', () => {
    const plan = buildPlan({ ...base(), maps: [{ entity: 'town', image: IMG }, { entity: 'town', image: IMG }] }, ctx);
    expect(plan.ok).toBe(false);
  });

  it('hides tags, and a creature\'s stat block, tactics and loot, until the DM shows them', () => {
    const pack = base();
    (pack.entities as unknown[]).push({ key: 'wolf', type: 'monster', name: 'Wolf', parent: 'town', statBlock: '**Bite**', attributes: { tactics: 'Circles', harvestableLoot: 'Pelt' } });
    const plan = buildPlan(pack, ctx);
    expect(plan.issues).toEqual([]);
    const wolf = plan.entities.find((e) => e.name === 'Wolf')!;
    expect(Object.keys(wolf.fieldPermissions!).sort()).toEqual(['harvestableLoot', 'statBlock', 'tactics', 'tags']);
    expect(wolf.fieldPermissions!.statBlock).toEqual({ isPublic: false, allowedPlayers: [] });
    const town = plan.entities.find((e) => e.name === 'Town')!;
    expect(Object.keys(town.fieldPermissions!)).toEqual(['tags']);
  });
});
