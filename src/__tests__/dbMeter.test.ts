import { describe, expect, it, vi } from 'vitest';
import { bulk, collectionOf, meterToday, pageOf, recordRead, recordWrite, resetMeter, RUNAWAY_WRITES } from '../lib/dbMeter';

// Node has EventTarget and CustomEvent; stand in for the browser window.
(globalThis as { window?: unknown }).window ??= new EventTarget();

describe('database meter', () => {
  it('groups by collection and page, leaving ids out', () => {
    expect(collectionOf('entities/abc')).toBe('entities');
    expect(collectionOf('scenes/s1/tokens/t1')).toBe('scenes/*/tokens');
    expect(collectionOf('codex/c1/satchels/u1')).toBe('codex/*/satchels');
    expect(pageOf('#/entity/abc')).toBe('/entity/*');
    expect(pageOf('#/battle/x?start=forge')).toBe('/battle/*');
    expect(pageOf('#/entity/new?type=npc')).toBe('/entity/new');
    expect(pageOf('')).toBe('/');
  });

  it('counts writes and reads', async () => {
    resetMeter();
    recordWrite('set', 'entities/a');
    recordWrite('update', 'entities/b');
    recordRead('entities', 5);
    await bulk('importing a pack', async () => recordWrite('set', 'entities/c'));
    const s = meterToday();
    expect(s.writes).toBe(3);
    expect(s.reads).toBe(5);
    expect(Object.keys(s.writeBy).some((k) => k === 'set entities @ importing a pack')).toBe(true);
  });

  it('warns about a burst of writes, but not during a bulk job', async () => {
    resetMeter();
    const seen = vi.fn();
    window.addEventListener('dndocs:runaway', seen);
    await bulk('deleting a campaign', async () => {
      for (let i = 0; i < RUNAWAY_WRITES + 50; i++) recordWrite('delete', `entities/${i}`);
    });
    expect(seen).not.toHaveBeenCalled();
    for (let i = 0; i <= RUNAWAY_WRITES; i++) recordWrite('update', 'codex/c1');
    expect(seen).toHaveBeenCalledTimes(1);
    expect((seen.mock.calls[0][0] as CustomEvent).detail.top).toMatch(/^update codex @ /);
    window.removeEventListener('dndocs:runaway', seen);
  });
});
