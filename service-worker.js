// ============================================================
// JBC VOTING SYSTEM — service-worker.js
// ============================================================
// UPDATE INSTRUCTIONS:
// Every time you change any app file, bump the version number
// below. Example: 'jbc-v2' → 'jbc-v3' → 'jbc-v4'
// This forces all phones to throw away old cache and
// download everything fresh on next open.
// ============================================================

const CACHE_NAME = 'jbc-v2'; // ← bump this every update

const FILES_TO_CACHE = [
  './',
  './index.html',
  './stations.html',
  './nominees.html',
  './myvotes.html',
  './admin.html',
  './dashboard.html',
  './index.css',
  './stations.css',
  './nominees.css',
  './myvotes.css',
  './admin.css',
  './dashboard.css',
  './api.js',
  './index.js',
  './stations.js',
  './nominees.js',
  './myvotes.js',
  './admin.js',
  './dashboard.js',
  './manifest.json',
  './JBC_Logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── INSTALL ──────────────────────────────────────────────────
// Download and cache all files. skipWaiting forces the new
// service worker to activate immediately without waiting for
// old tabs to close.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
// Delete ALL old caches, then take control of every open tab
// immediately so the new version is used right away.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('JBC SW: Deleting old cache:', name);
            return caches.delete(name);
          })
      ))
      .then(() => {
        console.log('JBC SW: Now active, claiming all clients.');
        return self.clients.claim(); // take over all open tabs now
      })
  );
});

// ── FETCH ────────────────────────────────────────────────────
// Strategy: Network first, cache as fallback.
// Always try to get the latest from the internet.
// Only use cache if there is no internet connection.
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Google Apps Script API calls — always need real internet
  if (event.request.url.includes('script.google.com') ||
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('fonts.googleapis.com') ||
      event.request.url.includes('fonts.gstatic.com') ||
      event.request.url.includes('cdnjs.cloudflare.com') ||
      event.request.url.includes('unpkg.com')) {
    return; // pass through directly, don't cache these
  }

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Success — update the cache with the fresh response
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // No internet — fall back to cached version
        return caches.match(event.request);
      })
  );
});

// ── MESSAGE: force update from app ───────────────────────────
// The app can send a 'SKIP_WAITING' message to force the
// new service worker to activate immediately.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});