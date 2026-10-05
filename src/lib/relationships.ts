import type { Relationship } from '../types';

/** Turns stored relationships into what one entry sees (handles both storage formats). */
export function relationsOf(entityId: string, relationships: Relationship[]): { rel: Relationship; otherId: string; label: string }[] {
  const out: { rel: Relationship; otherId: string; label: string }[] = [];
  for (const r of relationships) {
    if (r.sourceId === entityId) out.push({ rel: r, otherId: r.targetId, label: r.label });
    else if (r.v === 2 && r.targetId === entityId) out.push({ rel: r, otherId: r.sourceId, label: r.reverseLabel || r.label });
  }
  return out;
}
