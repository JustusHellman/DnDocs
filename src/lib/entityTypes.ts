import type { ComponentType } from 'react';
import {
  GiAnvil,
  GiBearFace,
  GiBlackFlag,
  GiBookCover,
  GiCampfire,
  GiCastle,
  GiCauldron,
  GiCrossedSwords,
  GiCrown,
  GiCrystalBall,
  GiCowled,
  GiDeathSkull,
  GiDragonHead,
  GiFairyWand,
  GiGems,
  GiGhost,
  GiHeartBottle,
  GiHood,
  GiHorseHead,
  GiKey,
  GiLockedChest,
  GiMagicSwirl,
  GiMountains,
  GiObelisk,
  GiPotionBall,
  GiQuillInk,
  GiRing,
  GiScrollQuill,
  GiScrollUnfurled,
  GiShield,
  GiSailboat,
  GiShop,
  GiSpellBook,
  GiSunPriest,
  GiSwordsEmblem,
  GiTempleGate,
  GiTreasureMap,
  GiTreeBranch,
  GiVillage,
  GiWolfHead,
} from 'react-icons/gi';
import type { BuiltinType, CustomFieldDef, CustomTypeDef, Entity, EntityType, FieldKind, TypeConfig } from '../types';

export type FieldType = FieldKind;

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  description?: string;
  targetType?: EntityType;
  defaultValue?: unknown;
  /** Rendered as a 1–20 rating (still stored as text for backwards compatibility). */
  rating?: boolean;
}

export type EntityIcon = ComponentType<{ size?: number | string; className?: string; 'aria-hidden'?: boolean }>;

export interface EntityTypeMeta {
  value: EntityType;
  label: string;
  plural: string;
  /** Illustrated icon (game-icons.net, CC BY 3.0). */
  icon: EntityIcon;
  /** CSS classes that set this type's ink colour (see `.tone-*` in index.css). */
  tone: string;
  /** Size in the world hierarchy – larger contains smaller. */
  level: number;
  /** Which types this type can be "located in". */
  parents: EntityType[];
  /** Attribute keys worth showing on cards / list rows. */
  summaryKeys: string[];
  fields: FieldSchema[];
  /** Sidebar group. */
  group: 'Adventure' | 'Characters' | 'World';
  /** Hidden from menus by the DM. */
  hidden?: boolean;
  /** Campaign-made type: stored as `base` (see storageType). */
  custom?: boolean;
  base?: BuiltinType;
  /** Key in TYPE_ICONS (custom types). */
  iconKey?: string;
  /** The DM's choice of fields "Reveal" ticks by default. */
  revealDefaults?: Record<string, boolean>;
}

const r = (key: string, label: string, description: string): FieldSchema => ({
  key,
  label,
  type: 'text',
  description,
  rating: true,
});

