const CACHE_NAME = 'cms-mobile-cache-v12';
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

    // App shell (HTML, manifest) → Network-First for immediate updates
    if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
        e.respondWith(
            fetch(e.request).then(res => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                return res;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    // Icons & other static assets → stale-while-revalidate
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
    let title = '💰 Payment Received';
    let body = 'New payment details incoming...';
    let url = self.location.origin;
    let icon = './icon-192.png';

    try {
        if (event.data) {
            const raw = event.data.json();
            console.log('Push Received (JSON):', raw);
            // ntfy.sh sends: { topic_url, message: { ... } } or direct message object
            const msg = raw.message || raw;
            title = msg.title || raw.title || title;
            body = msg.message || msg.body || raw.body || body;
            if (msg.click || raw.click) url = msg.click || raw.click;
            if (msg.icon || raw.icon) icon = msg.icon || raw.icon;
        } else {
            console.warn('Push Received: No Data');
            body = 'Tap to see what\'s new!';
        }
    } catch (e) {
        console.error('Push Parse Error:', e);
        try { body = event.data.text(); } catch (_) { }
    }

    const options = {
        body: body,
        icon: icon,
        badge: './icon-192.png',
        vibrate: [200, 100, 200, 100, 200],
        data: { url: url },
        tag: 'payment-alert', // Collapse multiple alerts
        renotify: true,
        actions: [
            { action: 'open', title: 'Open App' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data.url || self.location.origin;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Check if there is already a window open with this URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.startsWith(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
