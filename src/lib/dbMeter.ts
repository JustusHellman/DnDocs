/**
 * Counts this device's Firestore reads and writes (what the free plan's daily limits count),
 * by collection and by page, so a runaway can be traced to where it comes from.
 *
 * Every Firestore call in the app goes through lib/firestoreMetered.ts (an alias for
 * 'firebase/firestore', see vite.config.ts), which reports here. Counts are kept per day in this
 * browser (localStorage) and shown under DM tools → "Database use". A burst of writes (more than
 * RUNAWAY_WRITES in a minute, outside imports and deletions) raises a `dndocs:runaway` event that
 * the app shows as a warning.
 */

export type WriteOp = 'set' | 'update' | 'delete' | 'add';

export interface MeterDay {
  day: string;
  writes: number;
  reads: number;
  /** "set entities @ /battle/*" → count */
  writeBy: Record<string, number>;
  readBy: Record<string, number>;
  /** hour of the day ("14") → counts */
  hours: Record<string, { w: number; r: number }>;
}

export const RUNAWAY_WRITES = 150;
const KEY = 'dndocs-dbmeter';
const RUNAWAY_WINDOW_MS = 60_000;
const RUNAWAY_QUIET_MS = 5 * 60_000;

const today = () => new Date().toISOString().slice(0, 10);
const empty = (): MeterDay => ({ day: today(), writes: 0, reads: 0, writeBy: {}, readBy: {}, hours: {} });

let state: MeterDay = load();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let bulkLabel: string | null = null;
let recent: number[] = [];
let recentKeys: string[] = [];
let lastAlarm = 0;
const listeners = new Set<() => void>();

function load(): MeterDay {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as MeterDay | null;
    if (s && s.day === today()) return s;
  } catch {
    /* no storage */
  }
  return empty();
}

function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* full or blocked: counts stay in memory */
    }
    listeners.forEach((f) => f());
  }, 2000);
}

function roll() {
  if (state.day !== today()) state = empty();
}

/** "entities/abc" → "entities", "scenes/x/tokens/y" → "scenes/*\/tokens". */
export function collectionOf(path: string): string {
  const seg = path.split('/').filter(Boolean);
  const names: string[] = [];
  for (let i = 0; i < seg.length; i += 2) names.push(seg[i]);
  return names.join('/*/') || '?';
}

/** "#/entity/abc?x=1" → "/entity/*" (ids left out, so the counts group by page). */
export function pageOf(hash: string): string {
  const p = (hash.replace(/^#/, '').split('?')[0] || '/').split('/');
  const withId = new Set(['entity', 'battle', 'map']);
  return p.map((s, i) => (i > 0 && withId.has(p[i - 1]) && s && s !== 'new' ? '*' : s)).join('/') || '/';
}

const where = () => (typeof location === 'undefined' ? '?' : pageOf(location.hash));
const hour = () => String(new Date().getHours()).padStart(2, '0');

export function recordWrite(op: WriteOp, path: string, n = 1) {
  roll();
  const key = `${op} ${collectionOf(path)} @ ${bulkLabel ?? where()}`;
  state.writes += n;
  state.writeBy[key] = (state.writeBy[key] ?? 0) + n;
  const h = (state.hours[hour()] ??= { w: 0, r: 0 });
  h.w += n;
  persist();
  if (bulkLabel) return;
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    recent.push(now);
    recentKeys.push(key);
  }
  while (recent.length && now - recent[0] > RUNAWAY_WINDOW_MS) {
    recent.shift();
    recentKeys.shift();
  }
  if (recent.length > RUNAWAY_WRITES && now - lastAlarm > RUNAWAY_QUIET_MS) {
    lastAlarm = now;
    const by: Record<string, number> = {};
    for (const k of recentKeys) by[k] = (by[k] ?? 0) + 1;
    const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    console.warn('[DnDocs] Many database writes in the last minute:', by, new Error('write stack').stack);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dndocs:runaway', { detail: { count: recent.length, top: top?.[0], by } }));
  }
}

export function recordRead(path: string, n: number) {
  if (n <= 0) return;
  roll();
  const key = `${collectionOf(path)} @ ${bulkLabel ?? where()}`;
  state.reads += n;
  state.readBy[key] = (state.readBy[key] ?? 0) + n;
  const h = (state.hours[hour()] ??= { w: 0, r: 0 });
  h.r += n;
  persist();
}

/** Run a big, expected job (an import, deleting a campaign): its writes are labelled and don't raise the alarm. */
export async function bulk<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const before = bulkLabel;
  bulkLabel = label;
  try {
    return await fn();
  } finally {
    bulkLabel = before;
  }
}

export function meterToday(): MeterDay {
  roll();
  return state;
}

export function resetMeter() {
  state = empty();
  recent = [];
  recentKeys = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}

export function onMeterChange(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** Plain-text summary to paste into a bug report. */
export function meterReport(): string {
  const s = meterToday();
  const top = (m: Record<string, number>, n: number) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `  ${v}\t${k}`)
      .join('\n');
  const hours = Object.entries(s.hours)
    .sort()
    .map(([h, c]) => `  ${h}:00\t${c.w} writes\t${c.r} reads`)
    .join('\n');
  return `DnDocs database use on this device, ${s.day}\nWrites: ${s.writes}\nReads: ${s.reads}\n\nWrites by source:\n${top(s.writeBy, 25)}\n\nReads by source:\n${top(s.readBy, 15)}\n\nBy hour:\n${hours}\n`;
}
