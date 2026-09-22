/**
 * Pham Van Phu — Service Worker
 * Strategy:
 *   - HTML pages   : Network-First (always fetch latest shell)
 *   - CSS / JS     : Stale-While-Revalidate (serve cache instantly, update in background)
 *   - JSON data    : Network-First with cache fallback (latest data preferred)
 *   - Images/fonts : Cache-First (stable, rarely change)
 *
 * Bump CACHE_VERSION on every deploy to purge stale caches.
 */

const CACHE_VERSION = 'pvp-v15';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;

// HTML routes — Network-First
const HTML_ROUTES = [
    '/',
    '/news/',
    '/research/',
    '/publications/',
    '/projects/',
];

// Assets pre-cached on install (images only — CSS/JS handled at runtime)
const PRECACHE_ASSETS = [
    '/assets/pvp-icon.png',
];

// JSON data paths — Network-First
const DATA_URLS = [
    '/data/lab_data.json',
    '/data/cv_data.json',
];

// -----------------------------------------------
// Install — pre-cache only truly static assets
// -----------------------------------------------
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_ASSETS))
    );
    self.skipWaiting();
});

// -----------------------------------------------
// Activate — purge ALL caches from previous versions
// -----------------------------------------------
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== STATIC_CACHE && k !== DATA_CACHE)
                    .map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// -----------------------------------------------
// Fetch — per-resource strategies
// -----------------------------------------------
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle same-origin GET requests
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    const path = url.pathname;

    // ── Network-First: HTML pages ──────────────────────────────────────────
    if (HTML_ROUTES.includes(path) || path.endsWith('/index.html')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(STATIC_CACHE).then(c => c.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // ── Network-First: JSON data ───────────────────────────────────────────
    if (DATA_URLS.includes(path)) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(DATA_CACHE).then(c => c.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // ── Stale-While-Revalidate: CSS / JS ──────────────────────────────────
    if (path.endsWith('.css') || path.endsWith('.js')) {
        event.respondWith(
            caches.open(STATIC_CACHE).then(async cache => {
                const cached = await cache.match(request);
                const networkPromise = fetch(request).then(response => {
                    if (response.ok) cache.put(request, response.clone());
                    return response;
                });
                // Serve cached version immediately; update cache in background
                return cached || networkPromise;
            })
        );
        return;
    }

    // ── Cache-First: images and other static assets ────────────────────────
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(STATIC_CACHE).then(c => c.put(request, clone));
                }
                return response;
            });
        })
    );
});
