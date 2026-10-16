import { describe, expect, it } from 'vitest';
import {
  cleanSecrets,
  cleanUnidRequest,
  codexKeys,
  fmtCoins,
  isPrefKey,
  KEY_CURSES,
  KEY_SECRETS,
  KEY_UNID,
  unidPlan,
  KEY_HOMEBREW,
  KEY_PARTY,
  KEY_PURSE,
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
      cp: 1250,
      goals: ['cloak'],
    });
    const doc = apply({ items: {}, clock: 8 }, partyOps(null, full, { isDM: true, now: 1 }));
    expect(toCodexParty(doc as PartyDoc)).toEqual(full);
  });

  it('keeps party goals as a set', () => {
    expect(partyOps(party({ goals: ['cloak'] }), party({ goals: ['cloak', 'rope'] }), { isDM: false })).toEqual([{ path: ['goals', 'rope'], set: true }]);
    expect(partyOps(party({ goals: ['cloak'] }), party({ goals: [] }), { isDM: false })).toEqual([{ path: ['goals', 'cloak'], del: true }]);
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
  it('keeps coin as a count of copper, changed by increments', () => {
    expect(satchelOps(KEY_PURSE, 500, 350)).toEqual([{ path: ['cp'], inc: -150 }]);
    expect(satchelOps(KEY_PURSE, null, 20)).toEqual([{ path: ['cp'], inc: 20 }]);
    expect(partyOps(party({ cp: 100 }), party({ cp: 1100 }), { isDM: false })).toEqual([{ path: ['cp'], inc: 1000 }]);
    expect(toCodexParty({ cp: -30 }).cp).toBe(0);
  });
});

describe('what the codex is given', () => {
  it('builds the codex’s storage keys from the documents', () => {
    const keys = codexKeys({ items: { bone: 2 }, clock: 10 }, { items: { moss: 1 }, prefs: { 'scavengers-codex.theme': '"dark"' } }, [{ name: 'swamp', data: '{"homebrew":{"name":"swamp"}}' }]);
    expect((keys[KEY_PARTY] as CodexParty).items).toEqual({ bone: 2 });
    expect(keys[KEY_SATCHEL]).toEqual({ moss: 1 });
    expect(keys[KEY_PURSE]).toBe(0);
    expect(keys['scavengers-codex.theme']).toBe('dark');
    expect(keys[KEY_HOMEBREW]).toEqual([{ name: 'swamp', addedAt: undefined, data: { homebrew: { name: 'swamp' } } }]);
  });
  it('notices homebrew added and removed', () => {
    expect(packChanges([{ name: 'a', data: {} }], [{ name: 'b', data: {} }])).toEqual({ put: [{ name: 'b', data: {} }], remove: ['a'] });
  });
});

describe('coin', () => {
  it('shows copper as gp, sp and cp', () => {
    expect(fmtCoins(0)).toBe('0 gp');
    expect(fmtCoins(1250)).toBe('12 gp 5 sp');
    expect(fmtCoins(123456)).toBe('1,234 gp 5 sp 6 cp');
    expect(fmtCoins(7)).toBe('7 cp');
  });
});

describe('SRD stat blocks from the codex', () => {
  it('become DnDocs stat block fields', async () => {
    const { toDndStats, hasStats } = await import('../lib/codex/catalog');
    const out = toDndStats({ ac: '14 (natural armor)', hp: '37 (5d10 + 10)', speed: '50 ft.', ab: [17, 15, 15, 3, 12, 7], skills: 'Perception +3', senses: 'passive Perception 13', languages: '—', cr: '1 (200 XP)', pb: '+2', size: 'Large', type: 'beast', align: 'unaligned', text: '***Bite.*** Hit.', ed: '2014' });
    expect(out.dndStats).toMatchObject({ armorClass: '14 (natural armor)', hitPoints: '37 (5d10 + 10)', str: 17, cha: 7, challenge: '1 (200 XP)' });
    expect(out.statBlock).toBe('*Large beast, unaligned*\n\n***Bite.*** Hit.');
    expect(hasStats(out.dndStats)).toBe(true);
    expect(hasStats({ ...out.dndStats, armorClass: '', hitPoints: ' ' })).toBe(false);
  });
});