const BUILTIN_DEFS: Omit<EntityTypeMeta, 'group'>[] = [
  {
    value: 'quest',
    label: 'Quest',
    plural: 'Quests',
    icon: GiScrollQuill,
    tone: 'tone tone-quest',
    level: 1,
    parents: ['geography', 'country', 'settlement', 'landmark', 'faction', 'shop', 'npc', 'monster', 'item', 'quest'],
    summaryKeys: ['status', 'rewards'],
    fields: [
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['Rumored', 'Active', 'Completed', 'Failed', 'On Hold'],
        description: 'Current state of the quest.',
      },
      { key: 'questGiver', label: 'Quest Giver', type: 'entity-select', targetType: 'npc', description: 'Who gave this quest?' },
      { key: 'location', label: 'Location', type: 'entity-select', targetType: 'landmark', description: 'Where does this quest take place?' },
      { key: 'rewards', label: 'Rewards', type: 'textarea', description: 'Gold, items, XP, or favors promised.' },
      { key: 'objectives', label: 'Objectives', type: 'textarea', description: 'What needs to be done to complete the quest.' },
    ],
  },
  {
    value: 'note',
    label: 'Note',
    plural: 'Notes',
    icon: GiQuillInk,
    tone: 'tone tone-note',
    level: 0,
    parents: ['geography', 'country', 'settlement', 'landmark', 'faction', 'shop', 'npc', 'monster', 'item', 'quest', 'note'],
    summaryKeys: ['sessionNumber', 'date'],
    fields: [
      { key: 'sessionNumber', label: 'Session Number', type: 'text', description: 'Which game session does this note belong to?' },
      { key: 'date', label: 'Date', type: 'text', description: 'In-game or real-world date.' },
    ],
  },
  {
    value: 'item',
    label: 'Item',
    plural: 'Items',
    icon: GiLockedChest,
    tone: 'tone tone-item',
    level: 2,
    parents: ['npc', 'shop', 'settlement', 'landmark'],
    summaryKeys: ['itemCategory', 'damageDie'],
    fields: [
      {
        key: 'itemCategory',
        label: 'Item Category',
        type: 'select',
        options: ['Weapon', 'Potion', 'Equipment', 'Armor', 'Scroll', 'Artifact', 'Other'],
        description: 'The general classification of the item.',
      },
      { key: 'damageDie', label: 'Damage Die', type: 'text', description: 'e.g. 1d8, 2d6' },
      { key: 'proficiencyRequirement', label: 'Proficiency Requirement', type: 'text', description: 'e.g. Simple Weapons, Heavy Armor' },
      { key: 'range', label: 'Range', type: 'text', description: 'e.g. 5ft, 30/120' },
      { key: 'statOfUse', label: 'Stat of Use', type: 'text', description: 'e.g. Dex, Str, Int' },
      { key: 'specialProperties', label: 'Special Properties', type: 'textarea', description: 'Finesse, Light, Heavy, etc.' },
      { key: 'attunement', label: 'Requires Attunement?', type: 'boolean', defaultValue: false },
    ],
  },
  {
    value: 'npc',
    label: 'NPC',
    plural: 'NPCs',
    icon: GiCowled,
    tone: 'tone tone-npc',
    level: 4,
    parents: ['settlement', 'shop', 'landmark', 'country', 'geography', 'faction'],
    summaryKeys: ['race', 'profession'],
    fields: [
      { key: 'title', label: 'Title', type: 'text', description: 'e.g. The Brave, Archmage, Captain' },
      { key: 'race', label: 'Race', type: 'text', description: 'e.g. Human, Elf, Dwarf' },
      r('skillLevel', 'Skill Level', 'A number between 1 and 20 representing their expertise.'),
      { key: 'age', label: 'Age', type: 'text', description: 'The chronological age of the NPC.' },
      { key: 'profession', label: 'Profession', type: 'text', description: 'What do they do for a living?' },
      { key: 'placeOfEmployment', label: 'Place of Employment', type: 'text', description: 'Where does this NPC work?' },
      { key: 'shiftSchedule', label: 'Shift Schedule', type: 'text', description: 'When are they usually at work?' },
      { key: 'alignment', label: 'General Alignment', type: 'text', description: 'e.g. Lawful Good, Chaotic Evil' },
      { key: 'specifics', label: 'Specifics', type: 'textarea', description: 'Physical appearance, personality traits, etc.' },
      { key: 'partyInteraction', label: 'Party Interaction', type: 'textarea', description: 'How they have interacted with the party so far.' },
      { key: 'characterSheetLink', label: 'Character Sheet Link', type: 'text', description: 'URL to D&D Beyond or other character sheet.' },
      { key: 'isAlive', label: 'Is Alive?', type: 'boolean', defaultValue: true },
      { key: 'codeOfConduct', label: 'Code of Conduct', type: 'textarea', description: 'Personal rules or moral compass.' },
    ],
  },
  {
    value: 'monster',
    label: 'Monster',
    plural: 'Monsters',
    icon: GiDragonHead,
    tone: 'tone tone-monster',
    level: 3,
    parents: ['geography', 'country', 'settlement', 'landmark', 'faction', 'shop', 'npc', 'monster'],
    summaryKeys: ['monsterType', 'challengeRating'],
    fields: [
      { key: 'monsterType', label: 'Type', type: 'text', description: 'e.g. Beast, Undead, Dragon, Fiend, Aberration' },
      { key: 'challengeRating', label: 'Challenge Rating (CR)', type: 'text', description: 'e.g. 1/4, 5, 15' },
      { key: 'environment', label: 'Environment', type: 'text', description: 'e.g. Forest, Underdark, Urban, Swamp' },
      { key: 'tactics', label: 'Combat Tactics', type: 'textarea', description: 'How does it behave in combat? Does it ambush, flee, or fight to the death?' },
      { key: 'harvestableLoot', label: 'Harvestable Loot', type: 'textarea', description: 'What can be gathered from its remains? (e.g. Venom, Scales, Pelts)' },
      { key: 'isUnique', label: 'Is Unique Boss?', type: 'boolean', description: 'Is this a named, unique monster or a generic species?', defaultValue: false },
    ],
  },
  {
    value: 'shop',
    label: 'Shop',
    plural: 'Shops',
    icon: GiShop,
    tone: 'tone tone-shop',
    level: 5,
    parents: ['settlement', 'landmark', 'country', 'geography'],
    summaryKeys: ['storeType', 'pricing'],
    fields: [
      { key: 'storeType', label: 'Store Type', type: 'text', description: 'e.g. Blacksmith, General Store, Alchemist.' },
      r('itemAvailability', 'Item Availability', 'How easy is it to find items? (1-20)'),
      r('productQuality', 'Product Quality', 'The general quality of goods sold. (1-20)'),
      r('exoticAvailability', 'Exotic Availability', 'Availability of rare or unusual items. (1-20)'),
      r('ownersOvertness', 'Owners Overtness', 'How well known is the shop owner? (1-20)'),
      { key: 'hoursOfBusiness', label: 'Hours of Business', type: 'text', description: 'When is the shop open?' },
      {
        key: 'pricing',
        label: 'Pricing',
        type: 'select',
        options: ['Free', 'Very Low', 'Low', 'Below Average', 'Medium', 'Above Average', 'High', 'Very High', 'Exorbitant', 'Excessive'],
        description: 'General price level compared to standard.',
      },
      { key: 'specialism', label: 'Specialties', type: 'text', description: 'What is this shop famous for?' },
      { key: 'personnel', label: 'Personnel', type: 'entity-select', targetType: 'npc', description: 'Select an NPC from your campaign who works here.' },
      { key: 'shiftSchedule', label: 'Shift Schedule', type: 'text', description: 'Operating hours or staff rotation.' },
    ],
  },
  {
    value: 'geography',
    label: 'Geography',
    plural: 'Geographies',
    icon: GiMountains,
    tone: 'tone tone-geography',
    level: 10,
    parents: ['geography', 'country'],
    summaryKeys: ['geographyType'],
    fields: [
      {
        key: 'geographyType',
        label: 'Geography Type',
        type: 'select',
        options: ['Mountain Ranges', 'Swamps', 'Plains', 'Oceans', 'Lakes', 'Rivers', 'Continents', 'Forests', 'Deserts', 'Islands'],
        description: 'The physical nature of the area.',
      },
      r('securityLevel', 'Security Level', 'How well patrolled or dangerous is this area? (1-20)'),
      { key: 'codeOfConduct', label: 'Code of Conduct', type: 'textarea', description: 'Behavior of the people you will meet here commonly.' },
      { key: 'heritageRaces', label: 'Heritage Races', type: 'textarea', description: 'Historical background of the geography and which cultures influenced it.' },
      r('stateOfFamiliarity', 'State of Familiarity', 'How well mapped or known is the area? (1-20)'),
      { key: 'wealth', label: 'Wealth', type: 'text', description: 'How rich in resources the area is (mineral density, etc).' },
      r('ownersOvertness', 'Owners Overtness', 'How thoroughly the history of the inhabitants is known. (1-20)'),
      { key: 'specialism', label: 'Specialism', type: 'text', description: 'What type of resources are most prevalent in the area.' },
    ],
  },
  {
    value: 'landmark',
    label: 'Landmark',
    plural: 'Landmarks',
    icon: GiObelisk,
    tone: 'tone tone-landmark',
    level: 7,
    parents: ['settlement', 'country', 'geography'],
    summaryKeys: ['landmarkType'],
    fields: [
      { key: 'landmarkType', label: 'Landmark Type', type: 'text', description: 'e.g. Statue, Ancient Tree, Ruin, Monument.' },
      r('securityLevel', 'Security Level', 'How well guarded or dangerous is this landmark? (1-20)'),
      { key: 'codeOfConduct', label: 'Code of Conduct', type: 'textarea', description: 'Rules or behavior expected at this location.' },
      { key: 'heritageRaces', label: 'Heritage Races', type: 'text', description: 'Historical background of the landmark and which cultures influenced it.' },
      r('stateOfFamiliarity', 'State of Familiarity', 'How well known is this landmark? (1-20)'),
      r('ownersOvertness', 'Owners Overtness', 'How obvious is the control or ownership of this landmark? (1-20)'),
      { key: 'wealth', label: 'Wealth', type: 'text', description: 'Resources or value associated with this landmark.' },
      { key: 'specialism', label: 'Specialism', type: 'text', description: 'Unique features or properties of the landmark.' },
    ],
  },
  {
    value: 'faction',
    label: 'Faction',
    plural: 'Factions',
    icon: GiBlackFlag,
    tone: 'tone tone-faction',
    level: 6,
    parents: ['country', 'settlement', 'geography'],
    summaryKeys: ['factionType'],
    fields: [
      { key: 'factionType', label: 'Faction Type', type: 'text', description: 'e.g. Guild, Cult, Secret Society, Political Party.' },
      { key: 'shortDescription', label: 'Short Description', type: 'textarea', description: 'A brief overview of the faction.' },
      r('politicalInfluence', 'Political Influence', 'Power in government or social structures. (1-20)'),
      r('militaryPower', 'Military Power', 'Strength of armed forces or combatants. (1-20)'),
      r('covertPower', 'Covert Power', 'Strength in espionage or secret operations. (1-20)'),
      r('logisticalPower', 'Logistical Power', 'Ability to move resources and people. (1-20)'),
      r('tradingPower', 'Trading Power', 'Economic influence and trade networks. (1-20)'),
      r('secrecyOfOperation', 'Secrecy of Operation', 'How hidden are their activities? (1-20)'),
      r('ownersOvertness', 'Owners Overtness', 'How well known are the faction leaders? (1-20)'),
    ],
  },
  {
    value: 'settlement',
    label: 'Settlement',
    plural: 'Settlements',
    icon: GiVillage,
    tone: 'tone tone-settlement',
    level: 8,
    parents: ['country', 'geography'],
    summaryKeys: ['settlementType', 'dominantRaces'],
    fields: [
      {
        key: 'settlementType',
        label: 'Settlement Type',
        type: 'select',
        options: ['City', 'Town', 'Village', 'Trading Port', 'Military Port', 'Encampment', 'Fort', 'Hamlet', 'Outpost'],
        description: 'The scale and nature of the settlement.',
      },
      { key: 'shortDescription', label: 'Short Description', type: 'textarea', description: 'A brief overview of the settlement.' },
      r('securityLevel', 'Security Level', 'How well patrolled is this area from 1 to 20.'),
      { key: 'codeOfConduct', label: 'Code of Conduct', type: 'textarea', description: 'Local laws, customs, or unwritten rules.' },
      { key: 'dominantRaces', label: 'Dominant Races', type: 'text', description: 'The primary races inhabiting the settlement.' },
      { key: 'culturalBehavior', label: 'Cultural Behavior', type: 'textarea', description: 'Common traditions, social norms, or quirks.' },
      r('ownersOvertness', 'Owners Overtness', 'A number between 1 and 20, 20 being the highest meaning the owners would be well known or even famous.'),
      { key: 'wealth', label: 'Wealth', type: 'text', description: 'Economic status of the settlement (e.g. Poor, Average, Wealthy).' },
      { key: 'specialism', label: 'Specialism', type: 'text', description: 'What is this settlement known for? (e.g. Trade, Mining, Magic).' },
    ],
  },
  {
    value: 'country',
    label: 'Country',
    plural: 'Countries',
    icon: GiCastle,
    tone: 'tone tone-country',
    level: 9,
    parents: ['geography', 'country'],
    summaryKeys: ['countryType'],
    fields: [
      { key: 'countryType', label: 'Country Type', type: 'text', description: 'e.g. Empire, Kingdom, Republic, Federation.' },
      { key: 'shortDescription', label: 'Short Description', type: 'textarea', description: 'A brief overview of the country.' },
      { key: 'heritage', label: 'Heritage', type: 'text', description: 'Historical and cultural background.' },
      r('wealth', 'Economical Wealth', 'National economic status. (1-20)'),
      r('stability', 'Stability', 'How stable is the government and society? (1-20)'),
      r('politicalInfluence', 'Political Influence', 'Global political power. (1-20)'),
      r('militaryPower', 'Military Power', 'National military strength. (1-20)'),
      r('covertPower', 'Covert Power', 'National intelligence and secret service strength. (1-20)'),
      r('logisticalPower', 'Logistical Power', 'National infrastructure and logistics. (1-20)'),
      r('tradingPower', 'Trading Power', 'National trade and economic influence. (1-20)'),
      { key: 'culturalIdentity', label: 'Cultural Identity', type: 'textarea', description: 'Core values, traditions, and national identity.' },
      r('leadershipControl', 'Leadership Control', 'How much control the rulers have over the country. (1-20)'),
    ],
  },
];

