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
/** A player's coin purse, in copper pieces. */
export const KEY_PURSE = 'scavengers-codex.purse.v1';
/** A player's unidentified items: only how they look (name, maybe rarity), never what they are. */
export const KEY_UNID = 'scavengers-codex.unid.v1';
/** Curses the DM has revealed to this player, by item id. */
export const KEY_CURSES = 'scavengers-codex.curses.v1';
/** DM only: what every unidentified item really is, and curses not yet revealed. */
export const KEY_SECRETS = 'scavengers-codex.dmsecrets.v1';
/** Written by DnDocs alone (codex:unid), never saved back from the codex. */
const HOST_KEYS = new Set([KEY_UNID, KEY_CURSES, KEY_SECRETS]);
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
  /** The party purse, in copper pieces. */
  cp?: number;
  /** What the party is working towards (codex item ids). */
  goals?: string[];
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
  cp?: number;
  goals?: Record<string, boolean>;
  updatedAt?: unknown;
}

export interface SatchelDoc {
  items?: Record<string, number>;
  /** Codex settings (theme, roll bonuses, goals …), each as JSON text. */
  prefs?: Record<string, string>;
  /** The player's purse, in copper pieces. */
  cp?: number;
  /** Unidentified items, by a random key: how they look, nothing more. */
  unid?: Record<string, UnidLook>;
  /** Revealed curses, by item id. */
  curses?: Record<string, string>;
}

/** What a player sees of an unidentified item. */
export interface UnidLook {
  name: string;
  /** Left out when the DM keeps the rarity hidden too. */
  tier?: string;
  att?: boolean;
  at?: number;
}

/** DM only (codex/{campaignId}/secrets/unid → items): what a handed-out item really is. */
export interface SecretEntry {
  uid: string;
  id: string;
  /** unid: still unidentified. known: identified, but its curse is still hidden. */
  state: 'unid' | 'known';
  curse?: string;
  /** How it looks to the player (for unidentified ones). */
  look?: string;
  at: number;
}
export interface SecretsDoc {
  items?: Record<string, SecretEntry>;
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

const coins = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

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
    cp: coins(doc.cp),
    goals: trueKeys(doc.goals).sort(),
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
    ...setOps('goals', a.goals, b.goals),
    ...mapOps('research', a.research, b.research),
    ...mapOps('stamps', a.stamps, b.stamps, (v) => JSON.stringify(v)),
    ...listOps('projects', a.projects, b.projects, now),
    ...listOps('beds', a.beds, b.beds, now),
  ];
  const clock = (Number(b.clock) || 0) - (Number(a.clock) || 0);
  if (clock) ops.push({ path: ['clock'], inc: clock });
  const cp = coins(b.cp) - coins(a.cp);
  if (cp) ops.push({ path: ['cp'], inc: cp });
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
  return key.startsWith('scavengers-codex.') && !DEVICE_KEYS.has(key) && !HOST_KEYS.has(key) && key !== KEY_PARTY && key !== KEY_SATCHEL && key !== KEY_HOMEBREW && key !== KEY_PURSE && !key.startsWith('scavengers-codex.party.v1.');
}

