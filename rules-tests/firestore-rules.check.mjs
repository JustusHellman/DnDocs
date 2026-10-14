// Security rules checks, run against the Firestore emulator (see README.md).
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

let env;
const now = '2026-10-09T10:00:00.000Z';

const entity = (id, over = {}) => ({
  id,
  campaignId: 'c1',
  type: 'npc',
  name: id,
  content: '',
  tags: [],
  ownerId: 'dm',
  isPublic: false,
  allowedPlayers: [],
  createdAt: now,
  updatedAt: now,
  syncAt: serverTimestamp(),
  ...over,
});
/** Every write to an entry or link stamps the server's time (incremental sync). */
const stamp = () => ({ syncAt: serverTimestamp() });
const token = (id, over = {}) => ({
  id,
  campaignId: 'c1',
  name: id,
  x: 1,
  y: 1,
  size: 1,
  color: '#8e2020',
  entityId: null,
  controlledBy: [],
  hidden: false,
  conditions: [],
  initiative: null,
  vision: 0,
  health: null,
  updatedAt: now,
  ...over,
});
const scene = {
  id: 'cave',
  campaignId: 'c1',
  entityId: 'cave',
  name: 'Cave',
  active: true,
  grid: { cols: 20, ox: 0, oy: 0, show: true, snap: true, feet: 5, diagonal: '5e', color: '#000', opacity: 0.3 },
  fog: { mode: 'off', revealed: '', cols: 0, rows: 0 },
  walls: '',
  doors: '1,1,2,1',
  openDoors: [],
  combat: { active: true, round: 1, turn: 'brinTok', order: ['brinTok', 'gob'] },
  createdAt: now,
  updatedAt: now,
};

const as = (uid) => env.authenticatedContext(uid).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dndocs',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'campaigns/c1'), { id: 'c1', name: 'C', dmId: 'dm', players: ['p1', 'p2'], joinCode: 'ABC', createdAt: now });
    await setDoc(doc(db, 'campaigns/c2'), { id: 'c2', name: 'Other', dmId: 'x', players: [], joinCode: 'XYZ', createdAt: now });
    // A character the DM made for p2 (private), and one p1 made themselves.
    await setDoc(doc(db, 'entities/dmChar'), entity('dmChar', { type: 'character', playerId: 'p2', allowedPlayers: ['p2'], dmNotes: 'secret' }));
    await setDoc(doc(db, 'entities/p1Char'), entity('p1Char', { type: 'character', ownerId: 'p1', playerId: 'p1', isPublic: true, allowedPlayers: ['p1'] }));
    await setDoc(doc(db, 'entities/p1Note'), entity('p1Note', { type: 'note', ownerId: 'p1', allowedPlayers: ['p2', 'dm'] }));
    await setDoc(doc(db, 'scenes/cave'), scene);
    await setDoc(doc(db, 'scenes/cave/tokens/brinTok'), token('brinTok', { controlledBy: ['p1'] }));
    await setDoc(doc(db, 'scenes/cave/tokens/gob'), token('gob'));
    await setDoc(doc(db, 'scenes/cave/tokens/ambush'), token('ambush', { hidden: true }));
    await setDoc(doc(db, 'scenes/cave/drawings/d1'), { id: 'd1', campaignId: 'c1', by: 'p1', kind: 'line', color: '#f00', points: '0,0,1,1', shared: true, createdAt: now });
    await setDoc(doc(db, 'scenes/cave/drawings/trap'), { id: 'trap', campaignId: 'c1', by: 'dm', kind: 'rect', color: '#f00', points: '5,5,6,6', shared: false, createdAt: now });
    await setDoc(doc(db, 'scenes/cave/secret/dm'), { campaignId: 'c1', hp: { gob: { cur: 7, max: 7 } } });
  });
});

