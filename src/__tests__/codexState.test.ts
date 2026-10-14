import { describe, expect, it } from 'vitest';
import {
  codexKeys,
  KEY_HOMEBREW,
  KEY_PARTY,
  KEY_SATCHEL,
  logKey,
  packChanges,
  partyOps,
  pruneLogOps,
  satchelOps,
  toCodexParty,
  type CodexParty,
  type PartyDoc,
} from '../lib/codex/state';

const party = (over: Partial<CodexParty> = {}): CodexParty => ({ ...toCodexParty(null), ...over });

/** Applies ops to a plain object the way Firestore would (for checking round trips). */
function apply(doc: Record<string, unknown>, ops: ReturnType<typeof partyOps>) {
  const out = JSON.parse(JSON.stringify(doc));
  for (const op of ops) {
    let o = out;
    for (const k of op.path.slice(0, -1)) o = o[k] ??= {};
    const last = op.path[op.path.length - 1];
    if ('inc' in op) o[last] = (o[last] ?? 0) + op.inc;
    else if ('del' in op) delete o[last];
    else o[last] = op.set;
  }
  return out;
}

describe('codex party ↔ Firestore', () => {
  it('turns quantity changes into increments, so two players adding at once both count', () => {
    const before = party({ items: { 'dire-wolf-pelt': 2 } });
    const a = partyOps(before, party({ items: { 'dire-wolf-pelt': 3 } }), { isDM: false });
    const b = partyOps(before, party({ items: { 'dire-wolf-pelt': 2, 'healers-moss': 1 } }), { isDM: false });
    expect(a).toEqual([{ path: ['items', 'dire-wolf-pelt'], inc: 1 }]);
    const doc = apply(apply({ items: { 'dire-wolf-pelt': 2 }, clock: 8 }, a), b);
    expect(toCodexParty(doc as PartyDoc).items).toEqual({ 'dire-wolf-pelt': 3, 'healers-moss': 1 });
  });

  it('removes an item by taking its quantity away; zero or less disappears', () => {
    const ops = partyOps(party({ items: { bone: 2 } }), party({ items: {} }), { isDM: false });
    expect(ops).toEqual([{ path: ['items', 'bone'], inc: -2 }]);
    expect(toCodexParty({ items: { bone: 0, fang: -1, hide: 2 } }).items).toEqual({ hide: 2 });
  });

  it('moves the clock by the difference', () => {
    expect(partyOps(party({ clock: 8 }), party({ clock: 32 }), { isDM: false })).toEqual([{ path: ['clock'], inc: 24 }]);
  });

  it('only adds discoveries and log lines; formulas can be unlearned', () => {
    const before = party({ known: ['t:bone'], learned: ['cloak'], log: [{ at: 1, text: 'old' }] });
    const after = party({ known: ['t:bone', 'm:dire-wolf'], learned: [], log: [{ at: 2, text: 'new' }, { at: 1, text: 'old' }] });
    expect(partyOps(before, after, { isDM: false })).toEqual([
      { path: ['learned', 'cloak'], del: true },
      { path: ['known', 'm:dire-wolf'], set: true },
      { path: ['log', logKey({ at: 2, text: 'new' })], set: { at: 2, clock: null, text: 'new' } },
    ]);
  });

  it('keeps workbench projects and garden beds as separate entries, in order', () => {
    const p1 = { uid: 'a', id: 'cloak', done: 1, parts: [['x', 1, 0]] };
    const p2 = { uid: 'b', id: 'rope', done: 0 };
    const ops = partyOps(party({ projects: [p1] }), party({ projects: [{ ...p1, done: 2 }, p2] }), { isDM: false, now: 100 });
    expect(ops).toEqual([
      { path: ['projects', 'a', 'j'], set: JSON.stringify({ ...p1, done: 2 }) },
      { path: ['projects', 'b'], set: { o: 101, j: JSON.stringify(p2) } },
    ]);
    const doc = apply({ projects: { a: { o: 5, j: JSON.stringify(p1) } } }, ops);
    expect(toCodexParty(doc as PartyDoc).projects).toEqual([{ ...p1, done: 2 }, p2]);
  });

  it('lets only the DM change the homebrew in play', () => {
    const before = party({ packs: null }), after = party({ packs: ['rooted-city'] });
    expect(partyOps(before, after, { isDM: false })).toEqual([]);
    expect(partyOps(before, after, { isDM: true })).toEqual([{ path: ['packs'], set: ['rooted-city'] }]);
  });

  it('round-trips a whole party through Firestore', () => {
    const full = party({
      items: { bone: 3 },
      learned: ['cloak'],
      known: ['t:bone'],
      research: { cloak: 2 },
      log: [{ at: 5, clock: 9, text: 'Harvested' }],
      session: { at: 1, clock: 8, name: 'S1' },
      clock: 30,
      stamps: { bone: [{ at: 8, q: 3, pres: false }] },
      projects: [{ uid: 'a', id: 'cloak', parts: [['bone', 1, 1]] }],
      beds: [{ uid: 'g', site: 'plot', p: { id: 'moss' } }],
      spoil: true,
      packs: ['core-cookbook'],
    });
    const doc = apply({ items: {}, clock: 8 }, partyOps(null, full, { isDM: true, now: 1 }));
    expect(toCodexParty(doc as PartyDoc)).toEqual(full);
  });

  it('trims the log to its newest lines', () => {
    const log = Object.fromEntries([1, 2, 3].map((at) => [`k${at}`, { at, text: String(at) }]));
    expect(pruneLogOps({ log }, 2)).toEqual([{ path: ['log', 'k1'], del: true }]);
  });
});

describe('a player’s satchel and settings', () => {
  it('saves quantities as increments and settings as text; device-only keys stay on the device', () => {
    expect(satchelOps(KEY_SATCHEL, { bone: 1 }, { bone: 3 })).toEqual([{ path: ['items', 'bone'], inc: 2 }]);
    expect(satchelOps('scavengers-codex.theme', 'light', 'dark')).toEqual([{ path: ['prefs', 'scavengers-codex.theme'], set: '"dark"' }]);
    expect(satchelOps('scavengers-codex.dmUnlocked', null, 'x')).toEqual([]);
    expect(satchelOps(KEY_PARTY, null, {})).toEqual([]);
  });
});

describe('what the codex is given', () => {
  it('builds the codex’s storage keys from the documents', () => {
    const keys = codexKeys({ items: { bone: 2 }, clock: 10 }, { items: { moss: 1 }, prefs: { 'scavengers-codex.theme': '"dark"' } }, [{ name: 'swamp', data: '{"homebrew":{"name":"swamp"}}' }]);
    expect((keys[KEY_PARTY] as CodexParty).items).toEqual({ bone: 2 });
    expect(keys[KEY_SATCHEL]).toEqual({ moss: 1 });
    expect(keys['scavengers-codex.theme']).toBe('dark');
    expect(keys[KEY_HOMEBREW]).toEqual([{ name: 'swamp', addedAt: undefined, data: { homebrew: { name: 'swamp' } } }]);
  });
  it('notices homebrew added and removed', () => {
    expect(packChanges([{ name: 'a', data: {} }], [{ name: 'b', data: {} }])).toEqual({ put: [{ name: 'b', data: {} }], remove: ['a'] });
  });
});
