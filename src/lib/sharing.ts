/**
 * Who sees what. Pure functions (no Firebase) shared by the editor, the Reveal panel and the
 * per-field switches on an entry.
 *
 * Model (shareV 3): an entry is seen by everyone (`isPublic`) or by the players in `sharedWith`;
 * each field is hidden until revealed. A field setting `{ isPublic: true }` means "everyone who
 * can see the entry", `allowedPlayers` names specific players (so one player can know a secret
 * the others don't).
 */
import type { Entity, FieldPermission, RevealEvent, User } from '../types';
import { defaultRevealed, fieldsFor, permissionKeys } from './entityTypes';

type Perms = Record<string, FieldPermission>;
const LOCKED: FieldPermission = { isPublic: false, allowedPlayers: [] };

/**
 * Players that get read access *because of* field permissions or player knowledge.
 * Current entries (shareV 2+) only derive access from "what you know" notes: revealing a field
 * never makes a secret entry findable. Older entries keep their old behaviour.
 */
export function derivedPlayers(
  entity: Pick<Entity, 'isPublic' | 'playerKnowledge' | 'fieldPermissions' | 'shareV'>,
  explicit: string[],
  players: User[],
): Set<string> {
  const out = new Set<string>();
  for (const [uid, text] of Object.entries(entity.playerKnowledge ?? {})) if (text?.trim()) out.add(uid);
  if (entity.shareV) return out;
  for (const perm of Object.values(entity.fieldPermissions ?? {})) {
    if (perm.isPublic) {
      if (!entity.isPublic && explicit.length === 0) players.forEach((p) => out.add(p.uid));
    } else perm.allowedPlayers?.forEach((p) => out.add(p));
  }
  return out;
}

/** The DM's explicit selection for an existing entry (older entries didn't store it separately). */
export function explicitShare(entity: Entity, players: User[]): string[] {
  if (entity.sharedWith) return entity.sharedWith;
  const derived = derivedPlayers({ ...entity, isPublic: true, shareV: undefined }, [], players); // knowledge + specific fields only
  const rest = (entity.allowedPlayers ?? []).filter((p) => !derived.has(p));
  // Old "secret + public field" entries had every player added; that wasn't an explicit choice.
  const hasPublicField = Object.values(entity.fieldPermissions ?? {}).some((p) => p.isPublic);
  if (!entity.isPublic && hasPublicField && players.every((p) => rest.includes(p.uid))) return [];
  return rest;
}

/** Field keys of an entry that can carry a setting (its type's fields plus any stored leftovers). */
export function lockableKeys(entity: Pick<Entity, 'type' | 'attributes'>): string[] {
  return [...new Set([...permissionKeys(entity.type), ...Object.keys(entity.attributes ?? {})])];
}

/**
 * The entry in the current model (shareV 3), seen exactly as before by every player:
 *  - everyone who can open it now is in `sharedWith` (older entries also let players in through
 *    field settings or "what you know" notes, and those players saw fields shown to "everyone");
 *  - every field gets an explicit setting, so "no setting" can safely mean hidden.
 */
export function toV3(entity: Entity): Entity {
  if (entity.shareV === 3) return { ...entity, sharedWith: entity.sharedWith ?? [], fieldPermissions: { ...(entity.fieldPermissions ?? {}) } };
  const openers = entity.isPublic ? entity.sharedWith ?? [] : [...new Set(entity.allowedPlayers ?? [])];
  const out: Perms = {};
  const old = entity.fieldPermissions ?? {};
  const schema = new Set(permissionKeys(entity.type));
  for (const k of lockableKeys(entity)) {
    const p = old[k];
    if (p) out[k] = { isPublic: !!p.isPublic, allowedPlayers: [...(p.allowedPlayers ?? [])] };
    // Leftover values outside the type's fields are never shown to players.
    else if (!schema.has(k)) out[k] = { ...LOCKED };
    else if (entity.isPublic) out[k] = { isPublic: true, allowedPlayers: [] };
    else if (entity.shareV === 2) out[k] = { isPublic: false, allowedPlayers: [...(entity.sharedWith ?? [])] };
    else out[k] = { ...LOCKED };
  }
  return { ...entity, shareV: 3, sharedWith: openers, fieldPermissions: out };
}

