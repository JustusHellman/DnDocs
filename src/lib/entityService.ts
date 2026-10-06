import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Campaign, DndStats, Entity, EntityType, MapPin, MediaDoc, Relationship, RevealEvent, TypeConfig, User } from '../types';
import { derivedPlayers, explicitShare, planReveal, toV3, type RevealAudience } from './sharing';
import { baseType, fieldsFor, isEntityType, normalizeEntity, permissionKeys, storageType } from './entityTypes';
import { isMediaRef, MEDIA_PREFIX, mediaIdOf, primeMediaCache, forgetMedia, makeThumbnail, resolveImageSrc } from './media';

const nowIso = () => new Date().toISOString();

/** Firestore rejects `undefined`, so strip it recursively from plain objects. */
function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = clean(v);
    return out as T;
  }
  return value;
}

export const EMPTY_STATS: DndStats = {
  armorClass: '',
  hitPoints: '',
  speed: '',
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  skills: '',
  senses: '',
  languages: '',
  challenge: '',
  proficiencyBonus: '',
};

export function defaultAttributes(type: EntityType): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const f of fieldsFor(type)) if (f.defaultValue !== undefined) attrs[f.key] = f.defaultValue;
  if (type === 'note') attrs.date = new Date().toISOString().split('T')[0];
  return attrs;
}

// ---------------------------------------------------------------------------
// Saving entities
// ---------------------------------------------------------------------------

export interface EntityDraft extends Omit<Entity, 'id' | 'campaignId' | 'ownerId' | 'createdAt' | 'updatedAt'> {
  id?: string;
  ownerId?: string;
  createdAt?: string;
  /** Which image (any imageUrls entry, or a `media:` ref / url / data url) is used as the interactive map. */
  mapImage: string | null;
}

export interface PendingRelationship {
  targetId: string;
  targetName: string;
  /** What the target is to this entity ("Target is my …") */
  label: string;
  /** What this entity is to the target ("I am target's …") */
  reverseLabel: string;
}

interface SaveContext {
  campaign: Campaign;
  user: User;
  isDM: boolean;
  players: User[];
  previous: Entity | null;
  pendingRelationships?: PendingRelationship[];
}

export { derivedPlayers, explicitShare } from './sharing';

function computeAllowedPlayers(draft: EntityDraft, isDM: boolean, players: User[]): string[] {
  const explicit = draft.allowedPlayers ?? [];
  if (!isDM) return [...new Set(explicit)];
  return [...new Set([...explicit, ...derivedPlayers(draft, explicit, players)])];
}

