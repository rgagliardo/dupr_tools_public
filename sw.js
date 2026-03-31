const CACHE = 'dupr-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
    e.waitUntil(
        clients.claim().then(() => {
            // Tell all open pages to reload so they get fresh HTML.
            // The page guards against infinite loops with a sessionStorage flag.
            return clients.matchAll({ type: 'window' }).then(all =>
                all.forEach(client => client.postMessage('SW_ACTIVATED'))
            );
        })
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    e.respondWith(
        fetch(e.request, { cache: 'no-store' })
            .then(response => {
                const clone = response.clone();
                caches.open(CACHE).then(cache => cache.put(e.request, clone));
                return response;
            })
            .catch(() => caches.match(e.request))
    );
});