describe('player characters', () => {
  it('a player creates their own character, but not one for someone else, and no NPCs', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'entities/n1'), entity('n1', { type: 'character', ownerId: 'p1', playerId: 'p1' })));
    await assertFails(setDoc(doc(as('p1'), 'entities/n2'), entity('n2', { type: 'character', ownerId: 'p1', playerId: 'p2' })));
    await assertFails(setDoc(doc(as('p1'), 'entities/n3'), entity('n3', { ownerId: 'p1' })));
  });
  it('the DM creates one for a player', async () => {
    await assertSucceeds(setDoc(doc(as('dm'), 'entities/n4'), entity('n4', { type: 'character', playerId: 'p1', allowedPlayers: ['p1'] })));
  });
  it('the player of a DM-made character reads it and edits their sheet', async () => {
    await assertSucceeds(getDoc(doc(as('p2'), 'entities/dmChar')));
    await assertSucceeds(updateDoc(doc(as('p2'), 'entities/dmChar'), { name: 'Brin II', 'attributes.currentHp': '4', updatedAt: now, ...stamp() }));
  });
  it('…but not its sharing, DM secrets or who plays it', async () => {
    const ref = doc(as('p2'), 'entities/dmChar');
    await assertFails(updateDoc(ref, { isPublic: true, ...stamp() }));
    await assertFails(updateDoc(ref, { dmNotes: '', ...stamp() }));
    await assertFails(updateDoc(ref, { playerId: 'p1', ...stamp() }));
    await assertFails(updateDoc(ref, { allowedPlayers: ['p2', 'p1'], ...stamp() }));
    await assertFails(updateDoc(ref, { type: 'npc', ...stamp() }));
  });
  it('other players can neither read a private character nor edit a public one', async () => {
    await assertFails(getDoc(doc(as('p1'), 'entities/dmChar')));
    await assertFails(updateDoc(doc(as('p2'), 'entities/p1Char'), { name: 'Mine now', ...stamp() }));
  });
  it('the creating player chooses whether the party sees it', async () => {
    await assertSucceeds(updateDoc(doc(as('p1'), 'entities/p1Char'), { isPublic: false, updatedAt: now, ...stamp() }));
  });
  it('the DM edits any character', async () => {
    await assertSucceeds(updateDoc(doc(as('dm'), 'entities/p1Char'), { 'attributes.currentHp': '1', updatedAt: now, ...stamp() }));
  });
});

describe('incremental sync', () => {
  it('every write to an entry stamps the server time', async () => {
    const ref = doc(as('dm'), 'entities/p1Char');
    await assertFails(updateDoc(ref, { name: 'No stamp', updatedAt: now }));
    await assertFails(updateDoc(ref, { name: 'Made-up time', updatedAt: now, syncAt: Timestamp.fromMillis(Date.now() + 86_400_000) }));
    await assertSucceeds(updateDoc(ref, { name: 'Stamped', updatedAt: now, ...stamp() }));
  });
  const hint = (id, over) => ({ id, campaignId: 'c1', coll: 'entities', docId: 'p1Note', kind: 'deleted', at: serverTimestamp(), ...over });
  it('a deletion hint is only accepted once the document is gone', async () => {
    await assertFails(setDoc(doc(as('p1'), 'syncHints/h1'), hint('h1')));
    const b = writeBatch(as('p1'));
    b.delete(doc(as('p1'), 'entities/p1Note'));
    b.set(doc(as('p1'), 'syncHints/h2'), hint('h2'));
    await assertSucceeds(b.commit());
  });
  it('access hints come from the DM or the owner; reloads from the DM; never edited', async () => {
    await assertFails(setDoc(doc(as('p2'), 'syncHints/h3'), hint('h3', { kind: 'access', docId: 'p1Char' })));
    await assertSucceeds(setDoc(doc(as('p1'), 'syncHints/h4'), hint('h4', { kind: 'access', docId: 'p1Char' })));
    await assertSucceeds(setDoc(doc(as('dm'), 'syncHints/h5'), hint('h5', { kind: 'access', docId: 'dmChar' })));
    await assertFails(setDoc(doc(as('p1'), 'syncHints/h6'), hint('h6', { kind: 'resync', docId: '' })));
    await assertSucceeds(setDoc(doc(as('dm'), 'syncHints/h7'), hint('h7', { kind: 'resync', docId: '' })));
    await assertFails(setDoc(doc(as('dm'), 'syncHints/h8'), hint('h8', { kind: 'resync', docId: '', extra: 1 })));
    await assertFails(updateDoc(doc(as('dm'), 'syncHints/h7'), { kind: 'deleted' }));
  });
  it('members read the campaign’s hints, outsiders do not', async () => {
    await assertSucceeds(getDocs(query(collection(as('p2'), 'syncHints'), where('campaignId', '==', 'c1'), where('at', '>', Timestamp.fromMillis(0)))));
    await assertFails(getDocs(query(collection(as('stranger'), 'syncHints'), where('campaignId', '==', 'c1'))));
  });
  it('players can ask for only what changed', async () => {
    const since = where('syncAt', '>', Timestamp.fromMillis(0));
    await assertSucceeds(getDocs(query(collection(as('p1'), 'entities'), where('campaignId', '==', 'c1'), where('isPublic', '==', true), since)));
    await assertSucceeds(getDocs(query(collection(as('p1'), 'entities'), where('campaignId', '==', 'c1'), where('allowedPlayers', 'array-contains', 'p1'), since)));
    await assertFails(getDocs(query(collection(as('p1'), 'entities'), where('campaignId', '==', 'c1'), since)));
  });
});

