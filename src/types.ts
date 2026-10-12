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
  /** Table rules the DM can switch (absent = the rules as written). */
  houseRules?: HouseRules;
  createdAt: string;
}

export interface HouseRules {
  /** 5e massive damage: damage left over after 0 HP ≥ the HP maximum kills outright. Default on. */
  massiveDamage?: boolean;
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
  | 'monster'
  | 'character';

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
  base: Exclude<BuiltinType, 'note' | 'character'>;
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
  /** Server time of the last write (a Firestore Timestamp; null while a local write is pending). Used to sync only what changed. */
  syncAt?: unknown;
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
  /** Player characters: the player who plays it (may edit it together with the DM). */
  playerId?: string | null;
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
  shareV?: 2 | 3;
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
  /** Fields that became visible with this reveal. */
  fields?: string[];
}

export interface Relationship {
  id: string;
  /** Server time of the last write (see Entity.syncAt). */
  syncAt?: unknown;
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

// ---------------------------------------------------------------------------
// Battle maps. Everything on a battle map is measured in grid squares ("cells"), with
// (0, 0) at the top-left corner of the first full square, so it survives image recompression.
// ---------------------------------------------------------------------------

export interface SceneGrid {
  /** Squares across the full image width (may be fractional). */
  cols: number;
  /** Where the first grid line sits, as a fraction of a square (0–1). */
  ox: number;
  oy: number;
  show: boolean;
  snap: boolean;
  /** Feet per square. */
  feet: number;
  /** 5e: every diagonal counts as one square; alt: 5-10-5; euclid: straight line. */
  diagonal: '5e' | 'alt' | 'euclid';
  color: string;
  opacity: number;
}

export type FogMode = 'off' | 'manual' | 'vision';

export interface SceneCombat {
  active: boolean;
  round: number;
  /** Token whose turn it is. */
  turn: string | null;
  /** Turn order (token ids, hidden ones included) kept up to date by the DM's screen. */
  order?: string[];
}

/** scenes/{entityId}: one battle map per entry with a map image. */
export interface Scene {
  id: string;
  campaignId: string;
  entityId: string;
  name: string;
  /** The map image (copied from the entry, so players can join even if the place is secret to them). */
  mediaId?: string;
  /** Battle mode on: players see a "Join battle" banner and can open it. */
  active: boolean;
  grid: SceneGrid;
  fog: {
    mode: FogMode;
    /** Revealed squares (manual fog), a base64 bitmask over `cols` × `rows`. */
    revealed: string;
    cols: number;
    rows: number;
  };
  /** When the map was last sent from Battlemap Forge (its editable file is in secret/forge). */
  forgeAt?: string;
  /** Wall segments in squares, "x1,y1,x2,y2,…" (from a .dd2vtt import). */
  walls: string;
  /** Door segments in the same format; `openDoors` lists the open ones by index. */
  doors: string;
  openDoors: number[];
  combat: SceneCombat;
  createdAt: string;
  updatedAt: string;
}

export type TokenHealth = 'healthy' | 'bloodied' | 'down' | null;

/** scenes/{sceneId}/tokens/{tokenId} */
export interface Token {
  id: string;
  campaignId: string;
  name: string;
  /** Top-left corner, in squares. */
  x: number;
  y: number;
  /** Squares per side (0.5 tiny … 4 gargantuan). */
  size: number;
  color: string;
  /** Linked entry (character, NPC, monster): picture, HP and stats come from it. */
  entityId: string | null;
  /** Who may move it (players). The DM can move everything. */
  controlledBy: string[];
  /** Hidden from players (enforced by the security rules). */
  hidden: boolean;
  conditions: string[];
  initiative: number | null;
  /** The DM's order within an initiative tie (higher goes first); null after a new roll. */
  initTie?: number | null;
  /** Vision range in squares for line of sight (0 = unlimited). */
  vision: number;
  /** What players see of a monster's HP (exact numbers stay in the DM-only secret doc). */
  health: TokenHealth;
  /** Small round picture (copied from the entry, or uploaded), so players see it even for secret monsters. */
  img?: string | null;
  /** The party knows this creature is there: it shows in the players' initiative order. */
  known?: boolean;
  /**
   * When timed conditions end: condition → the round and the turn (token id) at which it runs out.
   * Conditions without an entry last until removed.
   */
  timers?: Record<string, { round: number; turn: string | null }>;
  /** A ring that moves with the token (Spirit Guardians, a paladin's aura…): radius in feet. */
  /** `conc`: set while concentrating, so it ends with the concentration. A timer for it is timers['@aura']. */
  aura?: { radius: number; color: string; conc?: boolean } | null;
  /** Height above the ground in feet (flying, levitating). */
  elevation?: number;
  updatedAt: string;
}

/** scenes/{sceneId}/drawings/{id} */
export interface Drawing {
  id: string;
  campaignId: string;
  by: string;
  /** free / line / rect: plain drawing. circle (sphere), cone, beam (line area), cube: spell templates. */
  kind: 'free' | 'line' | 'rect' | 'circle' | 'cone' | 'beam' | 'cube';
  /** Width of a line area (beam) in squares. */
  width?: number;
  color: string;
  /** Points in squares, "x,y,x,y,…" (two points for line / rect / circle). */
  points: string;
  /** Players see it. Players' drawings always are; the DM's start private. */
  shared: boolean;
  createdAt: string;
}

/** scenes/{sceneId}/live/{uid} and live/{uid}-m: each person's latest ping and shared measurement. */
export interface LiveMark {
  id: string;
  campaignId: string;
  kind: 'ping' | 'measure';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  /** A ruler with waypoints: every point, "x,y,x,y,…". */
  pts?: string;
  label?: string;
  name: string;
  at: number;
}

/** scenes/{sceneId}/secret/dm: the DM's numbers players must not see. */
export interface SceneSecret {
  campaignId: string;
  hp: Record<string, { cur: number; max: number }>;
}
