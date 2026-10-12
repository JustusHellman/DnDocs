/**
 * Battle maps in Firestore. Kept apart from the campaign-wide listeners: nothing here is read
 * unless someone has a battle map open (apart from the tiny "is a battle running?" query).
 *
 *   scenes/{entityId}                 grid, fog, walls & doors, initiative (one small doc)
 *   scenes/{id}/tokens/{tokenId}      one doc per token, written when it's dropped
 *   scenes/{id}/drawings/{id}         one doc per finished stroke
 *   scenes/{id}/live/{uid}            each person's latest ping / shared measurement (overwritten)
 *   scenes/{id}/secret/dm             monster HP, DM only
 */
import { arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { syncStamp } from '../sync';
import { db } from '../../firebase';
import type { Drawing, Entity, LiveMark, Scene, SceneGrid, Token, User } from '../../types';
import { compressImage, forgetMedia, isMediaRef, mediaIdOf, primeMediaCache } from '../media';
import { DEFAULT_GRID, encodeNums, healthOf, type UvttImport } from './geometry';

const nowIso = () => new Date().toISOString();

export const sceneDoc = (sceneId: string) => doc(db, 'scenes', sceneId);
export const tokensCol = (sceneId: string) => collection(db, 'scenes', sceneId, 'tokens');
export const drawingsCol = (sceneId: string) => collection(db, 'scenes', sceneId, 'drawings');
export const liveCol = (sceneId: string) => collection(db, 'scenes', sceneId, 'live');
export const secretDoc = (sceneId: string) => doc(db, 'scenes', sceneId, 'secret', 'dm');

/** Firestore rejects `undefined`. */
function clean<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

export function newScene(entity: Pick<Entity, 'id' | 'campaignId' | 'name' | 'mapConfig'>, grid: Partial<SceneGrid> = {}): Scene {
  const now = nowIso();
  const scene: Scene = {
    id: entity.id,
    campaignId: entity.campaignId,
    entityId: entity.id,
    name: entity.name,
    mediaId: entity.mapConfig?.mediaId,
    active: false,
    grid: { ...DEFAULT_GRID, ...grid },
    fog: { mode: 'off', revealed: '', cols: 0, rows: 0 },
    walls: '',
    doors: '',
    openDoors: [],
    combat: { active: false, round: 0, turn: null },
    createdAt: now,
    updatedAt: now,
  };
  if (!scene.mediaId) delete scene.mediaId; // Firestore rejects undefined
  return scene;
}

export function createScene(scene: Scene) {
  return setDoc(sceneDoc(scene.id), scene);
}

export function updateScene(sceneId: string, data: Record<string, unknown>) {
  return updateDoc(sceneDoc(sceneId), { ...data, updatedAt: nowIso() });
}

/** Players may only open/close doors and pass the turn on; this touches nothing else. */
export function setOpenDoors(sceneId: string, openDoors: number[]) {
  return updateDoc(sceneDoc(sceneId), { openDoors, updatedAt: nowIso() });
}

export function setCombat(sceneId: string, combat: Scene['combat']) {
  return updateDoc(sceneDoc(sceneId), { combat, updatedAt: nowIso() });
}

/** Pass the turn on (players: only from their own token's turn; the rules check that). */
export function setTurn(sceneId: string, turn: string | null, round: number) {
  return updateDoc(sceneDoc(sceneId), { 'combat.turn': turn, 'combat.round': round, updatedAt: nowIso() });
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export type NewToken = Omit<Token, 'id' | 'updatedAt'>;

export async function addTokens(sceneId: string, tokens: NewToken[], hp?: Record<number, { cur: number; max: number }>) {
  const batch = writeBatch(db);
  const ids: string[] = [];
  const secret: Record<string, { cur: number; max: number }> = {};
  tokens.forEach((t, i) => {
    const ref = doc(tokensCol(sceneId));
    ids.push(ref.id);
    const h = hp?.[i];
    batch.set(ref, clean({ ...t, id: ref.id, health: h ? healthOf(h.cur, h.max) : t.health, updatedAt: nowIso() }));
    if (h) secret[ref.id] = h;
  });
  if (Object.keys(secret).length) batch.set(secretDoc(sceneId), { campaignId: tokens[0].campaignId, hp: secret }, { merge: true });
  await batch.commit();
  return ids;
}

export function moveToken(sceneId: string, tokenId: string, x: number, y: number) {
  return updateDoc(doc(tokensCol(sceneId), tokenId), { x, y, updatedAt: nowIso() });
}

export function updateToken(sceneId: string, tokenId: string, data: Partial<Omit<Token, 'id' | 'campaignId'>>) {
  return updateDoc(doc(tokensCol(sceneId), tokenId), clean({ ...data, updatedAt: nowIso() }));
}

/**
 * Field-level token change (e.g. `{ conditions: arrayUnion('Prone'), 'timers.Prone': … }`), so
 * people editing the same token at once don't overwrite each other. No `undefined` values.
 */
export function patchToken(sceneId: string, tokenId: string, data: Record<string, unknown>) {
  return updateDoc(doc(tokensCol(sceneId), tokenId), { ...data, updatedAt: nowIso() });
}

/** Open or close one door (leaves the others as they are, whoever changed them). */
export function setDoorOpen(sceneId: string, index: number, open: boolean) {
  return updateDoc(sceneDoc(sceneId), { openDoors: open ? arrayUnion(index) : arrayRemove(index), updatedAt: nowIso() });
}

/** Initiative for many tokens at once (one write). */
export async function setInitiatives(sceneId: string, values: Record<string, number | null>) {
  const batch = writeBatch(db);
  const now = nowIso();
  // A new roll drops any tie order the DM gave the old one.
  for (const [id, initiative] of Object.entries(values)) batch.update(doc(tokensCol(sceneId), id), { initiative, initTie: null, updatedAt: now });
  await batch.commit();
}

/** The DM's own order: rolls and tie order for the tokens whose place changes (one write). */
export async function setInitiativeOrder(sceneId: string, places: Record<string, { initiative: number; initTie: number | null }>) {
  const batch = writeBatch(db);
  const now = nowIso();
  for (const [id, p] of Object.entries(places)) batch.update(doc(tokensCol(sceneId), id), { initiative: p.initiative, initTie: p.initTie, updatedAt: now });
  await batch.commit();
}

export async function deleteToken(sceneId: string, tokenId: string, isDM: boolean) {
  await deleteDoc(doc(tokensCol(sceneId), tokenId));
  if (isDM) {
    // Drop its HP from the DM's record.
    await updateDoc(secretDoc(sceneId), { [`hp.${tokenId}`]: deleteField() }).catch(() => undefined);
  }
}

/** A monster's HP: exact numbers in the DM's secret doc, a word ("bloodied") on the token. */
export async function setTokenHp(sceneId: string, campaignId: string, tokenId: string, hp: { cur: number; max: number }, previous: Token['health']) {
  await setDoc(secretDoc(sceneId), { campaignId, hp: { [tokenId]: hp } }, { merge: true });
  const health = healthOf(hp.cur, hp.max);
  if (health !== previous) await updateToken(sceneId, tokenId, { health });
}

/** Every token on the map (and the DM's HP notes for them). */
export async function clearTokens(sceneId: string, campaignId: string) {
  const snap = await getDocs(query(tokensCol(sceneId), where('campaignId', '==', campaignId)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(secretDoc(sceneId)).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Drawings and live marks
// ---------------------------------------------------------------------------

/** The drawing (with its id) right away, so the screen and undo don't wait for the server. */
export function addDrawing(sceneId: string, d: Omit<Drawing, 'id' | 'createdAt'>): { drawing: Drawing; saved: Promise<void> } {
  const ref = doc(drawingsCol(sceneId));
  const drawing = clean({ ...d, id: ref.id, createdAt: nowIso() }) as Drawing;
  return { drawing, saved: setDoc(ref, drawing) };
}

/** Put a drawing back exactly as it was (undo of an erase). */
export function restoreDrawing(sceneId: string, d: Drawing) {
  return setDoc(doc(drawingsCol(sceneId), d.id), d);
}

/** Put a removed token back (undo), with its HP if the DM had it. */
export async function restoreToken(sceneId: string, t: Token, hp?: { cur: number; max: number }) {
  const batch = writeBatch(db);
  batch.set(doc(tokensCol(sceneId), t.id), { ...t, updatedAt: nowIso() });
  if (hp) batch.set(secretDoc(sceneId), { campaignId: t.campaignId, hp: { [t.id]: hp } }, { merge: true });
  await batch.commit();
}

/** The DM shows one of their drawings to the players (or hides it again). */
export function shareDrawing(sceneId: string, id: string, shared: boolean) {
  return updateDoc(doc(drawingsCol(sceneId), id), { shared });
}

/** Creatures the party has now seen (or that just took a turn): they join the players' initiative list. */
export async function markKnown(sceneId: string, ids: string[]) {
  if (!ids.length) return;
  const batch = writeBatch(db);
  for (const id of ids) batch.update(doc(tokensCol(sceneId), id), { known: true });
  await batch.commit();
}

export function deleteDrawing(sceneId: string, id: string) {
  return deleteDoc(doc(drawingsCol(sceneId), id));
}

export async function clearDrawings(sceneId: string, campaignId: string) {
  const snap = await getDocs(query(drawingsCol(sceneId), where('campaignId', '==', campaignId)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/**
 * Two docs per person (latest ping, latest measurement), overwritten: storage never grows however
 * often someone pings.
 */
export function sendLiveMark(sceneId: string, user: Pick<User, 'uid' | 'displayName'>, campaignId: string, mark: Pick<LiveMark, 'kind' | 'x' | 'y' | 'x2' | 'y2' | 'label' | 'pts'>) {
  const id = mark.kind === 'ping' ? user.uid : `${user.uid}-m`;
  const data: LiveMark = clean({ ...mark, id, campaignId, name: user.displayName, at: Date.now() });
  return setDoc(doc(liveCol(sceneId), id), data);
}

// ---------------------------------------------------------------------------
// Removing a battle map (with its tokens, drawings and marks)
// ---------------------------------------------------------------------------

export async function deleteScene(sceneId: string, campaignId: string) {
  const byCampaign = where('campaignId', '==', campaignId);
  const [tokens, drawings, live] = await Promise.all([
    getDocs(query(tokensCol(sceneId), byCampaign)),
    getDocs(query(drawingsCol(sceneId), byCampaign)),
    getDocs(query(liveCol(sceneId), byCampaign)),
  ]);
  const refs = [...tokens.docs, ...drawings.docs, ...live.docs].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  await deleteDoc(secretDoc(sceneId)).catch(() => undefined);
  await deleteDoc(doc(db, 'scenes', sceneId, 'secret', 'forge')).catch(() => undefined);
  await deleteDoc(sceneDoc(sceneId));
}

/** The DM's list of battle maps (one read per map, on demand). */
export async function listScenes(campaignId: string): Promise<Scene[]> {
  const snap = await getDocs(query(collection(db, 'scenes'), where('campaignId', '==', campaignId)));
  return snap.docs.map((d) => d.data() as Scene);
}

/** Every battle map of a campaign (used when the campaign is deleted). */
export async function deleteCampaignScenes(campaignId: string) {
  const snap = await getDocs(query(collection(db, 'scenes'), where('campaignId', '==', campaignId)));
  for (const d of snap.docs) await deleteScene(d.id, campaignId);
  return snap.size;
}

// ---------------------------------------------------------------------------
// .dd2vtt import: the image becomes the entry's map, walls and doors go on the scene.
// ---------------------------------------------------------------------------

export async function importUvttMap(entity: Entity, uvtt: UvttImport, user: Pick<User, 'uid'>): Promise<{ mediaId: string; grid: Partial<SceneGrid>; walls: string; doors: string }> {
  // The same pipeline as every other map: WebP, at most 2400 px, shrunk until it fits one document.
  const data = await compressImage(uvtt.image, 2400);
  const ref = doc(collection(db, 'media'));
  const now = nowIso();
  const batch = writeBatch(db);
  batch.set(ref, { id: ref.id, entityId: entity.id, campaignId: entity.campaignId, data, mimeType: data.slice(5, data.indexOf(';')), ownerId: user.uid, createdAt: now });
  batch.update(doc(db, 'entities', entity.id), { mapConfig: { mediaId: ref.id, pins: entity.mapConfig?.pins ?? [] }, updatedAt: now, ...syncStamp() });
  await batch.commit();
  primeMediaCache(ref.id, data);
  // The previous map image, unless it is also in the gallery.
  const old = entity.mapConfig?.mediaId;
  if (old && !(entity.imageUrls ?? []).some((u) => isMediaRef(u) && mediaIdOf(u) === old)) {
    forgetMedia(old);
    await deleteDoc(doc(db, 'media', old)).catch(() => undefined);
  }
  return { mediaId: ref.id, grid: { cols: uvtt.cols, ox: 0, oy: 0 }, walls: encodeNums(uvtt.walls), doors: encodeNums(uvtt.doors) };
}

