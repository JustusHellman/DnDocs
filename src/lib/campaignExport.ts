/**
 * Turns a campaign back into a campaign pack (the same file format the importer reads), so a campaign can be
 * backed up, moved or shared. This module is pure (no Firebase): the caller hands it the entries, links and
 * map images and gets back the pack plus a list of things that could not be included.
 *
 * Two modes:
 *  - "full":   a copy for the DM. Everything, including DM notes, secret entries and the DM's own notes.
 *  - "public": a copy that is safe to hand to players. Only entries that are public, only the fields players
 *              can see, no DM notes, no tags and no one's private notes.
 *
 * What a pack cannot carry: pictures on entries (only map images), reveal history, who each entry was shared
 * with, and the campaign's own entry types (an importing campaign needs the same types).
 * Everything imported from a pack starts secret, so a shared copy never exposes anything by accident.
 */
import type { Campaign, Entity, EntityType, Relationship } from '../types';
import { fieldsFor, isEntityType, storageType } from './entityTypes';
import { canViewField } from './permissions';
import { MAX_ENTRIES, MAX_MAPS, MAX_MAP_CHARS, PACK_FORMAT, PACK_VERSION, type CampaignPack, type PackEntity } from './campaignImport';

export type ExportMode = 'full' | 'public';

export interface ExportOptions {
  mode: ExportMode;
  /** The person exporting (their own notes are included in a full copy; nobody else's ever are). */
  uid: string;
  /** Map image data by media id. Missing ids simply leave the map out. */
  media: Map<string, string>;
}

export interface ExportResult {
  pack: CampaignPack | null;
  /** Plain-language notes about anything left out. */
  warnings: string[];
  /** Why no file could be made, if it could not. */
  error?: string;
  counts: { entries: number; relationships: number; maps: number };
}

/** Which entries a mode includes. */
export function selectEntries(entities: Entity[], opts: Pick<ExportOptions, 'mode' | 'uid'>): Entity[] {
  return entities.filter((e) => {
    if (opts.mode === 'public') return e.isPublic;
    // Notes are personal: a full copy contains only the exporter's own.
    if (e.type === 'note') return e.ownerId === opts.uid;
    return true;
  });
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'entry';

const LINK = /\[([^\]]*)\]\(\/entity\/([^)\s]+)\)/g;

