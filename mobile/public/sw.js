// Dzaryx Service Worker — Web Push notifications
const CACHE = 'dzaryx-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { payload = { title: 'Dzaryx', body: e.data.text() }; }

  const title   = payload.title ?? 'Dzaryx';
  const options = {
    body:    payload.body ?? '',
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    vibrate: [200, 100, 200],
    data:    payload.data ?? {},
    actions: [{ action: 'open', title: 'Ouvrir Dzaryx' }],
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    }),
  );
});
