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
  coDms?: string[];
  players: string[];
  joinCode: string;
  createdAt: string;
}

export type EntityType = 'npc' | 'settlement' | 'landmark' | 'country' | 'faction' | 'shop' | 'item' | 'note' | 'geography' | 'quest' | 'monster';

export interface FieldPermission {
  isPublic: boolean;
  allowedPlayers: string[];
}

export interface DndStats {
  armorClass: string;
  hitPoints: string;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  skills: string;
  senses: string;
  languages: string;
  challenge: string;
  proficiencyBonus: string;
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
  statBlock?: string | null;
  dndStats?: DndStats | null;
  dmNotes?: string | null;
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
