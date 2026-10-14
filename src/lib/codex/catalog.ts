/**
 * Where the Scavenger's Codex lives and the small list of everything in it (catalog.json, built by
 * the codex's deploy). Used to link monster and item entries to the codex and to put codex
 * creatures on a battle map without making a DnDocs entry first.
 */

/** On GitHub Pages the codex is a sibling of DnDocs (…github.io/ScavengersCodex/). */
export const CODEX_URL: string = (import.meta.env.VITE_CODEX_URL as string | undefined) || 'https://justushellman.github.io/ScavengersCodex/';

export function codexFrameUrl() {
  const u = new URL(CODEX_URL, location.href);
  u.searchParams.set('embed', 'dndocs');
  return u.toString();
}

export interface CatalogThing {
  id: string;
  name: string;
  kind: 'material' | 'item';
  tier?: string;
  cat?: string;
  aka?: string[];
  pack?: string;
}

export interface CatalogMonster {
  id: string;
  name: string;
  type?: string;
  size?: string;
  cr?: string;
  aka?: string[];
  pack?: string;
}

export interface Catalog {
  v: number;
  packs: Record<string, { title: string; default: boolean }>;
  aliases: { things: Record<string, string>; monsters: Record<string, string> };
  things: CatalogThing[];
  monsters: CatalogMonster[];
}

let pending: Promise<Catalog> | null = null;

export function loadCatalog(): Promise<Catalog> {
  if (!pending) {
    pending = fetch(new URL('catalog.json', new URL(CODEX_URL, location.href)).toString())
      .then((r) => {
        if (!r.ok) throw new Error(`The Scavenger's Codex list isn't available (${r.status}).`);
        return r.json() as Promise<Catalog>;
      })
      .catch((err) => {
        pending = null; // try again next time
        throw err;
      });
  }
  return pending;
}

export type CodexKind = 'monster' | 'thing';

/** Which kind of codex record an entry type links to (null: none). */
export function codexKindFor(baseType: string): CodexKind | null {
  return baseType === 'monster' ? 'monster' : baseType === 'item' ? 'thing' : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, ' ').trim();

export function findInCatalog(cat: Catalog, kind: CodexKind, id: string | null | undefined): CatalogThing | CatalogMonster | undefined {
  if (!id) return undefined;
  const list: (CatalogThing | CatalogMonster)[] = kind === 'monster' ? cat.monsters : cat.things;
  const real = (kind === 'monster' ? cat.aliases.monsters : cat.aliases.things)[id] ?? id;
  return list.find((e) => e.id === real);
}

/** Codex records whose name (or other name) matches an entry's name: the suggested link. */
export function matchByName(cat: Catalog, kind: CodexKind, name: string) {
  const n = norm(name);
  if (!n) return [];
  const list: (CatalogThing | CatalogMonster)[] = kind === 'monster' ? cat.monsters : cat.things;
  return list.filter((e) => norm(e.name) === n || (e.aka ?? []).some((a) => norm(a) === n));
}

export function searchCatalog(cat: Catalog, kind: CodexKind, term: string, limit = 30) {
  const t = norm(term);
  const list: (CatalogThing | CatalogMonster)[] = kind === 'monster' ? cat.monsters : cat.things;
  if (!t) return list.slice(0, limit);
  const starts: typeof list = [], has: typeof list = [];
  for (const e of list) {
    const names = [e.name, ...(e.aka ?? [])].map(norm);
    if (names.some((x) => x.startsWith(t))) starts.push(e);
    else if (names.some((x) => x.includes(t))) has.push(e);
    if (starts.length >= limit) break;
  }
  return [...starts, ...has].slice(0, limit);
}

/** Codex creature size → squares per side on a battle map. */
export function sizeSquares(size?: string) {
  return ({ Tiny: 0.5, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4 } as Record<string, number>)[size ?? ''] ?? 1;
}

/** The codex page for a record (a hash route inside the codex). */
export function codexHash(kind: CodexKind, e: { id: string; kind?: string }) {
  if (kind === 'monster') return `#/monster/${encodeURIComponent(e.id)}`;
  return `#/${e.kind === 'material' ? 'material' : 'item'}/${encodeURIComponent(e.id)}`;
}