describe('notes', () => {
  it('only their author edits a note, even when it is shared', async () => {
    await assertSucceeds(updateDoc(doc(as('p1'), 'entities/p1Note'), { content: 'mine', updatedAt: now, ...stamp() }));
    await assertFails(updateDoc(doc(as('p2'), 'entities/p1Note'), { content: 'hijacked', updatedAt: now, ...stamp() }));
  });
});

describe('battle maps', () => {
  it('only the DM creates and changes a scene; members read it, outsiders do not', async () => {
    await assertSucceeds(setDoc(doc(as('dm'), 'scenes/s2'), { ...scene, id: 's2' }));
    await assertFails(setDoc(doc(as('p1'), 'scenes/s3'), { ...scene, id: 's3' }));
    await assertSucceeds(getDoc(doc(as('p1'), 'scenes/cave')));
    await assertFails(getDoc(doc(as('outsider'), 'scenes/cave')));
    await assertFails(updateDoc(doc(as('p1'), 'scenes/cave'), { active: false }));
    await assertFails(updateDoc(doc(as('p1'), 'scenes/cave'), { 'grid.cols': 5 }));
  });
  it('players open doors', async () => {
    await assertSucceeds(updateDoc(doc(as('p1'), 'scenes/cave'), { openDoors: [0], updatedAt: now }));
  });
  it('players pass the turn on only from their own token’s turn', async () => {
    await assertSucceeds(updateDoc(doc(as('p1'), 'scenes/cave'), { 'combat.turn': 'gob', updatedAt: now }));
    // Now it's the goblin's turn: p1 can't move it on, and nobody else could before.
    await assertFails(updateDoc(doc(as('p1'), 'scenes/cave'), { 'combat.turn': 'brinTok', updatedAt: now }));
    await assertFails(updateDoc(doc(as('p2'), 'scenes/cave'), { 'combat.turn': 'brinTok', updatedAt: now }));
  });
  it('the scene list query used for the "Join battle" banner works for players', async () => {
    await assertSucceeds(getDocs(query(collection(as('p1'), 'scenes'), where('campaignId', '==', 'c1'), where('active', '==', true))));
  });
});

