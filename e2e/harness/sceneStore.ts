import type { Drawing, Scene, Token } from '../../src/types';
const now = new Date().toISOString();
export const scene: Scene = {
  id: 'vault', campaignId: 'c1', entityId: 'vault', name: 'The Sunken Vault', active: true,
  grid: { cols: 20, ox: 0, oy: 0, show: true, snap: true, feet: 5, diagonal: '5e', color: '#000000', opacity: 0.25 },
  fog: { mode: 'off', revealed: '', cols: 0, rows: 0 }, walls: '', doors: '', openDoors: [],
  combat: { active: true, round: 2, turn: 'tlyra', order: ['tlyra', 'gob1', 'tbrom', 'gob2'] } as never, createdAt: now, updatedAt: now,
};
const t = (id: string, name: string, x: number, y: number, color: string, entityId: string | null, ctl: string[], init: number): Token =>
  ({ id, campaignId: 'c1', name, x, y, size: 1, color, entityId, controlledBy: ctl, conditions: [], initiative: init, vision: 0, hidden: false, health: 'healthy', known: true, timers: {}, img: null, elevation: 0, aura: null, updatedAt: now }) as unknown as Token;
export let tokens: Token[] = [
  t('tlyra', 'Lyra Starwhisper', 8, 6, '#7c3aed', 'lyra', ['p1'], 18),
  t('tbrom', 'Brom Ironfist', 7, 7, '#0f766e', 'brom', ['p2'], 12),
  t('gob1', 'Goblin 1', 12, 4, '#8e2020', 'goblin', [], 15),
  t('gob2', 'Goblin Boss', 13, 5, '#8e2020', 'boss', [], 9),
  t('gob3', 'Goblin 2', 14, 3, '#8e2020', null, [], 7),
];
export let drawings: Drawing[] = [];
const subs = new Set<() => void>();
export const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const getDrawings = () => drawings;
export let secretHp: Record<string, { cur: number; max: number }> = { gob1: { cur: 7, max: 7 }, gob2: { cur: 21, max: 21 }, gob3: { cur: 7, max: 7 } };
export const getSecret = () => secretHp;
export function setSecret(id: string, hp: { cur: number; max: number }) { secretHp = { ...secretHp, [id]: hp }; emit(); }
let snap = { scene, tokens };
export const getSnap = () => snap;
const emit = () => subs.forEach((f) => f());
export function pushDrawing(d: Drawing) { drawings = [...drawings, d]; emit(); }
export function dropDrawing(id: string) { drawings = drawings.filter((d) => d.id !== id); emit(); }
const fv = (v: unknown) => (v && typeof v === 'object' && '_methodName' in (v as object) ? (v as { _methodName: string; _elements?: unknown[] }) : null);
export function patchTok(id: string, data: Record<string, unknown>) {
  snap = { ...snap, tokens: snap.tokens.map((t) => {
    if (t.id !== id) return t;
    const n = structuredClone(t) as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) {
      const path = k.split('.'); let o = n;
      for (const p of path.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
      const last = path[path.length - 1]; const f = fv(v); const els = f ? ((f as unknown as Record<string, unknown>)._elements ?? Object.values(f).find(Array.isArray) ?? []) as unknown[] : [];
      if (f?._methodName === 'deleteField') delete o[last];
      else if (f?._methodName === 'arrayUnion') o[last] = [...new Set([...((o[last] as unknown[]) ?? []), ...els])];
      else if (f?._methodName === 'arrayRemove') o[last] = ((o[last] as unknown[]) ?? []).filter((x) => !els.includes(x));
      else o[last] = v;
    }
    return n as unknown as Token;
  }) };
  emit();
}
export function setSceneCombat(c: Record<string, unknown>) { snap = { ...snap, scene: { ...snap.scene, combat: { ...snap.scene.combat, ...c } as never } }; emit(); }
