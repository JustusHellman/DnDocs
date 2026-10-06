import { describe, expect, it } from 'vitest';
import { canViewEntity, canViewField } from '../lib/permissions';
import type { Entity } from '../types';

const base = (over: Partial<Entity> = {}): Entity => ({
  id: 'e1',
  campaignId: 'c',
  type: 'npc',
  name: 'Mira',
  content: 'secret past',
  tags: [],
  ownerId: 'dm',
  isPublic: false,
  allowedPlayers: [],
  createdAt: '',
  updatedAt: '',
  ...over,
});
const dm = { uid: 'dm', isDM: true };
const p1 = { uid: 'p1', isDM: false };
const p2 = { uid: 'p2', isDM: false };

describe('entry visibility', () => {
  it('hides secret entries from players', () => {
    expect(canViewEntity(p1, base())).toBe(false);
    expect(canViewEntity(dm, base())).toBe(true);
  });
  it('shows public entries with every unlocked field', () => {
    const e = base({ isPublic: true, fieldPermissions: { age: { isPublic: false, allowedPlayers: [] } } });
    expect(canViewField(p1, e, 'content')).toBe(true);
    expect(canViewField(p1, e, 'age')).toBe(false);
  });
  it('never shows other players’ private notes to the DM', () => {
    expect(canViewEntity(dm, base({ type: 'note', ownerId: 'p1' }))).toBe(false);
  });
});

describe('sharing model', () => {
  it('older shared entries only show fields revealed one by one', () => {
    const e = base({ allowedPlayers: ['p1'], fieldPermissions: { race: { isPublic: false, allowedPlayers: ['p1'] } } });
    expect(canViewField(p1, e, 'race')).toBe(true);
    expect(canViewField(p1, e, 'content')).toBe(false);
  });
  it('new shared entries show everything not locked, only to the chosen players', () => {
    const e = base({ shareV: 2, allowedPlayers: ['p1'], sharedWith: ['p1'], fieldPermissions: { age: { isPublic: false, allowedPlayers: [] } } });
    expect(canViewField(p1, e, 'content')).toBe(true);
    expect(canViewField(p1, e, 'age')).toBe(false);
    expect(canViewEntity(p2, e)).toBe(false);
  });
  it('never shows values of fields that are no longer part of the type', () => {
    const e = base({ isPublic: true, attributes: { oldSecret: 'betrays them' } });
    expect(canViewField(p1, e, 'oldSecret')).toBe(false);
    expect(canViewField(dm, e, 'oldSecret')).toBe(true);
  });
});