describe('tokens', () => {
  const tokens = (uid) => collection(as(uid), 'scenes/cave/tokens');
  it('players only ever get tokens that are not hidden', async () => {
    await assertSucceeds(getDocs(query(tokens('p1'), where('campaignId', '==', 'c1'), where('hidden', '==', false))));
    await assertFails(getDocs(query(tokens('p1'), where('campaignId', '==', 'c1'))));
    await assertFails(getDoc(doc(tokens('p1'), 'ambush')));
    await assertSucceeds(getDocs(query(tokens('dm'), where('campaignId', '==', 'c1'))));
  });
  it('a player still has their own token while the DM hides it (e.g. invisible)', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'scenes/cave/tokens/brinTok'), token('brinTok', { controlledBy: ['p1'], hidden: true })));
    await assertSucceeds(getDocs(query(tokens('p1'), where('campaignId', '==', 'c1'), where('controlledBy', 'array-contains', 'p1'))));
    await assertSucceeds(getDoc(doc(tokens('p1'), 'brinTok')));
    await assertFails(getDoc(doc(tokens('p2'), 'brinTok')));
    await assertFails(getDocs(query(tokens('p2'), where('campaignId', '==', 'c1'), where('controlledBy', 'array-contains', 'p1'))));
  });
  it('only the DM sets the order within a tie; a player’s new roll clears it', async () => {
    await assertSucceeds(updateDoc(doc(tokens('dm'), 'brinTok'), { initiative: 14, initTie: 2, updatedAt: now }));
    await assertFails(updateDoc(doc(tokens('p1'), 'brinTok'), { initTie: 5, updatedAt: now }));
    await assertSucceeds(updateDoc(doc(tokens('p1'), 'brinTok'), { initiative: 9, initTie: null, updatedAt: now }));
    await assertSucceeds(updateDoc(doc(tokens('p1'), 'brinTok'), { x: 3, updatedAt: now }));
  });
  it('players move their own tokens and nothing else', async () => {
    await assertSucceeds(updateDoc(doc(tokens('p1'), 'brinTok'), { x: 5, y: 6, updatedAt: now }));
    await assertSucceeds(updateDoc(doc(tokens('p1'), 'brinTok'), { initiative: 14, conditions: ['Prone'], updatedAt: now }));
    // Timed conditions, an aura and flying height on their own token.
    await assertSucceeds(updateDoc(doc(tokens('p1'), 'brinTok'), { conditions: ['Blessed'], timers: { Blessed: { round: 11, turn: 'brinTok' } }, aura: { radius: 15, color: '#f2b632' }, elevation: 20, updatedAt: now }));
    await assertFails(updateDoc(doc(tokens('p1'), 'brinTok'), { elevation: 'high' }));
    await assertFails(updateDoc(doc(tokens('p1'), 'gob'), { aura: { radius: 10, color: '#000' } }));
    await assertFails(updateDoc(doc(tokens('p1'), 'brinTok'), { hidden: true }));
    await assertFails(updateDoc(doc(tokens('p1'), 'brinTok'), { controlledBy: ['p1', 'p2'] }));
    await assertFails(updateDoc(doc(tokens('p1'), 'gob'), { x: 9 }));
    await assertFails(updateDoc(doc(tokens('p2'), 'brinTok'), { x: 9 }));
  });
  it('players place their own visible token only', async () => {
    await assertSucceeds(setDoc(doc(tokens('p2'), 't2'), token('t2', { controlledBy: ['p2'] })));
    await assertFails(setDoc(doc(tokens('p2'), 't3'), token('t3', { controlledBy: ['p1'] })));
    await assertFails(setDoc(doc(tokens('p2'), 't4'), token('t4', { controlledBy: ['p2'], hidden: true })));
    await assertFails(setDoc(doc(tokens('p2'), 't5'), token('t5', { controlledBy: ['p2'], campaignId: 'c2' })));
  });
  it('the DM places hidden monsters and changes anything', async () => {
    await assertSucceeds(setDoc(doc(tokens('dm'), 't6'), token('t6', { hidden: true })));
    await assertSucceeds(updateDoc(doc(tokens('dm'), 'gob'), { health: 'bloodied', name: 'Goblin boss' }));
  });
  it('players remove their own tokens; the DM removes any', async () => {
    await assertFails(deleteDoc(doc(tokens('p1'), 'gob')));
    await assertSucceeds(deleteDoc(doc(tokens('p1'), 'brinTok')));
    await assertSucceeds(deleteDoc(doc(tokens('dm'), 'gob')));
  });
});

