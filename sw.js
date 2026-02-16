const CACHE_NAME = 'cms-mobile-cache-v4';
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

// Push Notification Listener (handles ntfy.sh payloads)
self.addEventListener('push', (event) => {
    let title = 'New Payment';
    let body = 'You received a new payment.';
    let url = self.location.origin;

    try {
        if (event.data) {
            const raw = event.data.json();
            // ntfy.sh sends: { topic_url, message: { ... } }  or direct message object
            const msg = raw.message || raw;
            title = msg.title || raw.title || title;
            body = msg.message || msg.body || raw.body || body;
            if (raw.topic_url) url = raw.topic_url;
        }
    } catch (e) {
        try { body = event.data.text(); } catch (_) { }
    }

    const options = {
        body: body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [200, 100, 200],
        data: { url: url },
        tag: 'payment-alert', // Prevent duplicate notifications
        renotify: true
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            for (const client of clientList) {
                if (client.url === event.notification.data.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url);
            }
        })
    );
});
