// @ts-nocheck
const CACHE_NAME = 'leath-note-static-v3';
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/leath-note-icon-64.png',
  '/leath-note-icon-192.png',
  '/leath-note-icon-512.png',
  '/textures/wood-background.webp',
  '/textures/leather-sidebar.webp',
];
const CACHEABLE_PATHS = new Set(ASSETS_TO_CACHE);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !CACHEABLE_PATHS.has(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