/** What to write to a player's satchel document. */
export function satchelOps(key: string, prev: unknown, next: unknown): FieldOp[] {
  if (key === KEY_SATCHEL) return countOps('items', positive(prev as Record<string, number>), positive(next as Record<string, number>));
  if (key === KEY_PURSE) {
    const d = coins(next) - coins(prev);
    return d ? [{ path: ['cp'], inc: d }] : [];
  }
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
export function codexKeys(party: PartyDoc | null, satchel: SatchelDoc | null, packs: PackDoc[], secrets?: SecretsDoc | null): Record<string, unknown> {
  const keys: Record<string, unknown> = {
    [KEY_PARTY_CODE]: PARTY_CODE,
    [KEY_PARTY]: toCodexParty(party),
    [KEY_SATCHEL]: positive(satchel?.items),
    [KEY_PURSE]: coins(satchel?.cp),
    [KEY_HOMEBREW]: packs
      .map((p) => ({ name: p.name, addedAt: p.addedAt, data: parse(p.data) }))
      .filter((p) => p.data && typeof p.data === 'object'),
  };
  keys[KEY_UNID] = cleanLooks(satchel?.unid);
  keys[KEY_CURSES] = cleanCurses(satchel?.curses);
  // Only the DM's DnDocs passes these (players can't even read them).
  if (secrets !== undefined) keys[KEY_SECRETS] = cleanSecrets(secrets?.items);
  for (const [k, v] of Object.entries(satchel?.prefs ?? {})) if (isPrefKey(k)) keys[k] = parse(v);
  return keys;
}

/** Codex journal keys for a revealed DnDocs entry linked to the codex. */
export function unlockKeys(kind: 'monster' | 'thing', id: string): string[] {
  return kind === 'monster' ? [`m:${id}`] : [`t:${id}`];
}

/** Copper pieces as the codex shows them: "12 gp 5 sp". */
export function fmtCoins(cp: number | null | undefined) {
  const c = Math.max(0, Math.round(Number(cp) || 0));
  if (!c) return '0 gp';
  const gp = Math.floor(c / 100), sp = Math.floor((c % 100) / 10), cc = c % 10;
  return [gp && `${gp.toLocaleString('en-US')} gp`, sp && `${sp} sp`, cc && `${cc} cp`].filter(Boolean).join(' ');
}

/* ---- unidentified and cursed items (codex:unid, DM only) ---- */

const ITEM_ID = /^[a-z0-9-]{1,80}$/;
const UNID_KEY = /^[a-z0-9]{6,40}$/;
const TIERS = new Set(['mundane', 'common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact']);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function cleanLooks(m?: Record<string, unknown> | null): Record<string, UnidLook> {
  const out: Record<string, UnidLook> = {};
  for (const [k, v] of Object.entries(m ?? {})) {
    const l = v as Partial<UnidLook> | null;
    const name = l && text(l.name, 80);
    if (!UNID_KEY.test(k) || !name) continue;
    out[k] = { name, ...(typeof l.tier === 'string' && TIERS.has(l.tier) ? { tier: l.tier } : {}), ...(l.att ? { att: true } : {}), ...(typeof l.at === 'number' ? { at: l.at } : {}) };
  }
  return out;
}
export function cleanCurses(m?: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m ?? {})) {
    const t = text(v, 600);
    if (ITEM_ID.test(k) && t) out[k] = t;
  }
  return out;
}
export function cleanSecrets(m?: Record<string, unknown> | null): Record<string, SecretEntry> {
  const out: Record<string, SecretEntry> = {};
  for (const [k, v] of Object.entries(m ?? {})) {
    const e = v as Partial<SecretEntry> | null;
    if (!UNID_KEY.test(k) || !e || typeof e.uid !== 'string' || typeof e.id !== 'string' || !ITEM_ID.test(e.id)) continue;
    const curse = text(e.curse, 600), look = text(e.look, 80);
    out[k] = { uid: e.uid, id: e.id, state: e.state === 'known' ? 'known' : 'unid', at: typeof e.at === 'number' ? e.at : 0, ...(curse ? { curse } : {}), ...(look ? { look } : {}) };
  }
  return out;
}

/** What the DM asked for, checked. */
export type UnidRequest =
  | { action: 'give'; uid: string; id: string; q: number; look: Omit<UnidLook, 'at'> | null; curse: string }
  | { action: 'identify' | 'reveal' | 'take' | 'forget'; key: string }
  | { action: 'lift'; uid: string; id: string };

