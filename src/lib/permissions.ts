import type { Entity } from '../types';
import { permissionKeys } from './entityTypes';

export interface Viewer {
  uid: string;
  isDM: boolean;
}

/** DMs see everything except other people's private notes. */
export function canViewEntity(viewer: Viewer | null, entity: Entity): boolean {
  if (!viewer) return false;
  if (entity.ownerId === viewer.uid) return true;
  if (isPlayerOf(viewer, entity)) return true;
  if (entity.isPublic) return true;
  if (entity.allowedPlayers?.includes(viewer.uid)) return true;
  if (viewer.isDM) return entity.type !== 'note';
  return false;
}

export function canViewField(viewer: Viewer | null, entity: Entity, fieldKey: string): boolean {
  if (!viewer) return false;
  if (!canViewEntity(viewer, entity)) return false;
  if (entity.ownerId === viewer.uid) return true;
  if (viewer.isDM) return true;
  // A player always sees the whole of their own character (DM secrets are never shown to players).
  if (isPlayerOf(viewer, entity)) return true;
  // Values left over from a field the DM removed (or a type change) have no lock of their own.
  if (!permissionKeys(entity.type).includes(fieldKey)) return false;

  const perm = entity.fieldPermissions?.[fieldKey];
  // Current model (shareV 3): a field is shown only when it's been revealed. "Revealed to everyone
  // who can see it" means players who can open the whole entry, not those with only a note.
  if (entity.shareV === 3) {
    if (!perm) return false;
    if (perm.allowedPlayers?.includes(viewer.uid)) return true;
    return perm.isPublic && (entity.isPublic || !!entity.sharedWith?.includes(viewer.uid));
  }
  if (perm) {
    if (perm.isPublic) return true;
    return perm.allowedPlayers?.includes(viewer.uid) ?? false;
  }
  // No explicit field rule: public entities show everything.
  if (entity.isPublic) return true;
  // Notes are shared as a whole by their author (players can't set per-field rules).
  if (entity.type === 'note') return entity.allowedPlayers?.includes(viewer.uid) ?? false;
  // Shared with this player: everything that isn't hidden.
  if (entity.shareV === 2) return entity.sharedWith?.includes(viewer.uid) ?? false;
  return false;
}

/**
 * Moves an older entry to the simpler sharing model without changing what anyone can see:
 * in the old model, players an entry was shared with saw only fields revealed one by one,
 * so those fields get an explicit "hidden" setting before the new default applies.
 */
export function upgradeSharing(
  entity: Pick<Entity, 'shareV' | 'isPublic' | 'type' | 'fieldPermissions' | 'attributes'>,
  explicitlySharedWith: string[],
  fieldKeys: string[],
): NonNullable<Entity['fieldPermissions']> {
  const perms = { ...(entity.fieldPermissions ?? {}) };
  if (entity.shareV === 2 || entity.isPublic || entity.type === 'note' || explicitlySharedWith.length === 0) return perms;
  for (const k of [...fieldKeys, ...Object.keys(entity.attributes ?? {})]) if (!perms[k]) perms[k] = { isPublic: false, allowedPlayers: [] };
  return perms;
}

/** Whether the viewer is the player who plays this character. */
export function isPlayerOf(viewer: Viewer | null, entity: Pick<Entity, 'type' | 'playerId'>): boolean {
  return !!viewer && entity.type === 'character' && !!entity.playerId && entity.playerId === viewer.uid;
}

/**
 * Notes: only their author. Player characters: the DM, the player who made it and the player
 * who plays it. Everything else: the DM.
 */
export function canEditEntity(viewer: Viewer | null, entity: Pick<Entity, 'type' | 'ownerId' | 'playerId'>): boolean {
  if (!viewer) return false;
  if (entity.type === 'note') return entity.ownerId === viewer.uid;
  if (entity.type === 'character') return viewer.isDM || entity.ownerId === viewer.uid || isPlayerOf(viewer, entity);
  return viewer.isDM;
}

export function canDeleteEntity(viewer: Viewer | null, entity: Pick<Entity, 'type' | 'ownerId' | 'playerId'>): boolean {
  if (!viewer) return false;
  if (entity.ownerId === viewer.uid) return true;
  return viewer.isDM && entity.type !== 'note';
}

/** Whether a DM-visible entity is visible to at least one player. Used by "player preview". */
export function visibleToAnyPlayer(entity: Entity): boolean {
  return entity.isPublic || (entity.allowedPlayers?.length ?? 0) > 0;
}

export type Visibility = 'public' | 'shared' | 'secret';

export function visibilityOf(entity: Pick<Entity, 'isPublic' | 'allowedPlayers'>): Visibility {
  if (entity.isPublic) return 'public';
  if ((entity.allowedPlayers?.length ?? 0) > 0) return 'shared';
  return 'secret';
}
