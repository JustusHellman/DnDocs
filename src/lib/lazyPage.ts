import { lazy, type ComponentType } from 'react';

/**
 * Why a page's code couldn't be loaded:
 * - `new-version`: DnDocs was deployed since this tab opened, so the old file is gone (reload).
 * - `offline`: the network dropped (phone asleep, Wi-Fi blip); the app itself is still current.
 */
export class PageLoadError extends Error {
  constructor(readonly reason: 'new-version' | 'offline') {
    super(reason === 'new-version' ? 'A new version of DnDocs is available.' : "This page couldn't be loaded.");
    this.name = 'PageLoadError';
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The app's main script, as named in an index.html. */
const entryOf = (html: string) => html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1] ?? null;

/** Has a newer DnDocs been deployed than the one running here? (null: can't tell, e.g. offline) */
export async function isNewVersionOut(): Promise<boolean | null> {
  const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src') ?? null;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}index.html?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const live = entryOf(await res.text());
    return mine && live ? mine !== live : null;
  } catch {
    return null;
  }
}

/**
 * React.lazy that survives a network blip (it tries again twice before giving up) and, when it does
 * give up, says whether that's because of a new version or the connection.
 */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => loadPage(load));
}

/** Loads a page's code: two more tries over a few seconds, then a PageLoadError saying why not. */
export async function loadPage<T>(load: () => Promise<T>, delays = [0, 800, 2500]): Promise<T> {
  let last: unknown;
  for (const delay of delays) {
    if (delay) await wait(delay);
    try {
      return await load();
    } catch (err) {
      last = err;
      // A file that's gone after a deploy won't come back: no point waiting.
      if ((await isNewVersionOut()) === true) throw new PageLoadError('new-version');
    }
  }
  console.warn('[DnDocs] Page failed to load', last);
  throw new PageLoadError('offline');
}