export async function saveEntity(draft: EntityDraft, ctx: SaveContext): Promise<Entity> {
  const { campaign, user, isDM, players, previous } = ctx;
  if (!isDM && draft.type !== 'note') throw new Error('Only DMs can create or edit entities other than notes.');
  if (previous && previous.type === 'note' && previous.ownerId !== user.uid) throw new Error('Only the author of a note can edit it.');

  // Random ids: no lookups needed to avoid collisions (old slug ids keep working).
  const id = previous?.id ?? newEntityId();
  const now = nowIso();
  const batch = writeBatch(db);

  // 1. Upload new images (data: urls) to the media collection.
  const uploaded = new Map<string, string>(); // data url -> media ref
  const upload = (data: string) => {
    const existing = uploaded.get(data);
    if (existing) return existing;
    const ref = doc(collection(db, 'media'));
    const media: MediaDoc = {
      id: ref.id,
      entityId: id,
      campaignId: campaign.id,
      data,
      mimeType: data.slice(5, data.indexOf(';')) || 'image/jpeg',
      ownerId: user.uid,
      createdAt: now,
    };
    batch.set(ref, media);
    primeMediaCache(ref.id, data);
    const mediaRef = `${MEDIA_PREFIX}${ref.id}`;
    uploaded.set(data, mediaRef);
    return mediaRef;
  };

  const imageUrls = (draft.imageUrls ?? []).map((url) => (url.startsWith('data:') ? upload(url) : url));

  // 2. Resolve the map image to a media id.
  let mapConfig: Entity['mapConfig'] = null;
  if (draft.mapImage) {
    let mediaId: string;
    if (isMediaRef(draft.mapImage)) mediaId = mediaIdOf(draft.mapImage);
    else if (draft.mapImage.startsWith('data:')) mediaId = mediaIdOf(upload(draft.mapImage));
    else {
      // External URL: store it in a media doc so the map pipeline stays uniform.
      const ref = doc(collection(db, 'media'));
      batch.set(ref, {
        id: ref.id,
        entityId: id,
        campaignId: campaign.id,
        data: draft.mapImage,
        mimeType: 'text/uri-list',
        ownerId: user.uid,
        createdAt: now,
      } satisfies MediaDoc);
      mediaId = ref.id;
    }
    mapConfig = { mediaId, pins: previous?.mapConfig?.pins ?? draft.mapConfig?.pins ?? [] };
  }

  // 3. Clean up media no longer referenced (best effort, after the main write).
  const mediaToDelete: string[] = [];
  if (previous) {
    const stillUsed = new Set(imageUrls.filter(isMediaRef).map(mediaIdOf));
    if (mapConfig) stillUsed.add(mapConfig.mediaId);
    const oldIds = new Set((previous.imageUrls ?? []).filter(isMediaRef).map(mediaIdOf));
    if (previous.mapConfig?.mediaId) oldIds.add(previous.mapConfig.mediaId);
    for (const oldId of oldIds) if (!stillUsed.has(oldId)) mediaToDelete.push(oldId);
  }

  // Reveal log: note who newly got access through this save.
  const sharedWith = isDM ? [...new Set(draft.allowedPlayers ?? [])] : previous?.sharedWith;
  const reveals = [...(previous?.reveals ?? [])];
  if (isDM && draft.type !== 'note') {
    const before = previous ? (previous.isPublic ? ['*'] : toV3(previous).sharedWith ?? []) : [];
    if (draft.isPublic && !before.includes('*')) reveals.push({ at: Date.now(), to: ['*'] });
    else if (!draft.isPublic) {
      const added = (sharedWith ?? []).filter((u) => !before.includes(u));
      if (added.length && !before.includes('*')) reveals.push({ at: Date.now(), to: added });
    }
  }

  const coverThumb = await coverThumbFor(imageUrls[0], draft.imageUrls?.[0], previous);

  const entity: Entity = clean({
    id,
    campaignId: campaign.id,
    ...keepCustomType(storageType(draft.type), draft.type, previous),
    name: draft.name.trim() || 'Untitled',
    content: draft.content ?? '',
    tags: draft.tags ?? [],
    ownerId: previous?.ownerId ?? user.uid,
    isPublic: !!draft.isPublic,
    allowedPlayers: computeAllowedPlayers(draft, isDM, players),
    sharedWith,
    shareV: isDM && draft.type !== 'note' ? 3 : previous?.shareV,
    reveals: reveals.length ? reveals.slice(-50) : undefined,
    playerKnowledge: draft.playerKnowledge ?? {},
    fieldPermissions: draft.fieldPermissions ?? {},
    locationId: draft.locationId || null,
    gender: baseType(draft.type) === 'npc' ? draft.gender || null : previous?.gender ?? null,
    imageUrls,
    coverThumb,
    attributes: draft.attributes ?? {},
    mapConfig,
    statBlock: draft.statBlock || null,
    dndStats: draft.dndStats ?? null,
    dmNotes: draft.dmNotes || null,
    lastPushedAt: previous?.lastPushedAt,
    lastPushedTo: previous?.lastPushedTo,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  });

  batch.set(doc(db, 'entities', id), entity);

  // 4. Relationships queued while creating/editing.
  for (const rel of ctx.pendingRelationships ?? []) {
    addRelationshipPairToBatch(batch, campaign.id, { id, name: entity.name }, rel);
  }

  await batch.commit();
  await deleteMediaQuietly(mediaToDelete);
  return normalizeEntity(entity);
}

/** One-off: give an older entry (saved before previews existed) its inline preview. */
export async function backfillCoverThumb(entity: Entity) {
  const coverThumb = await coverThumbFor(entity.imageUrls?.[0], undefined);
  await updateDoc(doc(db, 'entities', entity.id), { coverThumb });
}

/** An entry whose custom type was deleted shows as its base type; saving it keeps the link. */
function keepCustomType(st: ReturnType<typeof storageType>, type: string, previous: Entity | null) {
  if (!st.customType && previous?.customType && previous.type === type && !isEntityType(previous.customType)) return { ...st, customType: previous.customType };
  return st;
}

export function newEntityId() {
  return doc(collection(db, 'entities')).id;
}

/** Keeps the inline preview in sync with the first image (and backfills it for older entries). */
async function coverThumbFor(first: string | undefined, original: string | undefined, previous?: Entity): Promise<string | null> {
  if (!first) return null;
  if (previous?.coverThumb && previous.imageUrls?.[0] === first) return previous.coverThumb;
  try {
    const src = original?.startsWith('data:') ? original : await resolveImageSrc(first);
    return src ? await makeThumbnail(src) : null;
  } catch {
    return null; // e.g. an external image that doesn't allow canvas use
  }
}

async function deleteMediaQuietly(ids: Iterable<string>) {
  await Promise.allSettled(
    [...ids].map((m) => {
      forgetMedia(m);
      return deleteDoc(doc(db, 'media', m));
    }),
  );
}

// ---------------------------------------------------------------------------
// Quick create / generators
// ---------------------------------------------------------------------------

