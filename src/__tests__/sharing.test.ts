import { describe, expect, it } from 'vitest';
import { canViewEntity, canViewField } from '../lib/permissions';
import { derivedPlayers, lockableKeys, planFieldToggle, planReveal, fieldState, initialRevealTicks, toV3 } from '../lib/sharing';
import type { Entity, User } from '../types';

const players: User[] = ['p1', 'p2', 'p3'].map((uid) => ({ uid, displayName: uid.toUpperCase(), email: '', createdAt: '' }) as User);
const dm = { uid: 'dm', isDM: true };
const as = (uid: string) => ({ uid, isDM: false });

const npc = (over: Partial<Entity> = {}): Entity => ({
  id: 'e1',
  campaignId: 'c',
  type: 'npc',
  name: 'Mira',
  content: 'Keeps the inn.',
  tags: ['act2'],
  ownerId: 'dm',
  isPublic: false,
  allowedPlayers: [],
  attributes: { race: 'Half-elf', alignment: 'Neutral', partyInteraction: 'Plans to betray them' },
  statBlock: 'AC 12',
  createdAt: '',
  updatedAt: '',
  ...over,
});
const apply = (e: Entity, plan: { update: Partial<Entity> }) => ({ ...e, ...plan.update }) as Entity;
const visibleTo = (e: Entity, uid: string) => lockableKeys(e).filter((k) => canViewField(as(uid), e, k));

describe('moving to the current model keeps what every player sees', () => {
  const cases: [string, Entity][] = [
    ['oldest public', npc({ isPublic: true, fieldPermissions: { alignment: { isPublic: false, allowedPlayers: [] } } })],
    ['oldest shared', npc({ allowedPlayers: ['p1'], fieldPermissions: { race: { isPublic: false, allowedPlayers: ['p1'] } } })],
    ['oldest secret with a public field', npc({ allowedPlayers: ['p1', 'p2', 'p3'], fieldPermissions: { race: { isPublic: true, allowedPlayers: [] } } })],
    ['oldest secret, knowledge note', npc({ allowedPlayers: ['p2'], playerKnowledge: { p2: 'You met him once' }, fieldPermissions: { race: { isPublic: true, allowedPlayers: [] } } })],
    ['v2 shared', npc({ shareV: 2, sharedWith: ['p1'], allowedPlayers: ['p1'], fieldPermissions: { tags: { isPublic: false, allowedPlayers: [] } } })],
    ['v2 shared, private field for another player', npc({ shareV: 2, sharedWith: ['p1'], allowedPlayers: ['p1', 'p2'], fieldPermissions: { alignment: { isPublic: false, allowedPlayers: ['p2'] } } })],
    ['v2 without sharedWith', npc({ shareV: 2, allowedPlayers: ['p1'] })],
    ['v2 secret', npc({ shareV: 2 })],
  ];
  for (const [name, e] of cases) {
    it(name, () => {
      const after = toV3(e);
      for (const p of players) {
        expect(canViewEntity(as(p.uid), after)).toBe(canViewEntity(as(p.uid), e));
        expect(visibleTo(after, p.uid)).toEqual(visibleTo(e, p.uid));
      }
    });
  }
});

describe('saving an older entry in the editor', () => {
  it('keeps every player who could open it', () => {
    const legacy = [
      npc({ allowedPlayers: ['p1'], fieldPermissions: { race: { isPublic: false, allowedPlayers: ['p1'] } } }),
      npc({ allowedPlayers: ['p1', 'p2', 'p3'], fieldPermissions: { race: { isPublic: true, allowedPlayers: [] } } }),
      npc({ shareV: 2, sharedWith: ['p1'], allowedPlayers: ['p1', 'p2'], fieldPermissions: { alignment: { isPublic: false, allowedPlayers: ['p2'] } } }),
    ];
    for (const e of legacy) {
      const draft = toV3(e);
      const saved = [...new Set([...(draft.sharedWith ?? []), ...derivedPlayers(draft, draft.sharedWith ?? [], players)])].sort();
      expect(saved).toEqual([...(e.allowedPlayers ?? [])].sort());
    }
  });
});

describe('players with only a "what you know" note', () => {
  it('do not see fields the DM is preparing', () => {
    const e = npc({ shareV: 3, allowedPlayers: ['p1'], playerKnowledge: { p1: 'A rumour' } });
    const after = apply(e, planFieldToggle(e, 'race', players));
    expect(fieldState(after, 'race', players)).toBe('prepared');
    expect(canViewEntity(as('p1'), after)).toBe(true);
    expect(visibleTo(after, 'p1')).toEqual([]);
  });
});

