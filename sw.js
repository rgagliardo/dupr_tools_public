const CACHE = 'dupr-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('fetch', e => {
    // Only handle same-origin GET requests for HTML files
    const url = new URL(e.request.url);
    if (e.request.method !== 'GET') return;

    e.respondWith(
        fetch(e.request, { cache: 'no-store' })
            .then(response => {
                // Cache a fresh copy on every successful network fetch
                const clone = response.clone();
                caches.open(CACHE).then(cache => cache.put(e.request, clone));
                return response;
            })
            .catch(() => caches.match(e.request))
    );
});