interface QuickCreateOptions {
  campaign: Campaign;
  user: User;
  name: string;
  type: EntityType;
  locationId?: string | null;
  content?: string;
  tags?: string[];
  attributes?: Record<string, unknown>;
}

export async function quickCreateEntity(opts: QuickCreateOptions): Promise<Entity> {
  const id = newEntityId();
  const now = nowIso();
  const entity: Entity = clean({
    id,
    campaignId: opts.campaign.id,
    ...storageType(opts.type),
    name: opts.name.trim(),
    content: opts.content ?? '',
    tags: opts.tags ?? [],
    ownerId: opts.user.uid,
    isPublic: false,
    // Player-authored notes are visible to the DM by default; DM-created entities start secret.
    allowedPlayers: opts.type === 'note' && opts.user.uid !== opts.campaign.dmId ? [opts.campaign.dmId] : [],
    playerKnowledge: {},
    fieldPermissions: {},
    shareV: opts.type !== 'note' ? 3 : undefined,
    locationId: opts.locationId || null,
    gender: null,
    imageUrls: [],
    attributes: { ...defaultAttributes(opts.type), ...(opts.attributes ?? {}) },
    createdAt: now,
    updatedAt: now,
  });
  await setDoc(doc(db, 'entities', id), entity);
  return normalizeEntity(entity);
}

// ---------------------------------------------------------------------------
// Deleting
// ---------------------------------------------------------------------------

