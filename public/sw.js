// Compiled Service Worker (`public/sw.js`)
// Section 10: Service worker NEVER caches authenticated API data or RSC responses.
const CACHE_NAME = 'john-rambo-static-v1';
const STATIC_SHELL_URLS = ['/offline', '/icons/icon-192.svg', '/icons/icon-512.svg', '/icons/icon-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve(true))))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache authenticated API data, RSC payloads, or Supabase traffic
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/callback') ||
    request.headers.get('RSC') === '1'
  ) {
    return;
  }

  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const offlinePage = await caches.match('/offline');
        return offlinePage || new Response('Offline — John Rambo PWA', { status: 503 });
      })
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = { title: 'John Rambo Support', body: 'New activity in your account.', link: '/notifications' };
  try {
    if (event.data) payload = event.data.json();
  } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title || 'John Rambo Support', {
      body: payload.body || 'Tap to view update.',
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      data: { link: payload.link || '/notifications' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/notifications';
  const target = new URL(link, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && 'focus' in w) {
          w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