describe('unidentified and cursed items', () => {
  const keys = () => {
    let n = 0;
    return () => `key00${++n}`;
  };
  const opts = () => ({ now: 5, newKey: keys() });

  it('accepts only sensible requests', () => {
    expect(cleanUnidRequest({ action: 'give', uid: 'p1', id: 'ring-of-protection', q: 1, look: { name: 'Unidentified ring', tier: 'rare', att: true } })).toEqual({
      action: 'give', uid: 'p1', id: 'ring-of-protection', q: 1, look: { name: 'Unidentified ring', tier: 'rare', att: true }, curse: '',
    });
    expect(cleanUnidRequest({ action: 'give', uid: 'p1', id: 'rope', q: 1, look: null })).toBeNull(); // nothing secret about it
    expect(cleanUnidRequest({ action: 'give', uid: 'p1', id: 'rope', q: 50, curse: 'x' })).toBeNull();
    expect(cleanUnidRequest({ action: 'give', uid: 'p1', id: 'Bad Id', q: 1, curse: 'x' })).toBeNull();
    expect(cleanUnidRequest({ action: 'identify', key: 'key001' })).toEqual({ action: 'identify', key: 'key001' });
    expect(cleanUnidRequest({ action: 'explode', key: 'key001' })).toBeNull();
  });

  it('an unidentified item: the player gets the look, the DM keeps the truth', () => {
    const req = cleanUnidRequest({ action: 'give', uid: 'p1', id: 'berserker-axe', q: 2, look: { name: 'Unidentified axe', tier: 'rare' }, curse: 'Rage when hurt' })!;
    const p = unidPlan(req, {}, null, opts());
    expect(p.uid).toBe('p1');
    expect(p.satchel).toEqual([
      { path: ['unid', 'key001'], set: { name: 'Unidentified axe', tier: 'rare', at: 5 } },
      { path: ['unid', 'key002'], set: { name: 'Unidentified axe', tier: 'rare', at: 5 } },
    ]);
    expect(JSON.stringify(p.satchel)).not.toContain('berserker');
    expect(JSON.stringify(p.satchel)).not.toContain('Rage');
    expect(p.secrets[0]).toEqual({ path: ['items', 'key001'], set: { uid: 'p1', id: 'berserker-axe', state: 'unid', at: 5, look: 'Unidentified axe', curse: 'Rage when hurt' } });
  });

  it('a known but cursed item goes in the satchel as usual', () => {
    const p = unidPlan(cleanUnidRequest({ action: 'give', uid: 'p1', id: 'weapon-1', q: 1, curse: 'Hums at night' })!, {}, null, opts());
    expect(p.satchel).toEqual([{ path: ['items', 'weapon-1'], inc: 1 }]);
    expect(p.secrets).toEqual([{ path: ['items', 'key001'], set: { uid: 'p1', id: 'weapon-1', state: 'known', at: 5, curse: 'Hums at night' } }]);
  });

  const secrets = cleanSecrets({
    key001: { uid: 'p1', id: 'ring-of-protection', state: 'unid', at: 1 },
    key002: { uid: 'p1', id: 'berserker-axe', state: 'unid', at: 1, curse: 'Rage' },
    key003: { uid: 'p1', id: 'weapon-1', state: 'known', at: 1, curse: 'Hums' },
  });
  const holder = { unid: { key001: { name: 'Unidentified ring' }, key002: { name: 'Unidentified axe' } } };

  it('identify: the real item replaces the look; a curse stays hidden', () => {
    expect(unidPlan({ action: 'identify', key: 'key001' }, secrets, holder, opts())).toEqual({
      uid: 'p1',
      satchel: [{ path: ['unid', 'key001'], del: true }, { path: ['items', 'ring-of-protection'], inc: 1 }],
      secrets: [{ path: ['items', 'key001'], del: true }],
    });
    const cursed = unidPlan({ action: 'identify', key: 'key002' }, secrets, holder, opts());
    expect(cursed.secrets).toEqual([{ path: ['items', 'key002', 'state'], set: 'known' }]);
    expect(JSON.stringify(cursed.satchel)).not.toContain('Rage');
  });

  it('reveal: the curse goes to the player (identifying it too if needed)', () => {
    expect(unidPlan({ action: 'reveal', key: 'key003' }, secrets, holder, opts()).satchel).toEqual([{ path: ['curses', 'weapon-1'], set: 'Hums' }]);
    expect(unidPlan({ action: 'reveal', key: 'key002' }, secrets, holder, opts()).satchel).toEqual([
      { path: ['unid', 'key002'], del: true },
      { path: ['items', 'berserker-axe'], inc: 1 },
      { path: ['curses', 'berserker-axe'], set: 'Rage' },
    ]);
    expect(() => unidPlan({ action: 'reveal', key: 'key001' }, secrets, holder, opts())).toThrow(/no curse/);
  });

  it('take back, forget, and things that are gone', () => {
    expect(unidPlan({ action: 'take', key: 'key001' }, secrets, holder, opts()).satchel).toEqual([{ path: ['unid', 'key001'], del: true }]);
    expect(() => unidPlan({ action: 'forget', key: 'key001' }, secrets, holder, opts())).toThrow();
    expect(unidPlan({ action: 'forget', key: 'key001' }, secrets, { unid: {} }, opts()).secrets).toEqual([{ path: ['items', 'key001'], del: true }]);
    expect(() => unidPlan({ action: 'identify', key: 'key001' }, secrets, { unid: {} }, opts())).toThrow(/any more/);
    expect(() => unidPlan({ action: 'identify', key: 'nope00' }, secrets, holder, opts())).toThrow();
  });

  it('the codex gets the looks and revealed curses; only the DM gets the secrets', () => {
    const sat = { items: {}, unid: { key001: { name: 'Unidentified ring', tier: 'rare' } }, curses: { 'weapon-1': 'Hums' } };
    const k = codexKeys(null, sat, []);
    expect(k[KEY_UNID]).toEqual({ key001: { name: 'Unidentified ring', tier: 'rare' } });
    expect(k[KEY_CURSES]).toEqual({ 'weapon-1': 'Hums' });
    expect(KEY_SECRETS in k).toBe(false);
    expect(codexKeys(null, sat, [], { items: { key001: { uid: 'p1', id: 'ring-of-protection', state: 'unid', at: 1 } } })[KEY_SECRETS]).toEqual({
      key001: { uid: 'p1', id: 'ring-of-protection', state: 'unid', at: 1 },
    });
    // The codex can't write these back itself.
    expect(isPrefKey(KEY_UNID) || isPrefKey(KEY_CURSES) || isPrefKey(KEY_SECRETS)).toBe(false);
    expect(satchelOps(KEY_UNID, {}, { x: 1 })).toEqual([]);
  });
});