/** Field settings of an entry in the current model (see toV3). */
export function materializeFields(entity: Entity): Perms {
  return toV3(entity).fieldPermissions ?? {};
}

/** Players who can open a (shareV 3) entry and get its revealed fields, or 'all'. */
function viewersOf(c: Entity): 'all' | string[] {
  return c.isPublic ? 'all' : c.sharedWith ?? [];
}

/** Whether a player sees a field of a shareV 3 entry, assuming they can open it. */
function sees(c: Entity, key: string, uid: string): boolean {
  const p = c.fieldPermissions?.[key];
  if (!p) return false;
  if (p.allowedPlayers?.includes(uid)) return true;
  return p.isPublic && (c.isPublic || !!c.sharedWith?.includes(uid));
}

/** Does a field of this entry have something in it worth revealing? */
export function hasContent(entity: Entity, key: string): boolean {
  switch (key) {
    case 'content':
      return !!entity.content?.trim();
    case 'tags':
      return !!entity.tags?.length;
    case 'imageUrls':
      return !!entity.imageUrls?.length;
    case 'locationId':
      return !!entity.locationId;
    case 'gender':
      return !!entity.gender;
    case 'statBlock':
      return !!(entity.statBlock?.trim() || entity.dndStats);
    default: {
      const v = entity.attributes?.[key];
      return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
    }
  }
}

/** Fields listed in the Reveal panel: the type's fields that have content, in schema order. */
export function revealableKeys(entity: Entity): string[] {
  const order = ['content', 'imageUrls', 'locationId', 'gender', ...fieldsFor(entity.type).map((f) => f.key), 'statBlock', 'tags'];
  const schema = new Set(permissionKeys(entity.type));
  return [...new Set(order)].filter((k) => schema.has(k) && hasContent(entity, k));
}

export interface RevealAudience {
  everyone: boolean;
  players: string[];
}

/** Which of the audience can already see a field. */
export function fieldKnowledge(entity: Entity, key: string, audience: RevealAudience, allPlayers: User[]): 'all' | 'some' | 'none' {
  const c = toV3(entity);
  const uids = audience.everyone ? allPlayers.map((p) => p.uid) : audience.players;
  if (!uids.length) return 'none';
  const knows = uids.filter((u) => sees(c, key, u)).length;
  return knows === uids.length ? 'all' : knows ? 'some' : 'none';
}

/**
 * Fields the Reveal panel ticks when it opens. A first reveal starts from the usual fields; later
 * reveals start from what's shown to everyone who can see the entry (so a newcomer catches up,
 * but a field you kept back, or told only one player, isn't ticked).
 */
export function initialRevealTicks(entity: Entity, allPlayers: User[]): Set<string> {
  const c = toV3(entity);
  const viewers = viewersOf(c);
  const keys = revealableKeys(c);
  if (viewers !== 'all' && !viewers.length) return new Set(keys.filter((k) => c.fieldPermissions?.[k]?.isPublic || defaultRevealed(c.type, k)));
  const uids = viewers === 'all' ? allPlayers.map((u) => u.uid) : viewers;
  // With a single viewer we can't tell "part of the reveal" from "told only to them", so only
  // fields that are usually revealed count.
  return new Set(
    keys.filter((k) => c.fieldPermissions?.[k]?.isPublic || (uids.length > 0 && uids.every((u) => sees(c, k, u)) && (uids.length > 1 || defaultRevealed(c.type, k)))),
  );
}

export interface RevealPlan {
  update: Partial<Pick<Entity, 'shareV' | 'fieldPermissions' | 'isPublic' | 'sharedWith' | 'allowedPlayers' | 'reveals'>>;
  /** Players (or ['*']) who got access to the entry. */
  newAccess: string[];
  /** Fields that became visible to at least one of the audience. */
  newFields: string[];
}

/**
 * Reveal an entry to everyone or chosen players, showing exactly the ticked fields. Never takes
 * anything away from players who already see it; unticked fields stay hidden from the audience.
 */
