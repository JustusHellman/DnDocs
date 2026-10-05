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
  /** The campaign's own entry types and tweaks to the built-in ones. */
  typeConfig?: TypeConfig;
  createdAt: string;
}

export type BuiltinType =
  | 'npc'
  | 'settlement'
  | 'landmark'
  | 'country'
  | 'faction'
  | 'shop'
  | 'item'
  | 'note'
  | 'geography'
  | 'quest'
  | 'monster';

/** A built-in type, or the id of a campaign's own type (see TypeConfig). */
export type EntityType = BuiltinType | (string & {});

export type FieldKind = 'text' | 'textarea' | 'boolean' | 'select' | 'entity-select';

export interface CustomFieldDef {
  key: string;
  label: string;
  type: FieldKind;
  options?: string[];
  rating?: boolean;
  description?: string;
  targetType?: string;
}

/** An entry type the DM made for this campaign. Stored as `type: base` + `customType: id`. */
export interface CustomTypeDef {
  id: string;
  label: string;
  plural: string;
  /** Key of an icon in TYPE_ICONS. */
  icon: string;
  /** Colour: the tone of a built-in type. */
  tone: BuiltinType;
  /** Built-in type it's stored as and behaves like (place in the world, what it can be inside). */
  base: Exclude<BuiltinType, 'note'>;
  group: 'Adventure' | 'Characters' | 'World';
  fields: CustomFieldDef[];
}

export interface TypeOverride {
  label?: string;
  plural?: string;
  /** Built-in fields the DM doesn't use. */
  hiddenFields?: string[];
  extraFields?: CustomFieldDef[];
  /** Hide the type from menus (existing entries stay). */
  hidden?: boolean;
}

export interface TypeConfig {
  custom?: CustomTypeDef[];
  overrides?: Partial<Record<BuiltinType, TypeOverride>>;
}

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

export interface MapPin {
  x: number;
  y: number;
  targetEntityId: string;
}

export interface MapConfig {
  mediaId: string;
  pins: MapPin[];
}

export interface Entity {
  id: string;
  campaignId: string;
  type: EntityType;
  /** Set when the entry uses one of the campaign's own types (`type` is then its base type). */
  customType?: string;
  name: string;
  content: string;
  tags: string[];
  ownerId: string;
  isPublic: boolean;
  /** Everyone who may read the document (enforced by security rules). Derived on save for DM entries. */
  allowedPlayers: string[];
  /** Players the DM explicitly shared the entry with ("Some" visibility). */
  sharedWith?: string[];
  fieldPermissions?: Record<string, FieldPermission>;
  playerKnowledge?: Record<string, string>;
  locationId?: string | null;
  mapConfig?: MapConfig | null;
  gender?: string | null;
  /** Either external URLs, `data:` URLs (unsaved) or `media:<id>` references. */
  imageUrls?: string[];
  /** Small inline preview of the first image (WebP/JPEG data url) for lists and cards. */
  coverThumb?: string | null;
  attributes?: Record<string, any>;
  statBlock?: string | null;
  dndStats?: DndStats | null;
  dmNotes?: string | null;
  lastPushedAt?: number;
  /** Who the last "show on screen" was for (empty/missing: everyone who can see it). */
  lastPushedTo?: string[];
  /**
   * 2 = fields without their own setting are visible to everyone who can see the entry.
   * Older entries (missing) only showed such fields when the entry was public.
   */
  shareV?: 2;
  /** Log of when the DM revealed / showed this entry (for the Chronicle). */
  reveals?: RevealEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface RevealEvent {
  at: number;
  /** Player uids, or ['*'] for everyone. */
  to: string[];
  /** true when it was only shown on screens (access already existed). */
  showOnly?: boolean;
}

export interface Relationship {
  id: string;
  campaignId: string;
  sourceId: string;
  targetId: string;
  targetName: string;
  /** What the target is to the source ("Father"). */
  label: string;
  /** Legacy pairs: id of the mirrored doc. Single-record links (v: 2) leave it empty. */
  reverseId: string;
  /** v2: what the source is to the target ("Son"). */
  reverseLabel?: string;
  v?: 2;
  createdAt: string;
}

export interface MediaDoc {
  id: string;
  entityId: string;
  campaignId: string;
  /** base64 data URL (or plain URL for externally hosted map images) */
  data: string;
  mimeType?: string;
  ownerId: string;
  createdAt: string;
}
