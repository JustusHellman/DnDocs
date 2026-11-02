export * from '../../src/lib/battle/sceneService.ts';
import type { Drawing } from '../../src/types';
import { healthOf } from '../../src/lib/battle/geometry';
import { dropDrawing, patchTok, pushDrawing, setSceneCombat, setSecret } from './sceneStore';
let n = 0;
export function addDrawing(_s: string, d: Omit<Drawing, 'id' | 'createdAt'>) {
  const drawing = { ...d, id: `d${++n}`, createdAt: new Date().toISOString() } as Drawing;
  pushDrawing(drawing);
  return { drawing, saved: Promise.resolve() };
}
export async function deleteDrawing(_s: string, id: string) { dropDrawing(id); }
export async function updateToken(_s: string, id: string, data: Record<string, unknown>) { patchTok(id, data); }
export async function patchToken(_s: string, id: string, data: Record<string, unknown>) { patchTok(id, data); }
export async function moveToken(_s: string, id: string, x: number, y: number) { patchTok(id, { x, y }); }
export async function setTurn(_s: string, turn: string | null, round: number) { setSceneCombat({ turn, round }); }
export async function setCombat(_s: string, c: Record<string, unknown>) { setSceneCombat(c); }
export async function updateScene() {}
export async function setInitiatives() {}
export async function setTokenHp(_s: string, _c: string, id: string, hp: { cur: number; max: number }) { setSecret(id, hp); patchTok(id, { health: healthOf(hp.cur, hp.max) }); }
