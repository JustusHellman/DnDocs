/**
 * The Scavenger's Codex inside DnDocs: translating between the codex's own saved state and the
 * campaign's Firestore documents. Pure (no Firebase), so it can be unit-tested.
 *
 * The codex keeps its state as localStorage-style keys. When DnDocs hosts it, those keys come from
 * and go to three places:
 *   codex/{campaignId}                  the party: shared bag, clock, workbench, garden, journal
 *   codex/{campaignId}/satchels/{uid}   one player's own satchel and codex settings
 *   codex/{campaignId}/packs/{name}     homebrew packs the DM added
 *
 * The codex reports each change as { key, prev, next }. DnDocs writes only the difference, using
 * increments for quantities, so two players adding loot at once both count.
 */

export const PARTY_CODE = 'campaign';
export const KEY_PARTY = `scavengers-codex.party.v1.data.${PARTY_CODE}`;
export const KEY_PARTY_CODE = 'scavengers-codex.party.v1.code';
export const KEY_SATCHEL = 'scavengers-codex.satchel.v1';
export const KEY_HOMEBREW = 'scavengers-codex.homebrew';
/** Keys that are about this device only, never saved to the campaign. */
const DEVICE_KEYS = new Set(['scavengers-codex.dmUnlocked', 'scavengers-codex.localPin', 'scavengers-codex.siteUrl', KEY_PARTY_CODE]);

/** The codex's party object (what it saves under KEY_PARTY). */
export interface CodexParty {
  items?: Record<string, number>;
  learned?: string[];
  known?: string[];
  research?: Record<string, number>;
  log?: { at: number; clock?: number; text: string }[];
  session?: unknown;
  clock?: number;
  stamps?: Record<string, unknown>;
  projects?: { uid: string; [k: string]: unknown }[];
  beds?: { uid: string; [k: string]: unknown }[];
  spoil?: boolean | null;
  packs?: string[] | null;
}

/**
 * The party in Firestore. Lists become maps so each entry can change on its own; nested lists
 * (Firestore can't store a list inside a list) are kept as JSON text.
 */
export interface PartyDoc {
  items?: Record<string, number>;
  clock?: number;
  learned?: Record<string, boolean>;
  known?: Record<string, boolean>;
  research?: Record<string, number>;
  stamps?: Record<string, string>;
  projects?: Record<string, { o: number; j: string }>;
  beds?: Record<string, { o: number; j: string }>;
  log?: Record<string, { at: number; clock?: number; text: string }>;
  session?: string | null;
  spoil?: boolean | null;
  packs?: string[] | null;
  updatedAt?: unknown;
}

export interface SatchelDoc {
  items?: Record<string, number>;
  /** Codex settings (theme, roll bonuses, goals …), each as JSON text. */
  prefs?: Record<string, string>;
}

export interface PackDoc {
  name: string;
  addedAt?: string;
  /** The pack file as JSON text. */
  data: string;
}

/** One Firestore change: set a value, add to a number, or remove a field. */
export type FieldOp = { path: string[]; set: unknown } | { path: string[]; inc: number } | { path: string[]; del: true };

export const NEW_PARTY: PartyDoc = { items: {}, clock: 8, learned: {}, known: {}, research: {}, stamps: {}, projects: {}, beds: {}, log: {} };

const parse = (s: unknown) => {
  if (typeof s !== 'string') return s ?? null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const trueKeys = (m?: Record<string, boolean>) => Object.entries(m ?? {}).filter(([, v]) => v).map(([k]) => k);
const positive = (m?: Record<string, number>) => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m ?? {})) if (Number(v) > 0) out[k] = Math.floor(Number(v));
  return out;
};
const ordered = (m?: Record<string, { o: number; j: string }>) =>
  Object.entries(m ?? {})
    .sort((a, b) => (a[1]?.o ?? 0) - (b[1]?.o ?? 0) || a[0].localeCompare(b[0]))
    .map(([, v]) => parse(v?.j))
    .filter((x): x is { uid: string } => !!x && typeof x === 'object');