const GROUP: Record<BuiltinType, EntityTypeMeta['group']> = {
  quest: 'Adventure',
  note: 'Adventure',
  item: 'Adventure',
  npc: 'Characters',
  monster: 'Characters',
  faction: 'Characters',
  country: 'World',
  geography: 'World',
  settlement: 'World',
  landmark: 'World',
  shop: 'World',
};

const BUILTIN: EntityTypeMeta[] = BUILTIN_DEFS.map((t) => ({ ...t, group: GROUP[t.value as BuiltinType] }));
export const BUILTIN_TYPES = BUILTIN.map((t) => t.value as BuiltinType);
const BUILTIN_PLACES: BuiltinType[] = ['geography', 'country', 'settlement', 'landmark', 'shop'];

/** A built-in type as it ships, ignoring the campaign's tweaks. */
export function builtinMeta(type: BuiltinType): EntityTypeMeta {
  return BUILTIN.find((t) => t.value === type) ?? BUILTIN[0];
}

/** Icons a DM can pick for their own types. */
export const TYPE_ICONS: Record<string, EntityIcon> = {
  scroll: GiScrollUnfurled,
  book: GiBookCover,
  spellbook: GiSpellBook,
  magic: GiMagicSwirl,
  wand: GiFairyWand,
  crystal: GiCrystalBall,
  potion: GiPotionBall,
  bottle: GiHeartBottle,
  cauldron: GiCauldron,
  ring: GiRing,
  gems: GiGems,
  key: GiKey,
  crown: GiCrown,
  shield: GiShield,
  swords: GiCrossedSwords,
  emblem: GiSwordsEmblem,
  anvil: GiAnvil,
  hood: GiHood,
  priest: GiSunPriest,
  skull: GiDeathSkull,
  ghost: GiGhost,
  wolf: GiWolfHead,
  bear: GiBearFace,
  horse: GiHorseHead,
  ship: GiSailboat,
  temple: GiTempleGate,
  camp: GiCampfire,
  tree: GiTreeBranch,
  map: GiTreasureMap,
};

