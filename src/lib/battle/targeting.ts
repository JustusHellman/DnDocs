/**
 * Aiming an attack: how far the target is (edge to edge, by the map's diagonal rule) and whether
 * the attack reaches it — from a stat block's "reach 5 ft." / "range 80/320 ft." or a weapon's note.
 * Pure functions.
 */
import type { SceneGrid } from '../../types';
import { distanceFeet } from './geometry';

export interface Range {
  /** Melee reach in feet. */
  reach?: number;
  /** Ranged: normal and long range in feet. */
  normal?: number;
  long?: number;
}

/** Feet between two tokens' nearest squares (next to each other: one square, 5 ft). */
export function tokenGapFeet(a: { x: number; y: number; size: number }, b: { x: number; y: number; size: number }, grid: Pick<SceneGrid, 'feet' | 'diagonal'>): number {
  const span = (p: number, size: number) => [Math.round(p), Math.round(p) + Math.max(1, Math.round(size)) - 1] as const;
  const [ax0, ax1] = span(a.x, a.size);
  const [ay0, ay1] = span(a.y, a.size);
  const [bx0, bx1] = span(b.x, b.size);
  const [by0, by1] = span(b.y, b.size);
  const dx = Math.max(0, bx0 - ax1, ax0 - bx1);
  const dy = Math.max(0, by0 - ay1, ay0 - by1);
  return distanceFeet({ x: 0, y: 0 }, { x: dx, y: dy }, { feet: grid.feet || 5, diagonal: grid.diagonal });
}

/** The reach and range in an attack's text ("Melee or Ranged Weapon Attack: +4 to hit, reach 5 ft. or range 20/60 ft."). */
export function rangeIn(text: string | null | undefined): Range {
  const t = text ?? '';
  const out: Range = {};
  const reach = /reach\s+(\d+)\s*f(?:ee)?t/i.exec(t);
  if (reach) out.reach = Number(reach[1]);
  const range = /(?:range\s+)?\b(\d+)\s*\/\s*(\d+)\b(?:\s*f(?:ee)?t)?/i.exec(t) ?? /range\s+(\d+)\s*f(?:ee)?t/i.exec(t);
  if (range) {
    out.normal = Number(range[1]);
    out.long = Number(range[2] ?? range[1]);
  }
  return out;
}

/** A character's weapon: its note's range, or a melee weapon's 5 ft (reach weapons say "reach 10 ft"). */
export function weaponRange(a: { ab: string; note?: string }): Range {
  const r = rangeIn(a.note);
  if (r.reach === undefined && r.normal === undefined && a.ab !== 'dex' && a.ab !== 'spell' && a.ab !== 'none') return { reach: 5 };
  // A thrown weapon (dagger, handaxe) is a melee weapon too.
  if (r.normal !== undefined && r.reach === undefined && /thrown/i.test(a.note ?? '')) return { ...r, reach: 5 };
  return r;
}

export type RangeCheck = { ok: true; long?: boolean; max?: undefined } | { ok: false; long?: undefined; max: number };

/** Can it reach? `long`: only at long range (disadvantage). Unknown range: always fine. */
export function checkRange(feet: number, r: Range): RangeCheck {
  if (r.reach === undefined && r.normal === undefined) return { ok: true };
  if (r.reach !== undefined && feet <= r.reach) return { ok: true };
  if (r.normal !== undefined && feet <= r.normal) return { ok: true };
  if (r.long !== undefined && feet <= r.long) return { ok: true, long: true };
  return { ok: false, max: Math.max(r.reach ?? 0, r.long ?? 0) };
}
