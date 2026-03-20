export type Role = 'dm' | 'player';

export interface User {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  dmId: string;
  players: string[];
  joinCode: string;
  createdAt: string;
}

export type EntityType = 'npc' | 'settlement' | 'landmark' | 'country' | 'faction' | 'shop' | 'item' | 'note';

export interface FieldPermission {
  isPublic: boolean;
  allowedPlayers: string[];
}

export interface Entity {
  id: string;
  campaignId: string;
  type: EntityType;
  name: string;
  content: string;
  tags: string[];
  ownerId: string;
  isPublic: boolean;
  allowedPlayers: string[];
  fieldPermissions?: Record<string, FieldPermission>;
  playerKnowledge?: Record<string, string>;
  locationId?: string | null;
  gender?: string | null;
  imageUrls?: string[];
  attributes?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Relationship {
  id: string;
  campaignId: string;
  sourceId: string;
  targetId: string;
  targetName: string;
  label: string;
  reverseId: string;
  createdAt: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}