/**
 * The type registry. These are mutated in place by `applyTypeConfig` when a campaign has its own
 * types, so every module keeps working with the same imports.
 */
export const ENTITY_TYPES: EntityTypeMeta[] = [];
export const TYPE_META: Record<string, EntityTypeMeta> = {};
/** Largest → smallest; used for default sort orders and the world map. */
export const TYPES_BY_SIZE: EntityType[] = [];
/** Types that behave like places (can own a map, show up as location filters). */
export const PLACE_TYPES: EntityType[] = [];

let appliedKey: string | null = null;

const toSchema = (f: CustomFieldDef): FieldSchema => ({
  key: f.key,
  label: f.label,
  type: f.type,
  options: f.options,
  rating: f.rating,
  description: f.description,
  targetType: f.targetType,
});

/** Rebuilds the registry from the built-in types plus a campaign's own configuration. */
export function applyTypeConfig(config: TypeConfig | undefined | null): boolean {
  const key = JSON.stringify(config ?? null);
  if (key === appliedKey) return false;
  appliedKey = key;

  const list: EntityTypeMeta[] = BUILTIN.map((t) => {
    const o = config?.overrides?.[t.value as BuiltinType];
    if (!o) return { ...t, parents: [...t.parents] };
    const hidden = new Set(o.hiddenFields ?? []);
    return {
      ...t,
      label: o.label?.trim() || t.label,
      plural: o.plural?.trim() || t.plural,
      hidden: !!o.hidden && t.value !== 'note',
      revealDefaults: o.revealDefaults,
      parents: [...t.parents],
      fields: [...t.fields.filter((f) => !hidden.has(f.key)), ...(o.extraFields ?? []).map(toSchema)],
      summaryKeys: t.summaryKeys.filter((k) => !hidden.has(k)),
    };
  });

  for (const c of config?.custom ?? []) {
    const base = list.find((t) => t.value === c.base) ?? list.find((t) => t.value === 'item')!;
    if (list.some((t) => t.value === c.id)) continue;
    list.push({
      value: c.id,
      label: c.label || 'Untitled type',
      plural: c.plural || `${c.label || 'Untitled'}s`,
      icon: TYPE_ICONS[c.icon] ?? GiScrollUnfurled,
      iconKey: c.icon,
      tone: `tone tone-${c.tone}`,
      level: base.level,
      parents: [...base.parents],
      summaryKeys: c.fields.filter((f) => f.type !== 'textarea').slice(0, 2).map((f) => f.key),
      fields: c.fields.map(toSchema),
      group: c.group,
      revealDefaults: c.revealDefaults,
      custom: true,
      base: c.base,
    });
    // Anything that can be inside the base type can be inside this one too.
    for (const t of list) if (t.parents.includes(c.base) && !t.parents.includes(c.id)) t.parents.push(c.id);
  }

  ENTITY_TYPES.splice(0, ENTITY_TYPES.length, ...list);
  for (const k of Object.keys(TYPE_META)) delete TYPE_META[k];
  for (const t of list) TYPE_META[t.value] = t;
  TYPES_BY_SIZE.splice(0, TYPES_BY_SIZE.length, ...[...list].sort((a, b) => b.level - a.level).map((t) => t.value));
  PLACE_TYPES.splice(0, PLACE_TYPES.length, ...list.filter((t) => BUILTIN_PLACES.includes((t.base ?? t.value) as BuiltinType)).map((t) => t.value));
  return true;
}

