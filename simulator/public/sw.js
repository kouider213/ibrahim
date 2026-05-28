const CACHE = 'dzaryx-v2';
const STATIC = [
  '/ibrahim/',
  '/ibrahim/index.html',
  '/ibrahim/manifest.json',
  '/ibrahim/icons/icon-192.png',
  '/ibrahim/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET, chrome-extension, socket.io, API calls
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/socket.io')) return;
  if (url.pathname.startsWith('/api/')) return;
  if (!url.protocol.startsWith('http')) return;

  // Network-first for HTML (fresh app shell)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/ibrahim/index.html').then(r => r ?? fetch(e.request))
      )
    );
    return;
  }

  // Cache-first for static assets
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
  }
});