/** A log line's id: when it happened plus a short hash of what it says. */
export function logKey(e: { at: number; text: string }) {
  let h = 0;
  for (let i = 0; i < e.text.length; i++) h = (Math.imul(h, 31) + e.text.charCodeAt(i)) | 0;
  return `${e.at}-${(h >>> 0).toString(36)}`;
}

export function toCodexParty(d: PartyDoc | null | undefined): CodexParty {
  const doc = d ?? NEW_PARTY;
  return {
    items: positive(doc.items),
    learned: trueKeys(doc.learned),
    known: trueKeys(doc.known),
    research: { ...(doc.research ?? {}) },
    log: Object.values(doc.log ?? {})
      .filter((e) => e && typeof e.text === 'string')
      .sort((a, b) => b.at - a.at)
      .slice(0, 300),
    session: parse(doc.session),
    clock: typeof doc.clock === 'number' ? doc.clock : 8,
    stamps: Object.fromEntries(Object.entries(doc.stamps ?? {}).map(([k, v]) => [k, parse(v)])),
    projects: ordered(doc.projects),
    beds: ordered(doc.beds),
    spoil: doc.spoil ?? null,
    packs: Array.isArray(doc.packs) ? doc.packs : null,
  };
}

function countOps(field: string, prev: Record<string, number> = {}, next: Record<string, number> = {}): FieldOp[] {
  const ops: FieldOp[] = [];
  for (const id of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const d = (Number(next[id]) || 0) - (Number(prev[id]) || 0);
    if (d) ops.push({ path: [field, id], inc: Math.round(d) });
  }
  return ops;
}

function setOps(field: string, prev: string[] = [], next: string[] = []): FieldOp[] {
  const a = new Set(prev), b = new Set(next);
  return [
    ...[...b].filter((k) => !a.has(k)).map((k): FieldOp => ({ path: [field, k], set: true })),
    ...[...a].filter((k) => !b.has(k)).map((k): FieldOp => ({ path: [field, k], del: true })),
  ];
}

function mapOps(field: string, prev: Record<string, unknown> = {}, next: Record<string, unknown> = {}, wrap = (v: unknown) => v): FieldOp[] {
  const ops: FieldOp[] = [];
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (!(k in next)) ops.push({ path: [field, k], del: true });
    else if (!same(prev[k], next[k])) ops.push({ path: [field, k], set: wrap(next[k]) });
  }
  return ops;
}

function listOps(field: 'projects' | 'beds', prev: CodexParty['projects'] = [], next: CodexParty['projects'] = [], now: number): FieldOp[] {
  const before = new Map(prev.map((x) => [x.uid, x]));
  const after = new Map(next.map((x) => [x.uid, x]));
  const ops: FieldOp[] = [];
  next.forEach((x, i) => {
    if (!x?.uid) return;
    const old = before.get(x.uid);
    if (!old) ops.push({ path: [field, x.uid], set: { o: now + i, j: JSON.stringify(x) } });
    else if (!same(old, x)) ops.push({ path: [field, x.uid, 'j'], set: JSON.stringify(x) });
  });
  for (const uid of before.keys()) if (!after.has(uid)) ops.push({ path: [field, uid], del: true });
  return ops;
}

/** What to write to the party document after the codex changed the party from `prev` to `next`. */
export function partyOps(prev: CodexParty | null, next: CodexParty | null, opts: { isDM: boolean; now?: number }): FieldOp[] {
  const a = prev ?? toCodexParty(null);
  const b = next ?? toCodexParty(null);
  const now = opts.now ?? Date.now();
  const ops: FieldOp[] = [
    ...countOps('items', a.items, b.items),
    ...setOps('learned', a.learned, b.learned),
    ...setOps('known', a.known, b.known),
    ...mapOps('research', a.research, b.research),
    ...mapOps('stamps', a.stamps, b.stamps, (v) => JSON.stringify(v)),
    ...listOps('projects', a.projects, b.projects, now),
    ...listOps('beds', a.beds, b.beds, now),
  ];
  const clock = (Number(b.clock) || 0) - (Number(a.clock) || 0);
  if (clock) ops.push({ path: ['clock'], inc: clock });
  // Log: only new lines are added; the codex trims old ones itself (see pruneLogOps).
  const had = new Set((a.log ?? []).map(logKey));
  for (const e of b.log ?? []) if (e && typeof e.text === 'string' && !had.has(logKey(e))) ops.push({ path: ['log', logKey(e)], set: { at: e.at, clock: e.clock ?? null, text: e.text.slice(0, 200) } });
  if (!same(a.session, b.session)) ops.push({ path: ['session'], set: b.session == null ? null : JSON.stringify(b.session) });
  if (!same(a.spoil, b.spoil)) ops.push({ path: ['spoil'], set: b.spoil ?? null });
  // Which homebrew is in play is the DM's call.
  if (opts.isDM && !same(a.packs, b.packs)) ops.push({ path: ['packs'], set: b.packs ?? null });
  return ops;
}

