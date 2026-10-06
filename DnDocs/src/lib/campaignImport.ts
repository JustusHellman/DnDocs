/**
 * Campaign packs: a JSON file that describes a whole set of entries and the links between them.
 *
 * This module is pure (no Firebase): it checks a pack against the campaign's current entry types
 * and turns it into the exact documents that would be written, so the DM can preview an import
 * before anything touches the database. `campaignImportWrite.ts` does the writing.
 *
 * Safety rules baked in here:
 *  - Every imported entry starts **secret** (nobody but the DM can see it).
 *  - Ids are derived from the pack id + the entry's key, so importing twice can never duplicate.
 *  - Unknown types, fields, select options, links and parents are errors, not guesses.
 */
import type { DndStats, Entity, EntityType, Relationship } from '../types';
import { builtinMeta, fieldsFor, isEntityType, storageType, typeMeta, type FieldSchema } from './entityTypes';
import type { BuiltinType } from '../types';

export const PACK_FORMAT = 'dndocs-campaign-pack';
export const PACK_VERSION = 1;
export const MAX_ENTRIES = 600;

export interface PackEntity {
  key: string;
  type: string;
  name: string;
  parent?: string | null;
  tags?: string[];
  content?: string;
  attributes?: Record<string, unknown>;
  gender?: string | null;
  dmNotes?: string | null;
  statBlock?: string | null;
  dndStats?: DndStats | null;
}

export interface PackRelationship {
  source: string;
  target: string;
  /** What the target is to the source. */
  label: string;
  /** What the source is to the target (defaults to `label`). */
  reverseLabel?: string;
}

export interface CampaignPack {
  format: typeof PACK_FORMAT;
  version: number;
  pack: { id: string; name: string; description?: string };
  entities: PackEntity[];
  relationships?: PackRelationship[];
}