export function cleanUnidRequest(raw: unknown): UnidRequest | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.action !== 'string') return null;
  if (r.action === 'give') {
    if (typeof r.uid !== 'string' || !r.uid || typeof r.id !== 'string' || !ITEM_ID.test(r.id)) return null;
    const q = Math.floor(Number(r.q));
    if (!(q >= 1 && q <= 10)) return null;
    const l = r.look as Partial<UnidLook> | null | undefined;
    const name = l ? text(l.name, 80) : '';
    const look = l ? (name ? { name, ...(typeof l.tier === 'string' && TIERS.has(l.tier) ? { tier: l.tier } : {}), ...(l.att ? { att: true } : {}) } : null) : null;
    if (l && !look) return null;
    const curse = text(r.curse, 600);
    if (!look && !curse) return null;
    return { action: 'give', uid: r.uid, id: r.id, q, look, curse };
  }
  if (r.action === 'lift') return typeof r.uid === 'string' && r.uid && typeof r.id === 'string' && ITEM_ID.test(r.id) ? { action: 'lift', uid: r.uid, id: r.id } : null;
  if (['identify', 'reveal', 'take', 'forget'].includes(r.action)) return typeof r.key === 'string' && UNID_KEY.test(r.key) ? { action: r.action as 'identify', key: r.key } : null;
  return null;
}

/**
 * The writes for one request: to the player's satchel and to the DM's secrets. Throws a readable
 * error when it can't be done (already identified, not theirs any more …).
 */
export function unidPlan(req: UnidRequest, secrets: Record<string, SecretEntry>, holder: { unid?: Record<string, UnidLook> } | null, opts: { now: number; newKey: () => string }) {
  const sat: FieldOp[] = [];
  const sec: FieldOp[] = [];
  let uid: string;
  if (req.action === 'give') {
    uid = req.uid;
    if (req.look) {
      for (let i = 0; i < req.q; i++) {
        const k = opts.newKey();
        sat.push({ path: ['unid', k], set: { ...req.look, at: opts.now } });
        sec.push({ path: ['items', k], set: { uid, id: req.id, state: 'unid', at: opts.now, look: req.look.name, ...(req.curse ? { curse: req.curse } : {}) } });
      }
    } else {
      // Known to the player, but cursed: it goes in the satchel as usual, the curse stays with the DM.
      sat.push({ path: ['items', req.id], inc: req.q });
      sec.push({ path: ['items', opts.newKey()], set: { uid, id: req.id, state: 'known', at: opts.now, curse: req.curse } });
    }
    return { uid, satchel: sat, secrets: sec };
  }
  if (req.action === 'lift') return { uid: req.uid, satchel: [{ path: ['curses', req.id], del: true }] as FieldOp[], secrets: sec };
  const e = secrets[req.key];
  if (!e) throw new Error('That item isn’t on the list any more.');
  uid = e.uid;
  const held = e.state !== 'unid' || !!holder?.unid?.[req.key];
  if (req.action === 'forget') {
    if (e.state === 'unid' && held) throw new Error('Identify it or take it back instead.');
    sec.push({ path: ['items', req.key], del: true });
  } else if (req.action === 'take') {
    if (e.state !== 'unid') throw new Error('Take it back from DM tools → Hand out.');
    if (held) sat.push({ path: ['unid', req.key], del: true });
    sec.push({ path: ['items', req.key], del: true });
  } else {
    if (!held) throw new Error('They don’t carry it any more.');
    if (e.state === 'unid') {
      sat.push({ path: ['unid', req.key], del: true }, { path: ['items', e.id], inc: 1 });
    }
    if (req.action === 'reveal') {
      if (!e.curse) throw new Error('It has no curse.');
      sat.push({ path: ['curses', e.id], set: e.curse });
      sec.push({ path: ['items', req.key], del: true });
    } else if (e.state !== 'unid') {
      throw new Error('It’s already identified.');
    } else if (e.curse) sec.push({ path: ['items', req.key, 'state'], set: 'known' });
    else sec.push({ path: ['items', req.key], del: true });
  }
  return { uid, satchel: sat, secrets: sec };
}
