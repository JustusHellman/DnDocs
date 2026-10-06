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
  // Values left over from a field the DM removed (or a type change) have no lock of their own.
  if (!permissionKeys(entity.type).includes(fieldKey)) return false;

  const perm = entity.fieldPermissions?.[fieldKey];
  if (perm) {
    if (perm.allowedPlayers?.includes(viewer.uid)) return true;
    if (!perm.isPublic) return false;
    // Current entries: "everyone who can see it" means players it was revealed to, not players
    // who can only open it because of a "what you know" note.
    return entity.shareV === 3 ? entity.isPublic || !!entity.sharedWith?.includes(viewer.uid) : true;
  }
  // Current entries: a field without a setting hasn't been revealed.
  if (entity.shareV === 3 && entity.type !== 'note') return false;
  // No explicit field rule: public entities show everything.
  if (entity.isPublic) return true;
  // Notes are shared as a whole by their author (players can't set per-field rules).
  if (entity.type === 'note') return entity.allowedPlayers?.includes(viewer.uid) ?? false;
  // Shared with this player: everything that isn't hidden.
  if (entity.shareV === 2) return entity.sharedWith?.includes(viewer.uid) ?? false;
  return false;
}

export function canEditEntity(viewer: Viewer | null, entity: Pick<Entity, 'type' | 'ownerId'>): boolean {
  if (!viewer) return false;
  if (entity.type === 'note') return entity.ownerId === viewer.uid;
  return viewer.isDM;
}

export function canDeleteEntity(viewer: Viewer | null, entity: Pick<Entity, 'type' | 'ownerId'>): boolean {
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