applyTypeConfig(null);

/** The built-in type an entry behaves like (itself for built-in types). */
export function baseType(type: string): string {
  return TYPE_META[type]?.base ?? type;
}

/** Types offered in menus and pickers (not hidden by the DM). */
export function menuTypes(): EntityTypeMeta[] {
  return ENTITY_TYPES.filter((t) => !t.hidden);
}

export function typeMeta(type: string | undefined): EntityTypeMeta {
  return TYPE_META[type as string] ?? TYPE_META.note;
}

export function isEntityType(value: string | null | undefined): value is EntityType {
  return !!value && value in TYPE_META;
}

/** What gets written to Firestore for a type (the security rules only know the built-in names). */
export function storageType(type: EntityType): { type: BuiltinType; customType?: string } {
  const meta = TYPE_META[type];
  if (meta?.custom && meta.base) return { type: meta.base, customType: meta.value };
  return { type: type as BuiltinType, customType: undefined };
}

/** Shows entries of a campaign's own types under that type (unknown types fall back to the base). */
export function normalizeEntity(e: Entity): Entity {
  return e.customType && TYPE_META[e.customType] ? { ...e, type: e.customType } : e;
}

export function slugForType(label: string, taken: string[]): string {
  const base =
    'c_' +
      label
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || 'c_type';
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

export type { CustomTypeDef };

export function fieldsFor(type: string | undefined): FieldSchema[] {
  return typeMeta(type).fields;
}

/**
 * Fields that stay with the DM unless chosen: tags (often prep labels), stat blocks, 1–20 ratings
 * (DM numbers) and fields about secrets or game mechanics.
 */
const DM_FIELDS = new Set([
  'tags',
  'statBlock',
  'alignment',
  'partyInteraction',
  'characterSheetLink',
  'isAlive',
  'challengeRating',
  'tactics',
  'harvestableLoot',
  'isUnique',
]);

/** Whether "Reveal" ticks a field by default (the DM can change this per type). */
export function defaultRevealed(type: string, key: string): boolean {
  const meta = typeMeta(type);
  const choice = meta.revealDefaults?.[key];
  if (choice !== undefined) return choice;
  return builtinRevealDefault(type, key);
}

/** The default before any DM choice. */
export function builtinRevealDefault(type: string, key: string): boolean {
  if (DM_FIELDS.has(key)) return false;
  return !fieldsFor(type).find((f) => f.key === key)?.rating;
}

/** Every field key that can carry its own visibility setting. */
export function permissionKeys(type: string): string[] {
  return ['content', 'tags', 'locationId', 'gender', 'imageUrls', 'statBlock', ...fieldsFor(type).map((f) => f.key)];
}

export function fieldLabel(type: string, key: string): string {
  const builtIn: Record<string, string> = {
    content: 'Description',
    tags: 'Tags',
    locationId: 'Location',
    gender: 'Gender',
    imageUrls: 'Images',
    statBlock: 'Stat Block',
  };
  return fieldsFor(type).find((f) => f.key === key)?.label ?? builtIn[key] ?? key;
}

export const QUEST_STATUS_TONE: Record<string, string> = {
  Rumored: 'text-stone-200 bg-stone-500/15 ring-stone-400/30',
  Active: 'text-amber-200 bg-amber-500/15 ring-amber-400/30',
  Completed: 'text-emerald-200 bg-emerald-500/15 ring-emerald-400/30',
  Failed: 'text-rose-200 bg-rose-500/15 ring-rose-400/30',
  'On Hold': 'text-sky-200 bg-sky-500/15 ring-sky-400/30',
};
