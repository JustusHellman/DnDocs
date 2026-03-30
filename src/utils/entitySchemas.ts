export type FieldType = 'text' | 'textarea' | 'boolean' | 'select' | 'entity-select';

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  description?: string;
  targetType?: string; // For entity-select
  defaultValue?: any;
}

export const ENTITY_TYPES_ORDERED = [
  { value: 'quest', label: 'Quest' },
  { value: 'note', label: 'Note' },
  { value: 'item', label: 'Item' },
  { value: 'npc', label: 'NPC' },
  { value: 'monster', label: 'Monster' },
  { value: 'shop', label: 'Shop' },
  { value: 'landmark', label: 'Landmark' },
  { value: 'faction', label: 'Faction' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'country', label: 'Country' },
  { value: 'geography', label: 'Geography' },
];

export const ENTITY_SCHEMAS: Record<string, FieldSchema[]> = {
  npc: [
    { key: 'title', label: 'Title', type: 'text', description: 'e.g. The Brave, Archmage, Captain' },
    { key: 'race', label: 'Race', type: 'text', description: 'e.g. Human, Elf, Dwarf' },
    { key: 'skillLevel', label: 'Skill Level', type: 'text', description: 'A number between 1 and 20 representing their expertise.' },
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
  settlement: [
    { 
      key: 'settlementType', 
      label: 'Settlement Type', 
      type: 'select', 
      options: ['City', 'Town', 'Village', 'Trading Port', 'Military Port', 'Encampment', 'Fort', 'Hamlet', 'Outpost'], 
      description: 'The scale and nature of the settlement.' 
    },
    { key: 'shortDescription', label: 'Short Description', type: 'textarea', description: 'A brief overview of the settlement.' },
    { key: 'securityLevel', label: 'Security Level', type: 'text', description: 'How well patrolled is this area from 1 to 20.' },
    { key: 'codeOfConduct', label: 'Code of Conduct', type: 'textarea', description: 'Local laws, customs, or unwritten rules.' },
    { key: 'dominantRaces', label: 'Dominant Races', type: 'text', description: 'The primary races inhabiting the settlement.' },
    { key: 'culturalBehavior', label: 'Cultural Behavior', type: 'textarea', description: 'Common traditions, social norms, or quirks.' },
    { key: 'ownersOvertness', label: 'Owners Overtness', type: 'text', description: 'A number between 1 and 20, 20 being the highest meaning the owners would be well known or even famous.' },
    { key: 'wealth', label: 'Wealth', type: 'text', description: 'Economic status of the settlement (e.g. Poor, Average, Wealthy).' },
    { key: 'specialism', label: 'Specialism', type: 'text', description: 'What is this settlement known for? (e.g. Trade, Mining, Magic).' },
  ],
  landmark: [
    { key: 'landmarkType', label: 'Landmark Type', type: 'text', description: 'e.g. Statue, Ancient Tree, Ruin, Monument.' },
    { key: 'securityLevel', label: 'Security Level', type: 'text', description: 'How well guarded or dangerous is this landmark? (1-20)' },
    { key: 'codeOfConduct', label: 'Code of Conduct', type: 'textarea', description: 'Rules or behavior expected at this location.' },
    { key: 'heritageRaces', label: 'Heritage Races', type: 'text', description: 'Historical background of the landmark and which cultures influenced it.' },
    { key: 'stateOfFamiliarity', label: 'State of Familiarity', type: 'text', description: 'How well known is this landmark? (1-20)' },
    { key: 'ownersOvertness', label: 'Owners Overtness', type: 'text', description: 'How obvious is the control or ownership of this landmark? (1-20)' },
    { key: 'wealth', label: 'Wealth', type: 'text', description: 'Resources or value associated with this landmark.' },
    { key: 'specialism', label: 'Specialism', type: 'text', description: 'Unique features or properties of the landmark.' },
  ],
  shop: [
    { key: 'storeType', label: 'Store Type', type: 'text', description: 'e.g. Blacksmith, General Store, Alchemist.' },
    { key: 'itemAvailability', label: 'Item Availability', type: 'text', description: 'How easy is it to find items? (1-20)' },
    { key: 'productQuality', label: 'Product Quality', type: 'text', description: 'The general quality of goods sold. (1-20)' },
    { key: 'exoticAvailability', label: 'Exotic Availability', type: 'text', description: 'Availability of rare or unusual items. (1-20)' },
    { key: 'ownersOvertness', label: 'Owners Overtness', type: 'text', description: 'How well known is the shop owner? (1-20)' },
    { key: 'hoursOfBusiness', label: 'Hours of Business', type: 'text', description: 'When is the shop open?' },
    { 
      key: 'pricing', 
      label: 'Pricing', 
      type: 'select', 
      options: ['Free', 'Very Low', 'Low', 'Below Average', 'Medium', 'Above Average', 'High', 'Very High', 'Exorbitant', 'Excessive'],
      description: 'General price level compared to standard.'
    },
    { key: 'specialism', label: 'Specialties', type: 'text', description: 'What is this shop famous for?' },
    { key: 'personnel', label: 'Personnel', type: 'entity-select', targetType: 'npc', description: 'Select an NPC from your campaign who works here.' },
    { key: 'shiftSchedule', label: 'Shift Schedule', type: 'text', description: 'Operating hours or staff rotation.' },
  ],
  faction: [
    { key: 'factionType', label: 'Faction Type', type: 'text', description: 'e.g. Guild, Cult, Secret Society, Political Party.' },
    { key: 'shortDescription', label: 'Short Description', type: 'textarea', description: 'A brief overview of the faction.' },
    { key: 'politicalInfluence', label: 'Political Influence', type: 'text', description: 'Power in government or social structures. (1-20)' },
    { key: 'militaryPower', label: 'Military Power', type: 'text', description: 'Strength of armed forces or combatants. (1-20)' },
    { key: 'covertPower', label: 'Covert Power', type: 'text', description: 'Strength in espionage or secret operations. (1-20)' },
    { key: 'logisticalPower', label: 'Logistical Power', type: 'text', description: 'Ability to move resources and people. (1-20)' },
    { key: 'tradingPower', label: 'Trading Power', type: 'text', description: 'Economic influence and trade networks. (1-20)' },
    { key: 'secrecyOfOperation', label: 'Secrecy of Operation', type: 'text', description: 'How hidden are their activities? (1-20)' },
    { key: 'ownersOvertness', label: 'Owners Overtness', type: 'text', description: 'How well known are the faction leaders? (1-20)' },
  ],
  country: [
    { key: 'countryType', label: 'Country Type', type: 'text', description: 'e.g. Empire, Kingdom, Republic, Federation.' },
    { key: 'shortDescription', label: 'Short Description', type: 'textarea', description: 'A brief overview of the country.' },
    { key: 'heritage', label: 'Heritage', type: 'text', description: 'Historical and cultural background.' },
    { key: 'wealth', label: 'Economical Wealth', type: 'text', description: 'National economic status. (1-20)' },
    { key: 'stability', label: 'Stability', type: 'text', description: 'How stable is the government and society? (1-20)' },
    { key: 'politicalInfluence', label: 'Political Influence', type: 'text', description: 'Global political power. (1-20)' },
    { key: 'militaryPower', label: 'Military Power', type: 'text', description: 'National military strength. (1-20)' },
    { key: 'covertPower', label: 'Covert Power', type: 'text', description: 'National intelligence and secret service strength. (1-20)' },
    { key: 'logisticalPower', label: 'Logistical Power', type: 'text', description: 'National infrastructure and logistics. (1-20)' },
    { key: 'tradingPower', label: 'Trading Power', type: 'text', description: 'National trade and economic influence. (1-20)' },
    { key: 'culturalIdentity', label: 'Cultural Identity', type: 'textarea', description: 'Core values, traditions, and national identity.' },
    { key: 'leadershipControl', label: 'Leadership Control', type: 'text', description: 'How much control the rulers have over the country. (1-20)' },
  ],
  geography: [
    { 
      key: 'geographyType', 
      label: 'Geography Type', 
      type: 'select', 
      options: ['Mountain Ranges', 'Swamps', 'Plains', 'Oceans', 'Lakes', 'Rivers', 'Continents', 'Forests', 'Deserts', 'Islands'],
      description: 'The physical nature of the area.'
    },
    { key: 'securityLevel', label: 'Security Level', type: 'text', description: 'How well patrolled or dangerous is this area? (1-20)' },
    { key: 'codeOfConduct', label: 'Code of Conduct', type: 'textarea', description: 'Behavior of the people you will meet here commonly.' },
    { key: 'heritageRaces', label: 'Heritage Races', type: 'textarea', description: 'Historical background of the geography and which cultures influenced it.' },
    { key: 'stateOfFamiliarity', label: 'State of Familiarity', type: 'text', description: 'How well mapped or known is the area? (1-20)' },
    { key: 'wealth', label: 'Wealth', type: 'text', description: 'How rich in resources the area is (mineral density, etc).' },
    { key: 'ownersOvertness', label: 'Owners Overtness', type: 'text', description: 'How thoroughly the history of the inhabitants is known. (1-20)' },
    { key: 'specialism', label: 'Specialism', type: 'text', description: 'What type of resources are most prevalent in the area.' },
  ],
  item: [
    { 
      key: 'itemCategory', 
      label: 'Item Category', 
      type: 'select', 
      options: ['Weapon', 'Potion', 'Equipment', 'Armor', 'Scroll', 'Artifact', 'Other'],
      description: 'The general classification of the item.'
    },
    { key: 'damageDie', label: 'Damage Die', type: 'text', description: 'e.g. 1d8, 2d6' },
    { key: 'proficiencyRequirement', label: 'Proficiency Requirement', type: 'text', description: 'e.g. Simple Weapons, Heavy Armor' },
    { key: 'range', label: 'Range', type: 'text', description: 'e.g. 5ft, 30/120' },
    { key: 'statOfUse', label: 'Stat of Use', type: 'text', description: 'e.g. Dex, Str, Int' },
    { key: 'specialProperties', label: 'Special Properties', type: 'textarea', description: 'Finesse, Light, Heavy, etc.' },
    { key: 'attunement', label: 'Requires Attunement?', type: 'boolean', defaultValue: false },
  ],
  note: [
    { key: 'sessionNumber', label: 'Session Number', type: 'text', description: 'Which game session does this note belong to?' },
    { key: 'date', label: 'Date', type: 'text', description: 'In-game or real-world date.' },
  ],
  quest: [
    { 
      key: 'status', 
      label: 'Status', 
      type: 'select', 
      options: ['Rumored', 'Active', 'Completed', 'Failed', 'On Hold'],
      description: 'Current state of the quest.'
    },
    { key: 'questGiver', label: 'Quest Giver', type: 'entity-select', targetType: 'npc', description: 'Who gave this quest?' },
    { key: 'location', label: 'Location', type: 'entity-select', targetType: 'landmark', description: 'Where does this quest take place?' },
    { key: 'rewards', label: 'Rewards', type: 'textarea', description: 'Gold, items, XP, or favors promised.' },
    { key: 'objectives', label: 'Objectives', type: 'textarea', description: 'What needs to be done to complete the quest.' },
  ],
  monster: [
    { key: 'monsterType', label: 'Type', type: 'text', description: 'e.g. Beast, Undead, Dragon, Fiend, Aberration' },
    { key: 'challengeRating', label: 'Challenge Rating (CR)', type: 'text', description: 'e.g. 1/4, 5, 15' },
    { key: 'environment', label: 'Environment', type: 'text', description: 'e.g. Forest, Underdark, Urban, Swamp' },
    { key: 'tactics', label: 'Combat Tactics', type: 'textarea', description: 'How does it behave in combat? Does it ambush, flee, or fight to the death?' },
    { key: 'harvestableLoot', label: 'Harvestable Loot', type: 'textarea', description: 'What can be gathered from its remains? (e.g. Venom, Scales, Pelts)' },
    { key: 'isUnique', label: 'Is Unique Boss?', type: 'boolean', description: 'Is this a named, unique monster or a generic species?', defaultValue: false }
  ]
};

export const ENTITY_HIERARCHY: Record<string, number> = {
  geography: 10,
  country: 9,
  settlement: 8,
  landmark: 7,
  faction: 6,
  shop: 5,
  npc: 4,
  monster: 3,
  item: 2,
  quest: 1,
  note: 0,
};
