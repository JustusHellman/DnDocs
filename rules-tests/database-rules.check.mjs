// Realtime Database rules checks (the table chat's live state), run against the emulator.
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, set, update, get } from 'firebase/database';

let env;
const room = 'rooms/c1';
const db = (uid) => env.authenticatedContext(uid).database();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dndocs',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled((c) => set(ref(c.database(), room), { owner: 'dm', members: { dm: 'dm', p1: 'player', p2: 'player' } }));
});

describe('play (the trackers and the turn helper)', () => {
  const lyra = `${room}/play/c_lyra`;
  it('a player writes their own character’s state', () => assertSucceeds(set(ref(db('p1'), lyra), { uid: 'p1', name: 'Lyra', ac: 1, ba: 1, re: 1, mv: 25, dx: 1, sp: 15, aa: 2 })));
  it('…but not someone else’s', async () => {
    await env.withSecurityRulesDisabled((c) => set(ref(c.database(), lyra), { uid: 'p1', name: 'Lyra' }));
    await assertFails(update(ref(db('p2'), lyra), { ac: 1 }));
  });
  it('the DM writes anyone’s (a new turn resets them)', async () => {
    await env.withSecurityRulesDisabled((c) => set(ref(c.database(), lyra), { uid: 'p1', name: 'Lyra', ac: 1 }));
    await assertSucceeds(update(ref(db('dm'), lyra), { ac: null, ba: null, re: null, mv: null, aa: null }));
  });
  it('a monster’s recharges and legendary actions', () => assertSucceeds(set(ref(db('dm'), `${room}/play/t_drake`), { uid: 'dm', name: 'Drake', rc: { 'sb-1-fire-breath': 5 }, la: 2 })));
  it('checks the numbers', async () => {
    await assertFails(set(ref(db('p1'), lyra), { uid: 'p1', ac: 10 }));
    await assertFails(set(ref(db('p1'), lyra), { uid: 'p1', sp: 16 }));
    await assertFails(set(ref(db('dm'), `${room}/play/t_drake`), { uid: 'dm', rc: { x: 7 } }));
    await assertFails(set(ref(db('p1'), lyra), { uid: 'p1', ba: 2 }));
  });
  it('refuses fields it doesn’t know', () => assertFails(set(ref(db('p1'), lyra), { uid: 'p1', hacked: 1 })));
  it('only members read it', async () => {
    await assertSucceeds(get(ref(db('p2'), `${room}/play`)));
    await assertFails(get(ref(db('stranger'), `${room}/play`)));
  });
});

describe('the DM’s private marks', () => {
  it('only the DM reads and writes them', async () => {
    await assertSucceeds(set(ref(db('dm'), `${room}/dmplay/t_drake/conc`), 1));
    await assertFails(get(ref(db('p1'), `${room}/dmplay`)));
    await assertFails(set(ref(db('p1'), `${room}/dmplay/t_drake/conc`), 1));
  });
});

describe('spells (campaign cards and written descriptions)', () => {
  const note = (by, x = 'A cloak of ice.') => ({ by, n: 'Armor of Agathys', j: JSON.stringify({ x }), at: Date.now() });
  it('anyone at the table writes a description, and anyone may improve it', async () => {
    await assertSucceeds(set(ref(db('p1'), `${room}/spells/armor-of-agathys`), note('p1')));
    await assertSucceeds(set(ref(db('p2'), `${room}/spells/armor-of-agathys`), note('p2', 'Better words.')));
  });
  it('…signed with their own name', () => assertFails(set(ref(db('p2'), `${room}/spells/armor-of-agathys`), note('p1'))));
  it('a campaign card stays its writer’s (and the DM’s)', async () => {
    await assertSucceeds(set(ref(db('p1'), `${room}/spells/x-mine`), note('p1')));
    await assertFails(set(ref(db('p2'), `${room}/spells/x-mine`), note('p2')));
    await assertSucceeds(set(ref(db('dm'), `${room}/spells/x-mine`), note('dm')));
  });
});
