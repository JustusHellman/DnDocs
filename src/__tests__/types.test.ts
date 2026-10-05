import { afterEach, describe, expect, it } from 'vitest';
import { applyTypeConfig, fieldsFor, isEntityType, menuTypes, normalizeEntity, PLACE_TYPES, storageType, typeMeta } from '../lib/entityTypes';
import { relationsOf } from '../lib/relationships';
import type { Entity, Relationship, TypeConfig } from '../types';

const config: TypeConfig = {
  custom: [{ id: 'c_spell', label: 'Spell', plural: 'Spells', icon: 'spellbook', tone: 'faction', base: 'item', group: 'Adventure', fields: [{ key: 'x_a', label: 'School', type: 'text' }] }],
  overrides: { npc: { label: 'Person', plural: 'People', hiddenFields: ['age'] }, shop: { hidden: true } },
};

afterEach(() => applyTypeConfig(null));

describe('entry types', () => {
  it('adds campaign types and applies tweaks', () => {
    applyTypeConfig(config);
    expect(isEntityType('c_spell')).toBe(true);
    expect(fieldsFor('c_spell').map((f) => f.key)).toEqual(['x_a']);
    expect(typeMeta('npc').plural).toBe('People');
    expect(fieldsFor('npc').some((f) => f.key === 'age')).toBe(false);
    expect(menuTypes().some((t) => t.value === 'shop')).toBe(false);
    expect(PLACE_TYPES).toContain('shop'); // hidden from menus, still a place
  });
  it('stores custom types as their base type and reads them back', () => {
    applyTypeConfig(config);
    expect(storageType('c_spell')).toEqual({ type: 'item', customType: 'c_spell' });
    expect(storageType('npc')).toEqual({ type: 'npc', customType: undefined });
    const stored = { id: 'x', type: 'item', customType: 'c_spell' } as Entity;
    expect(normalizeEntity(stored).type).toBe('c_spell');
  });
  it('falls back to the base type when a custom type is deleted', () => {
    applyTypeConfig(null);
    expect(normalizeEntity({ id: 'x', type: 'item', customType: 'c_spell' } as Entity).type).toBe('item');
  });
  it('lets things live inside custom place types', () => {
    applyTypeConfig({ custom: [{ id: 'c_ship', label: 'Ship', plural: 'Ships', icon: 'ship', tone: 'shop', base: 'landmark', group: 'World', fields: [] }] });
    expect(typeMeta('npc').parents).toContain('c_ship');
    expect(PLACE_TYPES).toContain('c_ship');
  });
});

describe('relationships', () => {
  const legacy: Relationship[] = [
    { id: 'a', campaignId: 'c', sourceId: 'mira', targetId: 'hal', targetName: 'Hal', label: 'Friend', reverseId: 'b', createdAt: '' },
    { id: 'b', campaignId: 'c', sourceId: 'hal', targetId: 'mira', targetName: 'Mira', label: 'Friend', reverseId: 'a', createdAt: '' },
  ];
  const single: Relationship = { id: 'r', campaignId: 'c', sourceId: 'voss', targetId: 'mira', targetName: 'Mira', label: 'Informant', reverseLabel: 'Handler', reverseId: '', v: 2, createdAt: '' };
  it('reads both the old mirrored pairs and single records', () => {
    expect(relationsOf('mira', [...legacy, single]).map((r) => [r.otherId, r.label])).toEqual([
      ['hal', 'Friend'],
      ['voss', 'Handler'],
    ]);
    expect(relationsOf('voss', [single]).map((r) => [r.otherId, r.label])).toEqual([['mira', 'Informant']]);
  });
});
