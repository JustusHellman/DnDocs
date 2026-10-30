import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPage, PageLoadError } from '../lib/lazyPage';

// The page running here was built with this entry script…
const setMine = (src: string) => vi.stubGlobal('document', { querySelector: () => ({ getAttribute: () => src }) });
// …and this is the index.html the server has now.
const serve = (src: string | null) =>
  vi.stubGlobal('fetch', vi.fn(async () => (src === null ? Promise.reject(new TypeError('offline')) : new Response(`<script type="module" crossorigin src="${src}"></script>`))));

const failing = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

describe('loadPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gets past a network blip by trying again', async () => {
    setMine('/DnDocs/assets/index-a.js');
    serve('/DnDocs/assets/index-a.js');
    const load = vi.fn().mockRejectedValueOnce(new TypeError('blip')).mockResolvedValue({ default: 'Page' });
    await expect(loadPage(load, [0, 1, 1])).resolves.toEqual({ default: 'Page' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('says "new version" only when a newer DnDocs is deployed', async () => {
    setMine('/DnDocs/assets/index-a.js');
    serve('/DnDocs/assets/index-b.js');
    await expect(loadPage(failing, [0, 1, 1])).rejects.toMatchObject({ reason: 'new-version' });
  });

  it('says the connection is the problem when the app is still current', async () => {
    setMine('/DnDocs/assets/index-a.js');
    serve('/DnDocs/assets/index-a.js');
    const err = await loadPage(failing, [0, 1, 1]).catch((e) => e);
    expect(err).toBeInstanceOf(PageLoadError);
    expect(err.reason).toBe('offline');
  });

  it('says the connection is the problem when even index.html is out of reach', async () => {
    setMine('/DnDocs/assets/index-a.js');
    serve(null);
    await expect(loadPage(failing, [0, 1, 1])).rejects.toMatchObject({ reason: 'offline' });
  });
});