describe('Reveal', () => {
  it('ticks the usual fields and keeps DM material back', () => {
    const ticks = initialRevealTicks(npc({ shareV: 3 }), players);
    expect([...ticks].sort()).toEqual(['content', 'race']);
  });

  it('reveals the entry to chosen players with exactly the ticked fields', () => {
    const e = npc({ shareV: 3 });
    const plan = planReveal(e, { everyone: false, players: ['p1'] }, ['content', 'race'], players, 1);
    const after = apply(e, plan);
    expect(canViewEntity(as('p1'), after)).toBe(true);
    expect(canViewEntity(as('p2'), after)).toBe(false);
    expect(visibleTo(after, 'p1').sort()).toEqual(['content', 'race']);
    expect(plan.newAccess).toEqual(['p1']);
    expect(after.reveals?.[0]).toEqual({ at: 1, to: ['p1'], fields: ['content', 'race'] });
    expect(canViewEntity(dm, after)).toBe(true);
  });

  it('reveals more later, and only to whom you choose', () => {
    let e = npc({ shareV: 3 });
    e = apply(e, planReveal(e, { everyone: false, players: ['p1', 'p2'] }, ['content'], players));
    // Mira alone learns the secret.
    const plan = planReveal(e, { everyone: false, players: ['p1'] }, ['partyInteraction'], players);
    e = apply(e, plan);
    expect(plan.newAccess).toEqual([]);
    expect(plan.newFields).toEqual(['partyInteraction']);
    expect(visibleTo(e, 'p1')).toContain('partyInteraction');
    expect(visibleTo(e, 'p2')).not.toContain('partyInteraction');
  });

  it('does not leak a field shown to existing viewers to a new player who did not get it ticked', () => {
    let e = npc({ shareV: 3 });
    e = apply(e, planReveal(e, { everyone: false, players: ['p1'] }, ['content', 'race'], players));
    e = apply(e, planReveal(e, { everyone: false, players: ['p2'] }, ['content'], players));
    expect(visibleTo(e, 'p2')).toEqual(['content']);
    expect(visibleTo(e, 'p1').sort()).toEqual(['content', 'race']);
  });

  it('to everyone makes the entry public with the ticked fields', () => {
    const e = npc({ shareV: 3 });
    const after = apply(e, planReveal(e, { everyone: true, players: [] }, ['content'], players));
    expect(after.isPublic).toBe(true);
    for (const p of players) expect(visibleTo(after, p.uid)).toEqual(['content']);
  });

  it('upgrading an old shared entry while revealing keeps old viewers’ view', () => {
    const e = npc({ allowedPlayers: ['p1'], fieldPermissions: { race: { isPublic: false, allowedPlayers: ['p1'] } } });
    const before = visibleTo(e, 'p1');
    const after = apply(e, planReveal(e, { everyone: false, players: ['p2'] }, ['content'], players));
    expect(visibleTo(after, 'p1')).toEqual(before);
    expect(visibleTo(after, 'p2')).toEqual(['content']);
  });
});

describe('per-field switch', () => {
  it('prepares fields on a secret entry without revealing anything', () => {
    const e = npc({ shareV: 3 });
    expect(fieldState(e, 'content', players)).toBe('hidden');
    const after = apply(e, planFieldToggle(e, 'content', players));
    expect(fieldState(after, 'content', players)).toBe('prepared');
    expect(canViewEntity(as('p1'), after)).toBe(false);
    expect(after.reveals).toBeUndefined();
  });
  it('reveals to current viewers only, and hides again', () => {
    let e = npc({ shareV: 3, sharedWith: ['p1'], allowedPlayers: ['p1'], fieldPermissions: {} });
    e = apply(e, planFieldToggle(e, 'race', players));
    expect(visibleTo(e, 'p1')).toContain('race');
    expect(fieldState(e, 'race', players)).toBe('shown');
    // A player added later doesn't get it automatically.
    e = apply(e, planReveal(e, { everyone: false, players: ['p2'] }, [], players));
    expect(visibleTo(e, 'p2')).toEqual([]);
    expect(fieldState(e, 'race', players)).toBe('some');
    e = apply(e, planFieldToggle(e, 'race', players)); // hides rather than spreading p1's knowledge
    expect(visibleTo(e, 'p1')).not.toContain('race');
  });
});

describe('Reveal panel starting ticks', () => {
  it('a later reveal starts from what every viewer knows, not the defaults', () => {
    let e = npc({ shareV: 3 });
    e = apply(e, planReveal(e, { everyone: false, players: ['p1'] }, ['content'], players));
    expect([...initialRevealTicks(e, players)]).toEqual(['content']);
  });
  it('but a secret told to the only viewer is not pre-ticked', () => {
    let e = npc({ shareV: 3 });
    e = apply(e, planReveal(e, { everyone: false, players: ['p1'] }, ['content', 'partyInteraction'], players));
    expect([...initialRevealTicks(e, players)]).toEqual(['content']);
  });
});
