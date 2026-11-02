/**
 * Settings kept on this device only (localStorage): the panel you left open, a colouring, where a
 * window sits. Reading and writing never throws — private windows, blocked storage and full quotas
 * just mean the setting lasts for this visit.
 */
export function readDevice(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Store a value (null removes it). */
export function writeDevice(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* kept for this visit only */
  }
}

/** A stored JSON value, or `fallback` when there's none (or it can't be read). */
export function readDeviceJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(readDevice(key) || 'null') as T | null;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeDeviceJson(key: string, value: unknown): void {
  writeDevice(key, JSON.stringify(value));
}
