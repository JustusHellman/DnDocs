import { patchEntity } from './state';
export async function setPlayDef(id: string, def: Record<string, unknown>) { patchEntity(id, { 'attributes.play': def }); }
export async function updateCharacterHp(id: string, hp: { currentHp: string; tempHp: string; deathSaves?: string }) {
  patchEntity(id, { 'attributes.currentHp': hp.currentHp, 'attributes.tempHp': hp.tempHp, ...(hp.deathSaves !== undefined ? { 'attributes.deathSaves': hp.deathSaves } : {}) });
}
export const EMPTY_STATS = {} as never;
export const defaultAttributes = () => ({}) as never;
export const explicitShare = () => ({}) as never;
export async function setCoverFraming(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function setHouseRules(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function removePlayer(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function renameCampaign(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function setCoDm(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function updateProfile(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function applySharingUpdate(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function backfillCoverThumb(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function createCampaign(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function createRelationshipPair(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function deleteEntity(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function deleteRelationshipPair(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function fetchMyCampaigns(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function fetchUsers(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function joinCampaignByCode(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function quickCreateEntity(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function registerJoinCode(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function revealEntity(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function saveEntity(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function setEntityLocation(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function updateMapPins(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function updateTypeConfig(..._a: unknown[]): Promise<never> { return undefined as never; }
export async function levelUpCharacter(id: string, next: { classLevel: string; maxHp: string; currentHp: string; play?: Record<string, unknown> }) {
  patchEntity(id, { 'attributes.classLevel': next.classLevel, 'attributes.currentHp': next.currentHp, 'dndStats.hitPoints': next.maxHp, ...(next.play ? { 'attributes.play': next.play } : {}) });
}
