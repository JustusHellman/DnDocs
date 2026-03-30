import { useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { Entity } from '../types';

export function usePermissions() {
  const { user, isDM } = useAuth();

  const canViewEntity = useCallback((entity: Entity) => {
    if (!user) return false;
    if (isDM) {
      // DM can see everything EXCEPT notes that are 'self' or 'party' and they aren't the owner
      if (entity.type === 'note' && entity.ownerId !== user.uid) {
        // If it's a note, and DM is not owner, check if it's public or DM is in allowedPlayers
        if (!entity.isPublic && !entity.allowedPlayers?.includes(user.uid)) {
           return false;
        }
      }
      return true;
    }
    if (entity.ownerId === user.uid) return true;
    if (entity.isPublic) return true;
    if (entity.allowedPlayers?.includes(user.uid)) return true;
    return false;
  }, [isDM, user]);

  const canViewField = useCallback((entity: Entity, fieldKey: string) => {
    if (!user) return false;
    if (isDM) {
      // Same logic as canViewEntity for DM
      if (entity.type === 'note' && entity.ownerId !== user.uid) {
        if (!entity.isPublic && !entity.allowedPlayers?.includes(user.uid)) {
          return false;
        }
      }
      return true;
    }
    if (entity.ownerId === user.uid) return true;
    
    const perm = entity.fieldPermissions?.[fieldKey];
    if (!perm) return entity.isPublic;
    if (perm.isPublic) return true;
    if (perm.allowedPlayers?.includes(user.uid)) return true;
    return false;
  }, [isDM, user]);

  const canEditEntity = useCallback((entity: Entity) => {
    if (!user) return false;
    if (isDM) {
      // DM can edit everything EXCEPT notes they don't own
      if (entity.type === 'note' && entity.ownerId !== user.uid) {
        return false;
      }
      return true;
    }
    // Only owner can edit for players
    return entity.ownerId === user.uid;
  }, [isDM, user]);

  return { canViewEntity, canViewField, canEditEntity };
}
