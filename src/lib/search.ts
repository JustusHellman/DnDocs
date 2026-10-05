import type { Entity } from '../types';
import { normalize } from './text';
import { typeMeta } from './entityTypes';

export interface SearchQuery {
  text: string;
  tags: string[];
}

/** Splits "#tag other words" into tags and free text. */
export function parseQuery(raw: string): SearchQuery {
  const tags: string[] = [];
  const text = raw
    .replace(/#([\p{L}\p{N}_-]+)/gu, (_, t: string) => {
      tags.push(normalize(t));
      return ' ';
    })
    .trim();
  return { text: normalize(text), tags };
}

/**
 * Relevance score (0 = no match). Only searches fields the viewer may see.
 */
export function scoreEntity(
  entity: Entity,
  q: SearchQuery,
  canViewField: (e: Entity, f: string) => boolean,
): number {
  const tagsVisible = canViewField(entity, 'tags');
  const entityTags = tagsVisible ? (entity.tags ?? []).map(normalize) : [];
  if (q.tags.length && !q.tags.every((t) => entityTags.some((et) => et.includes(t)))) return 0;
  if (!q.text) return 1;

  const name = normalize(entity.name);
  const words = q.text.split(/\s+/).filter(Boolean);
  let score = 0;
  if (name === q.text) score += 100;
  else if (name.startsWith(q.text)) score += 80;
  else if (name.includes(q.text)) score += 60;

  // Every word must appear somewhere.
  const content = canViewField(entity, 'content') ? normalize(entity.content ?? '') : '';
  const attrs = Object.entries(entity.attributes ?? {})
    .filter(([k, v]) => typeof v === 'string' && canViewField(entity, k))
    .map(([, v]) => normalize(v as string))
    .join(' ');
  const typeLabel = normalize(typeMeta(entity.type).label);
  const haystack = `${name} ${entityTags.join(' ')} ${attrs} ${content} ${typeLabel}`;
  if (!words.every((w) => haystack.includes(w))) return 0;

  if (!score) {
    if (words.every((w) => name.includes(w))) score = 50;
    else if (entityTags.some((t) => words.some((w) => t.includes(w)))) score = 35;
    else if (attrs && words.some((w) => attrs.includes(w))) score = 25;
    else score = 15;
  }
  return score;
}