/** Keeps the party log at its newest `keep` lines. */
export function pruneLogOps(doc: PartyDoc, keep = 300): FieldOp[] {
  const entries = Object.entries(doc.log ?? {}).sort((x, y) => (y[1]?.at ?? 0) - (x[1]?.at ?? 0));
  return entries.slice(keep).map(([k]): FieldOp => ({ path: ['log', k], del: true }));
}

/** Quantities that reached zero (or below, after two players took the last one) are tidied away. */
export function pruneZeroOps(field: string, m?: Record<string, number>): FieldOp[] {
  return Object.entries(m ?? {})
    .filter(([, v]) => !(Number(v) > 0))
    .map(([k]): FieldOp => ({ path: [field, k], del: true }));
}

export function isPrefKey(key: string) {
  return key.startsWith('scavengers-codex.') && !DEVICE_KEYS.has(key) && key !== KEY_PARTY && key !== KEY_SATCHEL && key !== KEY_HOMEBREW && !key.startsWith('scavengers-codex.party.v1.');
}

/** What to write to a player's satchel document. */
export function satchelOps(key: string, prev: unknown, next: unknown): FieldOp[] {
  if (key === KEY_SATCHEL) return countOps('items', positive(prev as Record<string, number>), positive(next as Record<string, number>));
  if (isPrefKey(key)) return [next == null ? { path: ['prefs', key], del: true } : { path: ['prefs', key], set: JSON.stringify(next) }];
  return [];
}

export interface CodexPack {
  name: string;
  addedAt?: string;
  data: unknown;
}

/** Homebrew packs added or removed (by name). */
export function packChanges(prev: unknown, next: unknown): { put: CodexPack[]; remove: string[] } {
  const list = (v: unknown) => (Array.isArray(v) ? (v as CodexPack[]).filter((p) => p && typeof p.name === 'string') : []);
  const a = new Map(list(prev).map((p) => [p.name, p]));
  const b = new Map(list(next).map((p) => [p.name, p]));
  return {
    put: [...b.values()].filter((p) => !same(a.get(p.name), p)),
    remove: [...a.keys()].filter((n) => !b.has(n)),
  };
}

/** Everything the codex needs at start-up (or after a change), as its own storage keys. */
export function codexKeys(party: PartyDoc | null, satchel: SatchelDoc | null, packs: PackDoc[]): Record<string, unknown> {
  const keys: Record<string, unknown> = {
    [KEY_PARTY_CODE]: PARTY_CODE,
    [KEY_PARTY]: toCodexParty(party),
    [KEY_SATCHEL]: positive(satchel?.items),
    [KEY_HOMEBREW]: packs
      .map((p) => ({ name: p.name, addedAt: p.addedAt, data: parse(p.data) }))
      .filter((p) => p.data && typeof p.data === 'object'),
  };
  for (const [k, v] of Object.entries(satchel?.prefs ?? {})) if (isPrefKey(k)) keys[k] = parse(v);
  return keys;
}

/** Codex journal keys for a revealed DnDocs entry linked to the codex. */
export function unlockKeys(kind: 'monster' | 'thing', id: string): string[] {
  return kind === 'monster' ? [`m:${id}`] : [`t:${id}`];
}
