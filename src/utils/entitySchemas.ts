export type FieldType = 'text' | 'textarea' | 'boolean' | 'select';

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
}

export const ENTITY_SCHEMAS: Record<string, FieldSchema[]> = {
  npc: [
    { key: 'alignment', label: 'General Alignment', type: 'text' },
    { key: 'race', label: 'Race', type: 'text' },
    { key: 'skillLevel', label: 'Skill Level', type: 'text' },
    { key: 'age', label: 'Age', type: 'text' },
    { key: 'profession', label: 'Profession', type: 'text' },
    { key: 'placeOfEmployment', label: 'Place of Employment', type: 'text' },
    { key: 'shiftSchedule', label: 'Shift Schedule', type: 'text' },
    { key: 'specifics', label: 'Specifics', type: 'textarea' },
    { key: 'partyInteraction', label: 'Party Interaction', type: 'textarea' },
    { key: 'characterSheetLink', label: 'Character Sheet Link', type: 'text' },
    { key: 'isAlive', label: 'Is Alive?', type: 'boolean' },
    { key: 'codeOfConduct', label: 'Code of Conduct', type: 'textarea' },
  ],
  settlement: [
    { key: 'settlementType', label: 'Settlement Type', type: 'text' },
    { key: 'securityLevel', label: 'Security Level', type: 'text' },
    { key: 'codeOfConduct', label: 'Code of Conduct', type: 'textarea' },
    { key: 'dominantRaces', label: 'Dominant Races', type: 'text' },
    { key: 'culturalBehavior', label: 'Cultural Behavior', type: 'textarea' },
    { key: 'ownersOvertness', label: 'Owners Overtness', type: 'text' },
    { key: 'wealth', label: 'Wealth', type: 'text' },
    { key: 'specialism', label: 'Specialism', type: 'text' },
  ],
  landmark: [
    { key: 'landmarkType', label: 'Landmark Type', type: 'text' },
    { key: 'securityLevel', label: 'Security Level', type: 'text' },
    { key: 'codeOfConduct', label: 'Code of Conduct', type: 'textarea' },
    { key: 'heritageRaces', label: 'Heritage Races', type: 'text' },
    { key: 'stateOfFamiliarity', label: 'State of Familiarity', type: 'text' },
    { key: 'ownersOvertness', label: 'Owners Overtness', type: 'text' },
    { key: 'wealth', label: 'Wealth', type: 'text' },
    { key: 'specialism', label: 'Specialism', type: 'text' },
  ],
  shop: [
    { key: 'storeType', label: 'Store Type', type: 'text' },
    { key: 'itemAvailability', label: 'Item Availability', type: 'text' },
    { key: 'productQuality', label: 'Product Quality', type: 'text' },
    { key: 'exoticAvailability', label: 'Exotic Availability', type: 'text' },
    { key: 'ownersOvertness', label: 'Owners Overtness', type: 'text' },
    { key: 'hoursOfBusiness', label: 'Hours of Business', type: 'text' },
    { key: 'pricing', label: 'Pricing', type: 'text' },
    { key: 'specialism', label: 'Specialties', type: 'text' },
    { key: 'personnel', label: 'Personnel', type: 'textarea' },
    { key: 'shiftSchedule', label: 'Shift Schedule', type: 'text' },
  ],
  faction: [
    { key: 'factionType', label: 'Faction Type', type: 'text' },
    { key: 'shortDescription', label: 'Short Description', type: 'text' },
    { key: 'politicalInfluence', label: 'Political Influence', type: 'text' },
    { key: 'militaryPower', label: 'Military Power', type: 'text' },
    { key: 'covertPower', label: 'Covert Power', type: 'text' },
    { key: 'logisticalPower', label: 'Logistical Power', type: 'text' },
    { key: 'tradingPower', label: 'Trading Power', type: 'text' },
    { key: 'secrecyOfOperation', label: 'Secrecy of Operation', type: 'text' },
    { key: 'ownersOvertness', label: 'Owners Overtness', type: 'text' },
  ],
  country: [
    { key: 'countryType', label: 'Country Type', type: 'text' },
    { key: 'shortDescription', label: 'Short Description', type: 'text' },
    { key: 'heritage', label: 'Heritage', type: 'text' },
    { key: 'wealth', label: 'Economical Wealth', type: 'text' },
    { key: 'stability', label: 'Stability', type: 'text' },
    { key: 'politicalInfluence', label: 'Political Influence', type: 'text' },
    { key: 'militaryPower', label: 'Military Power', type: 'text' },
    { key: 'covertPower', label: 'Covert Power', type: 'text' },
    { key: 'logisticalPower', label: 'Logistical Power', type: 'text' },
    { key: 'tradingPower', label: 'Trading Power', type: 'text' },
    { key: 'culturalIdentity', label: 'Cultural Identity', type: 'textarea' },
    { key: 'leadershipControl', label: 'Leadership Control', type: 'text' },
  ],
  item: [
    { key: 'itemCategory', label: 'Item Category', type: 'select', options: ['Weapon', 'Potion', 'Equipment', 'Other'] },
    { key: 'damageDie', label: 'Damage Die', type: 'text' },
    { key: 'proficiencyRequirement', label: 'Proficiency Requirement', type: 'text' },
    { key: 'range', label: 'Range', type: 'text' },
    { key: 'statOfUse', label: 'Stat of Use (Dex, Str, etc)', type: 'text' },
    { key: 'specialProperties', label: 'Special Properties', type: 'textarea' },
    { key: 'attunement', label: 'Requires Attunement?', type: 'boolean' },
  ],
  note: [
    { key: 'sessionNumber', label: 'Session Number', type: 'text' },
    { key: 'inGameDate', label: 'In-Game Date', type: 'text' },
  ]
};
