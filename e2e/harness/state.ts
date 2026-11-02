import type { Campaign, Entity, User } from '../../src/types';
const q = new URLSearchParams(location.search);
export const AS_DM = q.get('as') === 'dm';
export const DM: User = { uid: 'dm1', displayName: 'Justus (DM)', email: 'x', createdAt: '' } as User;
export const P1: User = { uid: 'p1', displayName: 'Maja', email: 'x', createdAt: '' } as User;
export const P2: User = { uid: 'p2', displayName: 'Erik', email: 'x', createdAt: '' } as User;
export const ME = AS_DM ? DM : P1;
export const campaign: Campaign = { id: 'c1', name: 'The Sunken Vault', dmId: 'dm1', coDms: [], players: ['p1', 'p2'], joinCode: 'ABC123', houseRules: { edition: q.get('ed') === '2024' ? '2024' : '2014', ...(q.get('crits') ? { crits: q.get('crits') } : {}) } } as unknown as Campaign;
const listeners = new Set<() => void>();
export const onEntities = (f: () => void) => (listeners.add(f), () => listeners.delete(f));
const stats = (o: Record<string, unknown>) => ({ armorClass: '15', hitPoints: '38', speed: '30 ft', str: 10, dex: 14, con: 14, int: 12, wis: 10, cha: 10, skills: '', senses: '', languages: '', challenge: '', proficiencyBonus: '', ...o });
export let entities: Entity[] = [
  { id: 'vault', campaignId: 'c1', type: 'location', name: 'The Sunken Vault', content: '', tags: [], ownerId: 'dm1', isPublic: true, allowedPlayers: [], attributes: {}, mapConfig: { mediaId: 'm1', pins: [] } } as unknown as Entity,
  { id: 'lyra', campaignId: 'c1', type: 'character', name: 'Lyra Starwhisper', content: '', tags: [], playerId: 'p1', ownerId: 'p1', isPublic: true, allowedPlayers: [],
    attributes: { classLevel: 'Druid 5 (Circle of Stars)', currentHp: '24', tempHp: '',
      play: { attacks: [{ id: 'qs', name: 'Quarterstaff', ab: 'str', dice: '1d6', ty: 'bludgeoning', note: 'versatile 1d8' }], counters: [{ id: 'star', name: 'Star Map: Guiding Bolt', max: 3, per: 'pb', rest: 'long', spell: 'guiding-bolt' }],
        spells: { known: ['produce-flame', 'shillelagh', 'druidcraft'], prepared: ['cure-wounds', 'healing-word', 'thunderwave', 'entangle', 'moonbeam', 'flaming-sphere', 'call-lightning', 'lesser-restoration', 'faerie-fire'], always: ['guidance', 'guiding-bolt'] } } },
    dndStats: stats({ hitPoints: '38', wis: 18, proficiencyBonus: '+3' }) } as unknown as Entity,
  { id: 'nim', campaignId: 'c1', type: 'character', name: 'Nim', content: '', tags: [], playerId: q.get('nim') === '1' ? 'p1' : 'p2', ownerId: 'p1', isPublic: true, allowedPlayers: [],
    attributes: { classLevel: 'Warlock 5', currentHp: '30' }, dndStats: stats({ hitPoints: '33', cha: 18 }) } as unknown as Entity,
  { id: 'brom', campaignId: 'c1', type: 'character', name: 'Brom Ironfist', content: '', tags: [], playerId: 'p2', ownerId: 'p2', isPublic: true, allowedPlayers: [],
    attributes: { classLevel: 'Fighter 5', currentHp: '31', play: { attacks: [
      { id: 'ls', name: 'Longsword', ab: 'str', dice: '1d8', ty: 'slashing', note: 'versatile 1d10' },
      { id: 'hx', name: 'Handaxe (off-hand)', ab: 'str', dice: '1d6', ty: 'slashing', addMod: false, cost: 'bonus' }] } }, dndStats: stats({ hitPoints: '49', str: 17, con: 16 }) } as unknown as Entity,
  { id: 'goblin', campaignId: 'c1', type: 'monster', name: 'Goblin', content: '', tags: [], ownerId: 'dm1', isPublic: false, allowedPlayers: [], attributes: {},
    dndStats: stats({ armorClass: '15', hitPoints: '7', speed: '30 ft.', dex: 14 }),
    statBlock: `***Nimble Escape.*** The goblin can take the Disengage or Hide action as a bonus action on each of its turns.

### Actions

***Scimitar.*** Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.

***Shortbow.*** Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.` } as unknown as Entity,
  { id: 'boss', campaignId: 'c1', type: 'monster', name: 'Goblin Boss', content: '', tags: [], ownerId: 'dm1', isPublic: false, allowedPlayers: [], attributes: {},
    dndStats: stats({ armorClass: '17', hitPoints: '21', speed: '30 ft.', str: 10, dex: 14 }),
    statBlock: `**Saving Throws** Dex +4, Wis +2

### Actions

***Multiattack.*** The goblin boss makes two attacks with its scimitar.

***Scimitar.*** Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.

***Fire Spit (Recharge 5–6).*** The goblin boss spits fire in a 15-foot cone. Each creature in that area must make a DC 12 Dexterity saving throw, taking 10 (3d6) fire damage on a failed save, or half as much on a successful one.

### Legendary Actions

The goblin boss can take 2 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn.

**Taunt.** One creature within 30 feet must succeed on a DC 12 Wisdom save or have disadvantage on its next attack.

**Scimitar (Costs 2 Actions).** The goblin boss makes a scimitar attack.` } as unknown as Entity,
];
export function patchEntity(id: string, patch: Record<string, unknown>) {
  entities = entities.map((e) => {
    if (e.id !== id) return e;
    const next = structuredClone(e) as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      const path = k.split('.'); let o = next as Record<string, unknown>;
      for (const p of path.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
      o[path[path.length - 1]] = v;
    }
    return next as unknown as Entity;
  });
  listeners.forEach((f) => f());
}
