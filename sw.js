const CACHE_NAME = 'cms-mobile-cache-v2';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Install: pre-cache app shell
self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
});

// Activate: clear old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch: smart routing
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // API calls → network-only, no SW overhead
    if (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com') {
        return; // Let the browser handle it directly
    }

    // Google Fonts → cache-first (they rarely change)
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        e.respondWith(
            caches.match(e.request).then(cached => {
                if (cached) return cached;
                return fetch(e.request).then(res => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                    return res;
                });
            })
        );
        return;
    }

    // App shell (HTML, manifest, icons) → stale-while-revalidate
    e.respondWith(
        caches.match(e.request).then(cached => {
            const networkFetch = fetch(e.request).then(res => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                return res;
            }).catch(() => cached);
            return cached || networkFetch;
        })
    );
});