describe('drawings, pings and secrets', () => {
  const drawings = (uid) => collection(as(uid), 'scenes/cave/drawings');
  const line = (id, by, shared) => ({ id, campaignId: 'c1', by, kind: 'free', color: '#000', points: '0,0,1,1', shared, createdAt: now });
  it('everyone draws as themselves and erases only their own (the DM erases any)', async () => {
    await assertSucceeds(setDoc(doc(drawings('p2'), 'd2'), line('d2', 'p2', true)));
    // A spell template (10 ft wide line).
    await assertSucceeds(setDoc(doc(drawings('p2'), 'tpl'), { ...line('tpl', 'p2', true), kind: 'beam', width: 2 }));
    await assertFails(setDoc(doc(drawings('p2'), 'd3'), line('d3', 'p1', true)));
    // Players' drawings are always shared.
    await assertFails(setDoc(doc(drawings('p2'), 'd4'), line('d4', 'p2', false)));
    await assertFails(updateDoc(doc(drawings('p1'), 'd1'), { color: '#0f0' }));
    // The DM can put back a player's drawing they erased (undo).
    await assertSucceeds(setDoc(doc(drawings('dm'), 'd9'), line('d9', 'p1', true)));
    await assertFails(deleteDoc(doc(drawings('p2'), 'd1')));
    await assertSucceeds(deleteDoc(doc(drawings('dm'), 'd1')));
  });
  it('the DM’s private drawings never reach players until shared', async () => {
    await assertSucceeds(getDocs(query(drawings('p1'), where('campaignId', '==', 'c1'), where('shared', '==', true))));
    await assertFails(getDocs(query(drawings('p1'), where('campaignId', '==', 'c1'))));
    await assertFails(getDoc(doc(drawings('p1'), 'trap')));
    await assertSucceeds(setDoc(doc(drawings('dm'), 'd5'), line('d5', 'dm', false)));
    await assertSucceeds(updateDoc(doc(drawings('dm'), 'trap'), { shared: true }));
    await assertSucceeds(getDoc(doc(drawings('p1'), 'trap')));
    await assertFails(updateDoc(doc(drawings('p1'), 'trap'), { shared: false }));
    await assertFails(updateDoc(doc(drawings('dm'), 'trap'), { color: '#0f0' }));
  });
  it('players cannot mark monsters as known or change their pictures', async () => {
    await assertFails(updateDoc(doc(as('p1'), 'scenes/cave/tokens/gob'), { known: true }));
    await assertFails(updateDoc(doc(as('p1'), 'scenes/cave/tokens/brinTok'), { img: 'data:x' }));
    await assertSucceeds(updateDoc(doc(as('dm'), 'scenes/cave/tokens/gob'), { known: true, img: 'data:image/webp;base64,AAA' }));
  });
  it('pings and shared measurements go in your own two slots', async () => {
    const live = (uid, id) => doc(as(uid), `scenes/cave/live/${id}`);
    const mark = { campaignId: 'c1', kind: 'ping', x: 1, y: 1, name: 'P', at: 1 };
    await assertSucceeds(setDoc(live('p1', 'p1'), { ...mark, id: 'p1' }));
    await assertSucceeds(setDoc(live('p1', 'p1-m'), { ...mark, id: 'p1-m', kind: 'measure' }));
    await assertFails(setDoc(live('p1', 'p2'), { ...mark, id: 'p2' }));
    await assertSucceeds(getDocs(query(collection(as('p2'), 'scenes/cave/live'), where('campaignId', '==', 'c1'))));
  });
  it('monster HP is for the DM only', async () => {
    await assertSucceeds(getDoc(doc(as('dm'), 'scenes/cave/secret/dm')));
    await assertSucceeds(setDoc(doc(as('dm'), 'scenes/cave/secret/dm'), { campaignId: 'c1', hp: { gob: { cur: 3, max: 7 } } }, { merge: true }));
    await assertFails(getDoc(doc(as('p1'), 'scenes/cave/secret/dm')));
    await assertFails(setDoc(doc(as('p1'), 'scenes/cave/secret/dm'), { hp: {} }));
  });
});

describe('jukebox', () => {
  const state = { envId: 'tavern', tracks: ['a'], seed: 1, lead: null, avoid: [], playing: true, anchorAt: 1, anchorPos: 0, fadeMs: 3000, rev: 1 };
  const jb = (uid, id = 'c1') => doc(as(uid), `jukebox/${id}`);
  it('only the DM picks the music; everyone in the campaign hears it', async () => {
    await assertSucceeds(setDoc(jb('dm'), { campaignId: 'c1', state, updatedBy: 'dm', updatedAt: 1 }, { merge: true }));
    await assertSucceeds(getDoc(jb('p1')));
    await assertFails(setDoc(jb('p1'), { campaignId: 'c1', state: { ...state, envId: 'boss' }, updatedBy: 'p1' }, { merge: true }));
    await assertFails(getDoc(jb('p1', 'c2')));
  });
  it('the document belongs to its own campaign and only holds jukebox fields', async () => {
    await assertFails(setDoc(jb('dm'), { campaignId: 'c2', state }));
    await assertFails(setDoc(jb('dm'), { campaignId: 'c1', state, other: 1 }));
    await assertFails(setDoc(jb('dm'), { campaignId: 'c1', state, updatedBy: 'p1' }));
    await assertSucceeds(setDoc(jb('dm'), { campaignId: 'c1', config: { customEnvs: { e1: { name: 'Lair', emoji: '🐉', tracks: [] } } } }));
  });
});

