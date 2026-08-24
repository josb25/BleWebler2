/**
 * Service worker: offline shell + runtime asset cache.
 *
 * Hand-written rather than generated, because there is nothing to precompute —
 * the designer is a pure client-side app with no API, so "cache what you fetch,
 * serve it when the network is gone" is the whole requirement. That also keeps
 * the build free of a workbox dependency and its generated manifest.
 *
 * Note the deliberate exclusions: printing goes over Bluetooth/USB, not HTTP,
 * so nothing here interferes with it, and non-GET or cross-origin requests are
 * passed straight through untouched.
 */

/**
 * Built asset paths, injected at build time by the `sw-precache-manifest`
 * plugin in vite.config.ts. Empty in dev, where the worker is not registered.
 */
const PRECACHE = [];

const BASE = new URL(self.registration.scope);
const appUrl = (path = '') => new URL(path, BASE).toString();

const VERSION = 'v0.1.0';
const CACHE_PREFIX = 'blewebler2-';
const SHELL = `${CACHE_PREFIX}shell-${VERSION}`;
const ASSETS = `${CACHE_PREFIX}assets-${VERSION}`;

/**
 * Look a request up across every cache, ignoring `Vary`.
 *
 * Dev servers and CDNs commonly send `Vary: Origin`, and the Cache API honours
 * it: a module script is always fetched in CORS mode and therefore carries an
 * `Origin` header, while the request that populated the cache did not — so the
 * lookup misses, falls through to the network, and offline the app boots to a
 * blank page even though its code is sitting right there in the cache. (A plain
 * `fetch()` from the page matches fine, which makes this look like a module
 * problem until you read the headers.)
 */
function cacheLookup(req) {
    return caches.match(req, { ignoreVary: true });
}

/** Precache, fetching each entry ourselves so failures stay non-fatal. */
async function precache(cache, urls) {
    await Promise.all(urls.map(async (url) => {
        try {
            const req = new Request(url, { mode: 'cors', credentials: 'same-origin' });
            const res = await fetch(req, { cache: 'reload' });
            if (res && res.ok) await cache.put(req, res);
        } catch {
            // A missing entry must not wedge the install; runtime caching picks
            // it up on the first successful load anyway.
        }
    }));
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL)
            .then(cache => precache(cache, [appUrl(), appUrl('index.html'), appUrl('manifest.webmanifest'), ...PRECACHE]))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== SHELL && k !== ASSETS)
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // leave third parties alone

    // The service worker also covers static pages below the app root. Only the
    // app entry point may update or fall back to the cached application shell.
    if (req.mode === 'navigate') {
        const indexPath = new URL('index.html', BASE).pathname;
        if (url.pathname !== BASE.pathname && url.pathname !== indexPath) return;
        event.respondWith(
            fetch(req)
                .then(res => {
                    const copy = res.clone();
                    caches.open(SHELL).then(c => c.put(appUrl('index.html'), copy)).catch(() => undefined);
                    return res;
                })
                .catch(async () => (await cacheLookup(appUrl('index.html'))) ?? Response.error())
        );
        return;
    }

    // Everything else (hashed JS/CSS, fonts, icons): serve from cache at once
    // and refresh in the background.
    //
    // The lookup is `caches.match` (all caches), not the runtime cache alone:
    // the precached entry chunk and stylesheet live in the shell cache, and
    // checking only the runtime one would cache them and then never serve them.
    event.respondWith(
        (async () => {
            const hit = await cacheLookup(req);
            const network = fetch(req)
                .then(res => {
                    if (res && res.ok && res.type === 'basic') {
                        const copy = res.clone();
                        caches.open(ASSETS).then(c => c.put(req, copy)).catch(() => undefined);
                    }
                    return res;
                })
                .catch(() => undefined);
            return hit ?? (await network) ?? Response.error();
        })()
    );
});

// Lets the page activate a waiting worker without a manual reload.
self.addEventListener('message', (event) => {
    if (event.data === 'skip-waiting') self.skipWaiting();
});
