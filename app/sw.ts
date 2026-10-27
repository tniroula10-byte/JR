/// <reference lib="webworker" />
/**
 * Service Worker Source (`app/sw.ts`)
 * Section 10 PWA Rule: Service worker NEVER caches authenticated API data.
 * Only static shell assets (`/icons/*`, `/offline`) are cached.
 */

declare const self: ServiceWorkerGlobalScope;

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
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve(true);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // NEVER cache API routes, auth routes, RSC payloads, or non-GET requests
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/callback') ||
    request.headers.get('RSC') === '1'
  ) {
    return;
  }

  // Static icon assets: cache-first
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Navigation requests: network-first with offline fallback shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const offlineShell = await caches.match('/offline');
        return offlineShell ?? new Response('Offline', { status: 503 });
      })
    );
  }
});

self.addEventListener('push', (event) => {
  const payload = event.data
    ? (event.data.json() as { title?: string; body?: string; link?: string })
    : { title: 'John Rambo Support', body: 'You have a new update.', link: '/notifications' };

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'John Rambo Support', {
      body: payload.body ?? 'Open app to view details.',
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      data: { link: payload.link ?? '/notifications' }
    })
  );
});