describe('link bundles', () => {
  const link = { id: 'l1', campaignId: 'c1', sourceId: 'a', targetId: 'b', targetName: 'B', label: 'Friend', reverseLabel: 'Friend', reverseId: '', v: 2, createdAt: now };
  const lb = (uid, id = 'c1__3') => doc(as(uid), `linkBundles/${id}`);
  it('the DM writes links into bundles; players in the campaign read them', async () => {
    await assertSucceeds(setDoc(lb('dm'), { campaignId: 'c1', n: 3, links: { l1: link } }, { merge: true }));
    await assertSucceeds(getDoc(lb('p1')));
    await assertSucceeds(getDocs(query(collection(as('p1'), 'linkBundles'), where('campaignId', '==', 'c1'))));
    await assertFails(setDoc(lb('p1'), { campaignId: 'c1', n: 3, links: { l2: link } }, { merge: true }));
  });
  it('a bundle belongs to the campaign its id names', async () => {
    await assertFails(setDoc(lb('dm', 'c2__3'), { campaignId: 'c1', n: 3, links: {} }));
    await assertFails(setDoc(lb('dm', 'c1__4'), { campaignId: 'c1', n: 3, links: {} }));
    await assertFails(setDoc(lb('dm', 'c2__3'), { campaignId: 'c2', n: 3, links: {} })); // not their campaign
  });
  it('outsiders can neither read nor write', async () => {
    await assertSucceeds(setDoc(lb('dm'), { campaignId: 'c1', n: 3, links: { l1: link } }));
    await assertFails(getDoc(lb('x')));
  });
});

describe('links after the move to bundles', () => {
  it('no new separate link documents once a campaign uses bundles', async () => {
    const rel = { id: 'r1', campaignId: 'c1', sourceId: 'a', targetId: 'b', targetName: 'B', label: 'Friend', reverseId: '', createdAt: now, syncAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(as('dm'), 'relationships/r1'), rel));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'campaigns/c1'), { linksV2: true }));
    await assertFails(setDoc(doc(as('dm'), 'relationships/r2'), { ...rel, id: 'r2' }));
    await assertSucceeds(deleteDoc(doc(as('dm'), 'relationships/r1'))); // tidying up stays possible
  });
});

describe('user profiles', () => {
  const profile = (uid, over = {}) => ({ uid, displayName: uid, email: `${uid}@example.com`, createdAt: now, ...over });
  it('people edit their own profile', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'users/p1'), profile('p1')));
    await assertSucceeds(updateDoc(doc(as('p1'), 'users/p1'), { displayName: 'Pip' }));
  });
  it('nobody gives themselves a role', async () => {
    await assertFails(setDoc(doc(as('p1'), 'users/p1'), profile('p1', { role: 'admin' })));
    await assertSucceeds(setDoc(doc(as('p1'), 'users/p1'), profile('p1')));
    await assertFails(updateDoc(doc(as('p1'), 'users/p1'), { role: 'admin' }));
  });
});

describe("Scavenger's Codex", () => {
  const party = (uid, id = 'c1') => doc(as(uid), `codex/${id}`);
  it('everyone in the campaign shares the party bag; outsiders cannot', async () => {
    await assertSucceeds(setDoc(party('p1'), { items: { 'dire-wolf-pelt': 2 }, clock: 8, known: {}, log: {}, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(party('p2'), { 'items.dire-wolf-pelt': increment(1), updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(party('dm')));
    await assertFails(getDoc(party('x')));
    await assertFails(updateDoc(party('x'), { clock: 9 }));
  });
  it('only the DM picks the homebrew', async () => {
    await assertSucceeds(setDoc(party('dm'), { items: {}, clock: 8, packs: ['rooted-city'] }));
    await assertFails(updateDoc(party('p1'), { packs: [] }));
    await assertSucceeds(updateDoc(party('dm'), { packs: [] }));
  });
  it('the party document only holds codex fields', async () => {
    await assertFails(setDoc(party('p1'), { items: {}, secret: 'x' }));
  });
  it('a satchel is its player’s and the DM’s, nobody else’s', async () => {
    const mine = (uid, who) => doc(as(uid), `codex/c1/satchels/${who}`);
    await assertSucceeds(setDoc(mine('p1', 'p1'), { items: { 'healers-moss': 3 }, prefs: {} }));
    await assertSucceeds(getDoc(mine('dm', 'p1')));
    await assertFails(getDoc(mine('p2', 'p1')));
    await assertFails(updateDoc(mine('p2', 'p1'), { 'items.healers-moss': 0 }));
  });
  it('homebrew packs: the DM adds them, everyone loads them', async () => {
    await assertSucceeds(setDoc(doc(as('dm'), 'codex/c1/packs/swamp'), { name: 'swamp', addedAt: now, data: '{}' }));
    await assertSucceeds(getDocs(collection(as('p1'), 'codex/c1/packs')));
    await assertFails(setDoc(doc(as('p1'), 'codex/c1/packs/mine'), { name: 'mine', data: '{}' }));
  });
});