export function buildExportPack(campaign: Pick<Campaign, 'id' | 'name'>, all: Entity[], relationships: Relationship[], opts: ExportOptions): ExportResult {
  const warnings: string[] = [];
  const entities = selectEntries(all, opts);
  const counts = { entries: entities.length, relationships: 0, maps: 0 };
  if (entities.length === 0) {
    return { pack: null, warnings, error: opts.mode === 'public' ? 'No entries are public yet, so there is nothing to share.' : 'There is nothing to export yet.', counts };
  }
  if (entities.length > MAX_ENTRIES) {
    return {
      pack: null,
      warnings,
      error: `This copy would have ${entities.length} entries, and a pack can hold at most ${MAX_ENTRIES}. Export fewer entries (for example the public copy) or split the campaign.`,
      counts,
    };
  }

  // Keys: readable, unique, stable.
  const keyOf = new Map<string, string>();
  const used = new Set<string>();
  for (const e of [...entities].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    const base = slug(e.name);
    let k = base;
    for (let n = 2; used.has(k); n++) k = `${base.slice(0, 55)}-${n}`;
    used.add(k);
    keyOf.set(e.id, k);
  }
  const byId = new Map(entities.map((e) => [e.id, e]));
  const publicViewer = { uid: '__players__', isDM: false };
  const can = (e: Entity, field: string) => (opts.mode === 'full' ? true : canViewField(publicViewer, e, field));

  /** [Name](/entity/id) → [[key|Name]] when the target is in the pack, else just the name. */
  let strippedLinks = 0;
  const relink = (text: string): string =>
    text.replace(LINK, (_m, label: string, id: string) => {
      const k = keyOf.get(id);
      if (k) return `[[${k}|${label}]]`;
      strippedLinks++;
      return label;
    });

  let droppedFields = 0;
  let customTypes = 0;
  const packEntities: PackEntity[] = [];
  for (const e of entities) {
    const typeId = (e.customType as string | undefined) ?? e.type;
    if (!isEntityType(typeId)) {
      warnings.push(`"${e.name}" has a type this campaign no longer knows ("${typeId}"), so it is saved as a note.`);
    }
    const type = isEntityType(typeId) ? typeId : 'note';
    if (e.customType) customTypes++;

    const allowed = new Map(fieldsFor(type as EntityType).map((f) => [f.key, f]));
    const attributes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e.attributes ?? {})) {
      const f = allowed.get(k);
      if (!f || v === undefined || v === null || !can(e, k)) {
        if (f === undefined) droppedFields++;
        continue;
      }
      if (f.type === 'entity-select') {
        const t = typeof v === 'string' ? keyOf.get(v) : undefined;
        if (t) attributes[k] = `@${t}`;
        continue;
      }
      if (f.type === 'boolean') {
        attributes[k] = !!v;
        continue;
      }
      if (typeof v === 'string') attributes[k] = f.rating ? v : relink(v);
    }

    const parent = e.locationId && keyOf.has(e.locationId) ? keyOf.get(e.locationId)! : null;
    const pe: PackEntity = { key: keyOf.get(e.id)!, type, name: e.name.trim().slice(0, 199), parent };
    if (opts.mode === 'full') pe.tags = e.tags ?? [];
    else {
      const tags = can(e, 'tags') ? (e.tags ?? []) : [];
      if (tags.length) pe.tags = tags;
    }
    pe.content = can(e, 'content') ? relink(e.content ?? '') : '';
    if (Object.keys(attributes).length) pe.attributes = attributes;
    if (storageType(type as EntityType).type === 'npc' && e.gender && can(e, 'gender')) pe.gender = e.gender;
    if (opts.mode === 'full' && e.dmNotes) pe.dmNotes = relink(e.dmNotes);
    if (can(e, 'statBlock')) {
      if (e.statBlock) pe.statBlock = relink(e.statBlock);
      if (e.dndStats) pe.dndStats = e.dndStats;
    }
    packEntities.push(pe);
  }
  if (strippedLinks) warnings.push(`${strippedLinks} link${strippedLinks === 1 ? '' : 's'} to entries that are not in this copy became plain text.`);
  if (droppedFields) warnings.push(`${droppedFields} old field value${droppedFields === 1 ? '' : 's'} (from fields no longer in use) were left out.`);
  if (customTypes) warnings.push(`${customTypes} entries use your own entry types. The campaign you import into needs the same types, or the import will stop and say so.`);
  if (entities.some((e) => (e.imageUrls?.length ?? 0) > 0)) warnings.push('Pictures on entries are not included in a pack (only map images are).');

  // Links between entries: only between entries that are both in the copy.
  const seen = new Set<string>();
  const packRels: NonNullable<CampaignPack['relationships']> = [];
  for (const r of relationships) {
    const s = keyOf.get(r.sourceId);
    const t = keyOf.get(r.targetId);
    if (!s || !t || s === t) continue;
    const dup = `${s}>${t}`;
    if (seen.has(dup)) continue;
    seen.add(dup);
    packRels.push({ source: s, target: t, label: r.label, reverseLabel: r.reverseLabel || r.label });
  }
  counts.relationships = packRels.length;

  // Maps.
  const packMaps: NonNullable<CampaignPack['maps']> = [];
  let skippedMaps = 0;
  for (const e of entities) {
    const mid = e.mapConfig?.mediaId;
    if (!mid || !can(e, 'imageUrls')) continue;
    const data = opts.media.get(mid);
    if (!data || !/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(data) || data.length >= MAX_MAP_CHARS) {
      skippedMaps++;
      continue;
    }
    if (packMaps.length >= MAX_MAPS) {
      skippedMaps++;
      continue;
    }
    const pins = (e.mapConfig?.pins ?? [])
      .filter((p) => keyOf.has(p.targetEntityId) && byId.has(p.targetEntityId))
      .map((p) => ({ target: keyOf.get(p.targetEntityId)!, x: p.x, y: p.y }));
    packMaps.push({ entity: keyOf.get(e.id)!, image: data, pins });
  }
  if (skippedMaps) warnings.push(`${skippedMaps} map image${skippedMaps === 1 ? ' was' : 's were'} left out (not stored in the app, too large, or over the limit of ${MAX_MAPS}).`);
  counts.maps = packMaps.length;

  const label = opts.mode === 'public' ? ' (player copy)' : '';
  const pack: CampaignPack = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    pack: {
      id: slug(campaign.name).slice(0, 36) || 'campaign',
      name: `${campaign.name}${label}`.slice(0, 120),
      description: opts.mode === 'public' ? 'Everything the players can see.' : 'A full copy of the campaign, including DM notes.',
    },
    entities: packEntities,
    ...(packRels.length ? { relationships: packRels } : {}),
    ...(packMaps.length ? { maps: packMaps } : {}),
  };
  return { pack, warnings, counts };
}