export function planReveal(entity: Entity, audience: RevealAudience, fields: Iterable<string>, allPlayers: User[], at = Date.now()): RevealPlan {
  const c = toV3(entity);
  const perms = c.fieldPermissions ?? {};
  const shared = c.sharedWith ?? [];
  const ticked = new Set(fields);
  const newFields: string[] = [];

  for (const k of lockableKeys(c)) {
    const before = fieldKnowledge(c, k, audience, allPlayers);
    const p = perms[k] ?? { ...LOCKED };
    if (ticked.has(k) || before === 'all') {
      if (audience.everyone) perms[k] = { isPublic: true, allowedPlayers: p.allowedPlayers };
      else if (!p.isPublic) perms[k] = { isPublic: false, allowedPlayers: [...new Set([...p.allowedPlayers, ...audience.players])] };
      if (before !== 'all' && hasContent(c, k)) newFields.push(k);
    } else if (p.isPublic && !c.isPublic) {
      // "Everyone who can see it" would include the new audience: narrow it to today's viewers.
      perms[k] = { isPublic: false, allowedPlayers: [...new Set([...p.allowedPlayers, ...shared])] };
    }
  }

  const update: RevealPlan['update'] = { shareV: 3, fieldPermissions: perms, sharedWith: shared };
  let newAccess: string[] = [];
  if (audience.everyone) {
    if (!c.isPublic) newAccess = ['*'];
    update.isPublic = true;
  } else if (!c.isPublic) {
    newAccess = audience.players.filter((u) => !shared.includes(u));
    if (newAccess.length) {
      update.sharedWith = [...new Set([...shared, ...newAccess])];
      update.allowedPlayers = [...new Set([...(c.allowedPlayers ?? []), ...newAccess])];
    }
  }

  if (newAccess.length || newFields.length) {
    const event: RevealEvent = { at, to: audience.everyone ? ['*'] : audience.players };
    if (newFields.length) event.fields = newFields;
    update.reveals = [...(c.reveals ?? []), event].slice(-50);
  }
  return { update, newAccess, newFields };
}

export type FieldState = 'shown' | 'some' | 'hidden' | 'prepared';

/** One field, as the DM sees it on the entry page: who of the entry's viewers can see it. */
export function fieldState(entity: Entity, key: string, allPlayers: User[]): FieldState {
  const c = toV3(entity);
  const viewers = viewersOf(c);
  if (viewers !== 'all' && !viewers.length) return c.fieldPermissions?.[key]?.isPublic ? 'prepared' : 'hidden';
  const uids = viewers === 'all' ? allPlayers.map((u) => u.uid) : viewers;
  const n = uids.filter((u) => sees(c, key, u)).length;
  return uids.length && n === uids.length ? 'shown' : n ? 'some' : 'hidden';
}

/**
 * Flip one field: hidden → shown to everyone who can see the entry; anything else → hidden.
 * (A field only some players know is hidden rather than spread, so a click never leaks a secret.)
 */
export function planFieldToggle(entity: Entity, key: string, allPlayers: User[], at = Date.now()): RevealPlan {
  const c = toV3(entity);
  const perms = c.fieldPermissions ?? {};
  const viewers = viewersOf(c);
  const state = fieldState(c, key, allPlayers);
  const update: RevealPlan['update'] = { shareV: 3, fieldPermissions: perms, sharedWith: c.sharedWith ?? [] };
  if (state !== 'hidden') {
    perms[key] = { ...LOCKED };
    return { update, newAccess: [], newFields: [] };
  }
  // On a public or still-secret entry "everyone who can see it" is exactly right; on a shared
  // one, name today's viewers so players added later don't get it automatically.
  if (viewers === 'all' || !viewers.length) perms[key] = { isPublic: true, allowedPlayers: perms[key]?.allowedPlayers ?? [] };
  else perms[key] = { isPublic: false, allowedPlayers: [...new Set([...(perms[key]?.allowedPlayers ?? []), ...viewers])] };
  const revealedNow = viewers === 'all' || viewers.length > 0;
  if (revealedNow) update.reveals = [...(c.reveals ?? []), { at, to: viewers === 'all' ? ['*'] : viewers, fields: [key] }].slice(-50);
  return { update, newAccess: [], newFields: revealedNow ? [key] : [] };
}

/** Fields shown by default when the DM shares an entry from the editor. */
export function defaultFieldPerms(entity: Entity): Perms {
  const out: Perms = {};
  for (const k of lockableKeys(entity)) out[k] = permissionKeys(entity.type).includes(k) && defaultRevealed(entity.type, k) ? { isPublic: true, allowedPlayers: [] } : { ...LOCKED };
  return out;
}