export async function deleteEntity(entity: Entity, opts: { isDM: boolean; children: Entity[] }) {
  const batch = writeBatch(db);

  const mediaIds = new Set((entity.imageUrls ?? []).filter(isMediaRef).map(mediaIdOf));
  if (entity.mapConfig?.mediaId) mediaIds.add(entity.mapConfig.mediaId);

  if (opts.isDM) {
    // Remove both directions of every relationship touching this entity.
    const rels = collection(db, 'relationships');
    const [outgoing, incoming] = await Promise.all([
      getDocs(query(rels, where('campaignId', '==', entity.campaignId), where('sourceId', '==', entity.id))),
      getDocs(query(rels, where('campaignId', '==', entity.campaignId), where('targetId', '==', entity.id))),
    ]);
    [...outgoing.docs, ...incoming.docs].forEach((d) => batch.delete(d.ref));

    // Things located here move up one level instead of becoming orphans.
    for (const child of opts.children) {
      batch.update(doc(db, 'entities', child.id), { locationId: entity.locationId ?? null, updatedAt: nowIso() });
    }
  }

  batch.delete(doc(db, 'entities', entity.id));
  await batch.commit();
  await deleteMediaQuietly(mediaIds);
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

/** One document per relationship, readable from both ends (older campaigns stored two mirrored docs). */
function addRelationshipPairToBatch(
  batch: ReturnType<typeof writeBatch>,
  campaignId: string,
  source: { id: string; name: string },
  rel: PendingRelationship,
) {
  const ref = doc(collection(db, 'relationships'));
  const label = rel.label.trim();
  const record: Relationship = {
    id: ref.id,
    campaignId,
    sourceId: source.id,
    targetId: rel.targetId,
    targetName: rel.targetName,
    label,
    reverseLabel: (rel.reverseLabel || label).trim(),
    reverseId: '',
    v: 2,
    createdAt: nowIso(),
  };
  batch.set(ref, record);
}

export async function createRelationshipPair(campaignId: string, source: { id: string; name: string }, rel: PendingRelationship) {
  const batch = writeBatch(db);
  addRelationshipPairToBatch(batch, campaignId, source, rel);
  await batch.commit();
}

export async function deleteRelationshipPair(rel: Relationship) {
  await deleteDoc(doc(db, 'relationships', rel.id));
  // The reverse half may already be gone (rules reject deleting a missing doc) – ignore that.
  if (rel.reverseId) await deleteDoc(doc(db, 'relationships', rel.reverseId)).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Misc entity updates
// ---------------------------------------------------------------------------

/**
 * The DM's "Reveal": gives the audience access to the entry, shows exactly the chosen fields and,
 * optionally, pops it up on their screens. Logged for the Chronicle.
 */
export async function revealEntity(entity: Entity, opts: RevealAudience & { fields: Iterable<string>; show: boolean; allPlayers: User[] }) {
  const now = Date.now();
  const plan = planReveal(entity, opts, opts.fields, opts.allPlayers, now);
  const update: Record<string, unknown> = { ...plan.update };
  if (opts.show) {
    if (!plan.newAccess.length && !plan.newFields.length) {
      update.reveals = [...(entity.reveals ?? []), { at: now, to: opts.everyone ? ['*'] : opts.players, showOnly: true }].slice(-50);
    }
    update.lastPushedAt = now;
    update.lastPushedTo = opts.everyone ? [] : opts.players;
  }
  await updateDoc(doc(db, 'entities', entity.id), clean(update));
  return plan;
}

/** Write a plan made by the sharing helpers (e.g. the per-field switch on an entry). */
export function applySharingUpdate(entityId: string, update: Partial<Entity>) {
  return updateDoc(doc(db, 'entities', entityId), clean(update) as Record<string, unknown>);
}

export function updateMapPins(entityId: string, pins: MapPin[]) {
  return updateDoc(doc(db, 'entities', entityId), { 'mapConfig.pins': pins });
}

export function setEntityLocation(entityId: string, locationId: string | null) {
  return updateDoc(doc(db, 'entities', entityId), { locationId, updatedAt: nowIso() });
}

// ---------------------------------------------------------------------------
// Campaigns & members
// ---------------------------------------------------------------------------

function makeJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export async function createCampaign(name: string, user: User): Promise<Campaign> {
  const campaign: Campaign = {
    id: crypto.randomUUID(),
    name: name.trim(),
    dmId: user.uid,
    players: [],
    joinCode: makeJoinCode(),
    createdAt: nowIso(),
  };
  await setDoc(doc(db, 'campaigns', campaign.id), campaign);
  await registerJoinCode(campaign);
  return campaign;
}

/**
 * `joinCodes/{code}` lets players find a campaign by code without being able to list every
 * campaign. Works only once the suggested firestore.rules are deployed; failures are harmless.
 */
export async function registerJoinCode(campaign: Campaign) {
  try {
    await setDoc(doc(db, 'joinCodes', campaign.joinCode), { campaignId: campaign.id, dmId: campaign.dmId });
  } catch {
    /* old rules – ignore */
  }
}

export async function joinCampaignByCode(rawCode: string, user: User): Promise<Campaign> {
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, '');
  if (!code) throw new Error('Enter a join code.');

  let campaignId: string | null = null;
  try {
    const snap = await getDoc(doc(db, 'joinCodes', code));
    if (snap.exists()) campaignId = snap.data().campaignId;
  } catch {
    /* rules not deployed yet – fall back to a query below */
  }

  if (!campaignId) {
    const notFound = 'No campaign found with that code. If the code is right, ask your DM to open the campaign once and try again.';
    const snap = await getDocs(query(collection(db, 'campaigns'), where('joinCode', '==', code))).catch((err) => {
      if (err?.code === 'permission-denied') throw new Error(notFound);
      throw err;
    });
    if (snap.empty) throw new Error(notFound);
    campaignId = snap.docs[0].id;
  }

  const ref = doc(db, 'campaigns', campaignId);
  // Adding yourself is allowed before you can read the campaign.
  try {
    await updateDoc(ref, { players: arrayUnion(user.uid) });
  } catch (err: any) {
    // Already a member (DM or player) → the update is rejected by rules but reading works.
    if (err?.code !== 'permission-denied') throw err;
  }
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('That campaign no longer exists.');
  return snap.data() as Campaign;
}

export async function fetchMyCampaigns(uid: string): Promise<Campaign[]> {
  const col = collection(db, 'campaigns');
  const results = await Promise.allSettled([
    getDocs(query(col, where('dmId', '==', uid))),
    getDocs(query(col, where('players', 'array-contains', uid))),
    getDocs(query(col, where('coDms', 'array-contains', uid))),
  ]);
  const map = new Map<string, Campaign>();
  for (const r of results) if (r.status === 'fulfilled') r.value.docs.forEach((d) => map.set(d.id, d.data() as Campaign));
  if (results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchUsers(uids: string[]): Promise<User[]> {
  const unique = [...new Set(uids.filter(Boolean))];
  const snaps = await Promise.all(unique.map((uid) => getDoc(doc(db, 'users', uid)).catch(() => null)));
  return snaps.filter((s): s is NonNullable<typeof s> => !!s && s.exists()).map((s) => s.data() as User);
}

export function setCoDm(campaignId: string, uid: string, makeCoDm: boolean) {
  return updateDoc(doc(db, 'campaigns', campaignId), { coDms: makeCoDm ? arrayUnion(uid) : arrayRemove(uid) });
}

export function removePlayer(campaignId: string, uid: string) {
  return updateDoc(doc(db, 'campaigns', campaignId), { players: arrayRemove(uid), coDms: arrayRemove(uid) });
}

export function updateTypeConfig(campaignId: string, typeConfig: TypeConfig) {
  return updateDoc(doc(db, 'campaigns', campaignId), { typeConfig: clean(typeConfig) });
}

export function renameCampaign(campaignId: string, name: string) {
  return updateDoc(doc(db, 'campaigns', campaignId), { name: name.trim() });
}

export function updateProfile(uid: string, data: Partial<Pick<User, 'displayName' | 'photoURL'>>) {
  return updateDoc(doc(db, 'users', uid), clean(data));
}

