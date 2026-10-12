import { describe, expect, it } from 'vitest';
import { canDeleteEntity, canEditEntity, canViewEntity, canViewField, upgradeSharing } from '../lib/permissions';
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
  it('upgrading an older shared entry changes nothing for its players', () => {
    const old = base({ allowedPlayers: ['p1'], fieldPermissions: { race: { isPublic: false, allowedPlayers: ['p1'] } } });
    const keys = ['content', 'race', 'age'];
    const upgraded = base({ ...old, shareV: 2, sharedWith: ['p1'], fieldPermissions: upgradeSharing(old, ['p1'], keys) });
    for (const k of keys) expect(canViewField(p1, upgraded, k)).toBe(canViewField(p1, old, k));
  });
  it('leaves public and unshared entries alone when upgrading', () => {
    expect(upgradeSharing(base({ isPublic: true }), [], ['content'])).toEqual({});
    expect(upgradeSharing(base(), [], ['content'])).toEqual({});
  });
  it('never shows values of fields that are no longer part of the type', () => {
    const e = base({ isPublic: true, attributes: { oldSecret: 'betrays them' } });
    expect(canViewField(p1, e, 'oldSecret')).toBe(false);
    expect(canViewField(dm, e, 'oldSecret')).toBe(true);
  });
});

describe('player characters', () => {
  const pc = (over: Partial<Entity> = {}) => base({ type: 'character', ownerId: 'p1', playerId: 'p1', ...over });
  it('can be edited by the player who made it and by the DM, not by other players', () => {
    expect(canEditEntity(p1, pc())).toBe(true);
    expect(canEditEntity(dm, pc())).toBe(true);
    expect(canEditEntity(p2, pc({ isPublic: true }))).toBe(false);
  });
  it('made by the DM can be edited by the player who plays it', () => {
    const e = pc({ ownerId: 'dm', playerId: 'p2' });
    expect(canEditEntity(p2, e)).toBe(true);
    expect(canEditEntity(p1, e)).toBe(false);
  });
  it('are always visible to their player, in full', () => {
    const e = pc({ ownerId: 'dm', playerId: 'p2', fieldPermissions: { currentHp: { isPublic: false, allowedPlayers: [] } } });
    expect(canViewEntity(p2, e)).toBe(true);
    expect(canViewField(p2, e, 'currentHp')).toBe(true);
    expect(canViewEntity(p1, e)).toBe(false);
  });
  it('are visible to the DM even when the player keeps them private', () => {
    expect(canViewEntity(dm, pc())).toBe(true);
    expect(canViewEntity(p2, pc())).toBe(false);
  });
  it('can be deleted by their creator and the DM only', () => {
    expect(canDeleteEntity(p1, pc())).toBe(true);
    expect(canDeleteEntity(dm, pc())).toBe(true);
    expect(canDeleteEntity(p2, pc({ ownerId: 'dm', playerId: 'p2' }))).toBe(false);
  });
  it('do not make other entries editable for players', () => {
    expect(canEditEntity(p1, base({ playerId: 'p1' }))).toBe(false);
  });
});