export interface Issue {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

export interface ImportPlan {
  ok: boolean;
  pack: CampaignPack['pack'] | null;
  entities: Entity[];
  relationships: Relationship[];
  issues: Issue[];
  /** Entries per entry type, for the preview. */
  counts: Record<string, number>;
}

const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LINK_RE = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
const STAT_NUMBERS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const STAT_TEXT = ['armorClass', 'hitPoints', 'speed', 'skills', 'senses', 'languages', 'challenge', 'proficiencyBonus'] as const;

/** Entries made from a pack always get ids like `seed-<pack>-<key>`. */
export const entityIdFor = (packId: string, key: string) => `seed-${packId}-${key}`;
export const relationshipIdFor = (packId: string, source: string, target: string) => `seedrel-${packId}-${source}--${target}`;
export const isPackEntityId = (packId: string, id: string) => id.startsWith(`seed-${packId}-`);
export const isPackRelationshipId = (packId: string, id: string) => id.startsWith(`seedrel-${packId}-`);

const entryLink = (name: string, id: string) => `[${name.replace(/[[\]]/g, '')}](/entity/${id})`;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parsePackText(text: string): { raw: unknown; error?: string } {
  try {
    return { raw: JSON.parse(text) };
  } catch (e) {
    return { raw: null, error: `This isn't valid JSON (${(e as Error).message}).` };
  }
}

function emptyPlan(issues: Issue[]): ImportPlan {
  return { ok: false, pack: null, entities: [], relationships: [], issues, counts: {} };
}

/** Checks a pack and builds the documents it would create. Never throws. */
export function buildPlan(raw: unknown, ctx: { campaignId: string; uid: string; now?: string }): ImportPlan {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => issues.push({ level: 'warning', where, message });

  if (!isRecord(raw)) return emptyPlan([{ level: 'error', where: 'file', message: 'The file must contain a JSON object.' }]);
  if (raw.format !== PACK_FORMAT) err('file', `Not a campaign pack (expected format "${PACK_FORMAT}").`);
  if (typeof raw.version !== 'number' || raw.version > PACK_VERSION) err('file', `Unsupported pack version ${String(raw.version)} (this app understands ${PACK_VERSION}).`);
  const meta = raw.pack;
  if (!isRecord(meta) || typeof meta.id !== 'string' || !KEY_RE.test(meta.id) || meta.id.length > 40 || typeof meta.name !== 'string' || !meta.name.trim()) {
    err('pack', 'The "pack" section needs an id (lowercase letters, numbers and dashes, up to 40 characters) and a name.');
  }
  if (!Array.isArray(raw.entities) || raw.entities.length === 0) err('entities', 'The pack has no entries.');
  if (issues.some((i) => i.level === 'error')) return emptyPlan(issues);

  const packMeta = { id: (meta as Record<string, string>).id, name: (meta as Record<string, string>).name, description: (meta as Record<string, string>).description };
  const entities = raw.entities as unknown[];
  const rels = Array.isArray(raw.relationships) ? (raw.relationships as unknown[]) : [];
  if (entities.length > MAX_ENTRIES) err('entities', `A pack can have at most ${MAX_ENTRIES} entries (this one has ${entities.length}).`);

  // ---- pass 1: shape + unique keys ---------------------------------------------------
  const byKey = new Map<string, PackEntity>();
  for (const [i, e] of entities.entries()) {
    const where = isRecord(e) && typeof e.key === 'string' ? `entry "${e.key}"` : `entry #${i + 1}`;
    if (!isRecord(e)) {
      err(where, 'Must be an object.');
      continue;
    }
    if (typeof e.key !== 'string' || !KEY_RE.test(e.key) || e.key.length > 60) {
      err(where, 'Needs a "key" (lowercase letters, numbers and dashes, up to 60 characters).');
      continue;
    }
    if (byKey.has(e.key)) {
      err(where, 'Duplicate key.');
      continue;
    }
    if (typeof e.name !== 'string' || !e.name.trim() || e.name.length >= 200) err(where, 'Needs a name (up to 199 characters).');
    if (typeof e.type !== 'string' || !isEntityType(e.type)) err(where, `Unknown entry type "${String(e.type)}". Types in this campaign: use a built-in type or one you created.`);
    if (e.tags !== undefined && (!Array.isArray(e.tags) || e.tags.some((t) => typeof t !== 'string') || e.tags.length > 100)) err(where, '"tags" must be a list of up to 100 strings.');
    for (const f of ['content', 'dmNotes', 'statBlock'] as const) {
      if (e[f] != null && typeof e[f] !== 'string') err(where, `"${f}" must be text.`);
      if (typeof e[f] === 'string' && (e[f] as string).length > 90000) err(where, `"${f}" is too long.`);
    }
    if (e.parent != null && typeof e.parent !== 'string') err(where, '"parent" must be another entry\'s key.');
    if (e.attributes !== undefined && !isRecord(e.attributes)) err(where, '"attributes" must be an object.');
    byKey.set(e.key, e as unknown as PackEntity);
  }

  const idOf = (key: string) => entityIdFor(packMeta.id, key);

  // ---- pass 2: parents, attributes, stat blocks ---------------------------------------
  const resolveText = (where: string, text: string): string =>
    text.replace(LINK_RE, (_m, key: string, label?: string) => {
      const t = byKey.get(key);
      if (!t) {
        err(where, `Links to "[[${key}]]", which isn't in the pack.`);
        return label ?? key;
      }
      return entryLink(label ?? t.name, idOf(key));
    });

  const entries = [...byKey.values()];
  for (const e of entries) {
    const where = `entry "${e.key}"`;
    if (!isEntityType(e.type)) continue;
    if (e.parent) {
      const p = byKey.get(e.parent);
      if (!p) err(where, `Parent "${e.parent}" isn't in the pack.`);
      else if (isEntityType(p.type) && !typeMeta(e.type).parents.includes(p.type as EntityType)) {
        err(where, `A ${typeMeta(e.type).label} can't be located in a ${typeMeta(p.type).label} ("${p.name}").`);
      }
    }
  }
  // parent cycles
  for (const e of entries) {
    const seen = new Set<string>();
    for (let cur: PackEntity | undefined = e; cur?.parent; cur = byKey.get(cur.parent)) {
      if (seen.has(cur.key)) {
        err(`entry "${e.key}"`, 'Its location chain loops back on itself.');
        break;
      }
      seen.add(cur.key);
    }
  }

  const fieldOk = (where: string, f: FieldSchema, value: unknown): unknown => {
    switch (f.type) {
      case 'boolean':
        if (typeof value !== 'boolean') err(where, `"${f.label}" must be true or false.`);
        return value;
      case 'select':
        if (typeof value !== 'string' || (value !== '' && !f.options?.includes(value))) err(where, `"${f.label}" must be one of: ${f.options?.join(', ')} (got "${String(value)}").`);
        return value;
      case 'entity-select': {
        if (value === '' || value == null) return '';
        if (typeof value !== 'string' || !value.startsWith('@')) {
          err(where, `"${f.label}" must be "@" followed by another entry's key.`);
          return '';
        }
        const t = byKey.get(value.slice(1));
        if (!t) {
          err(where, `"${f.label}" points to "${value}", which isn't in the pack.`);
          return '';
        }
        if (f.targetType && t.type !== f.targetType && storageType(t.type as EntityType).type !== f.targetType) {
          err(where, `"${f.label}" expects a ${typeMeta(f.targetType).label}, but "${t.name}" is a ${typeMeta(t.type).label}.`);
        }
        return idOf(value.slice(1));
      }
      default: {
        if (typeof value !== 'string') {
          err(where, `"${f.label}" must be text.`);
          return '';
        }
        if (f.rating && value !== '' && !(/^\d+$/.test(value) && +value >= 1 && +value <= 20)) err(where, `"${f.label}" is a rating from 1 to 20 (got "${value}").`);
        return f.rating ? value : resolveText(where, value);
      }
    }
  };

  const built: Entity[] = [];
  const now = ctx.now ?? new Date().toISOString();
  for (const e of entries) {
    const where = `entry "${e.key}"`;
    if (!isEntityType(e.type)) continue;
    const type = e.type as EntityType;
    const liveFields = new Map(fieldsFor(type).map((f) => [f.key, f]));
    const storage = storageType(type);
    const shipped = new Map((storage.customType ? typeMeta(type).fields : builtinMeta(storage.type as BuiltinType).fields).map((f) => [f.key, f]));

    const attributes: Record<string, unknown> = {};
    for (const f of fieldsFor(type)) if (f.defaultValue !== undefined) attributes[f.key] = f.defaultValue;
    for (const [k, v] of Object.entries(e.attributes ?? {})) {
      const f = liveFields.get(k);
      if (!f) {
        if (shipped.has(k)) warn(where, `Field "${shipped.get(k)!.label}" is hidden in this campaign, so its value is saved but not shown.`);
        else err(where, `Unknown field "${k}" for ${typeMeta(type).label}.`);
        attributes[k] = v;
        continue;
      }
      attributes[k] = fieldOk(where, f, v);
    }

    let dndStats: DndStats | null = null;
    if (e.dndStats != null) {
      const s = e.dndStats as unknown as Record<string, unknown>;
      if (!isRecord(s)) err(where, '"dndStats" must be an object.');
      else {
        for (const k of STAT_TEXT) if (typeof s[k] !== 'string') err(where, `dndStats.${k} must be text.`);
        for (const k of STAT_NUMBERS) if (typeof s[k] !== 'number' || s[k] < 1 || s[k] > 30) err(where, `dndStats.${k} must be a number from 1 to 30.`);
        dndStats = s as unknown as DndStats;
      }
    }
    if ((e.statBlock || dndStats) && !['monster', 'npc'].includes(storage.type)) warn(where, 'Stat blocks only show on monsters and NPCs.');
    if (e.gender && storage.type !== 'npc') warn(where, 'Gender only shows on NPCs.');

    const id = idOf(e.key);
    built.push({
      id,
      campaignId: ctx.campaignId,
      ...storage,
      name: e.name.trim(),
      content: resolveText(where, e.content ?? ''),
      tags: [...new Set(e.tags ?? [])],
      ownerId: ctx.uid,
      // Everything starts secret: nothing is visible to players until the DM reveals it.
      isPublic: false,
      allowedPlayers: [],
      sharedWith: [],
      shareV: storage.type === 'note' ? undefined : 2,
      playerKnowledge: {},
      fieldPermissions: {},
      locationId: e.parent ? idOf(e.parent) : null,
      gender: storage.type === 'npc' ? e.gender || null : null,
      imageUrls: [],
      coverThumb: null,
      attributes,
      mapConfig: null,
      statBlock: e.statBlock ? resolveText(where, e.statBlock) : null,
      dndStats,
      dmNotes: e.dmNotes ? resolveText(where, e.dmNotes) : null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // ---- relationships ------------------------------------------------------------------
  const relDocs: Relationship[] = [];
  const seenRel = new Set<string>();
  for (const [i, r] of rels.entries()) {
    const where = `relationship #${i + 1}`;
    if (!isRecord(r) || typeof r.source !== 'string' || typeof r.target !== 'string' || typeof r.label !== 'string' || !r.label.trim()) {
      err(where, 'Needs "source", "target" and a "label".');
      continue;
    }
    const s = byKey.get(r.source);
    const t = byKey.get(r.target);
    if (!s || !t) {
      err(where, `${!s ? `"${r.source}"` : `"${r.target}"`} isn't in the pack.`);
      continue;
    }
    if (s === t) {
      err(where, 'An entry can\'t be related to itself.');
      continue;
    }
    const k = `${r.source}>${r.target}`;
    if (seenRel.has(k)) {
      err(where, `Duplicate relationship ${r.source} → ${r.target}.`);
      continue;
    }
    seenRel.add(k);
    const label = r.label.trim();
    relDocs.push({
      id: relationshipIdFor(packMeta.id, r.source, r.target),
      campaignId: ctx.campaignId,
      sourceId: idOf(r.source),
      targetId: idOf(r.target),
      targetName: t.name.trim(),
      label,
      reverseLabel: (typeof r.reverseLabel === 'string' && r.reverseLabel.trim() ? r.reverseLabel : label).trim(),
      reverseId: '',
      v: 2,
      createdAt: now,
    });
  }

  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const ok = !issues.some((i) => i.level === 'error');
  return { ok, pack: packMeta, entities: ok ? stripUndefined(built) : [], relationships: ok ? relDocs : [], issues, counts };
}

/** Firestore rejects `undefined`. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = stripUndefined(v);
    return out as T;
  }
  return value;
}
