
// ============================================================
// JBC VOTING SYSTEM — service-worker.js
// ============================================================
// Think of this like a helper that stores a copy of the app
// on the phone so it loads fast even on slow internet.
//
// HOW TO UPDATE:
// Whenever you make big changes to your app files,
// change 'jbc-v1' below to 'jbc-v2', then 'jbc-v3', etc.
// This tells all phones to download the fresh new version.
// ============================================================

const CACHE_NAME = 'jbc-v1';

// These are all the files we want to save on the phone.
// If you add a new page or file in the future, add it here.
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
// This runs once when the app is first installed on the phone.
// It downloads and saves all the files listed above.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  // Take over immediately without waiting
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────
// This runs after install. It deletes any OLD saved versions
// so the phone always uses the latest one.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ── FETCH ────────────────────────────────────────────────────
// Every time the app tries to load something (a page, a CSS
// file, an image), this decides where to get it from.
//
// Strategy: Network first, fall back to cache.
// → Try to get the fresh version from the internet first.
// → If no internet, use the saved copy on the phone.
// → This way members always get the latest version when online,
//   and can still open the app when offline.
self.addEventListener('fetch', event => {
  // Only handle requests from our own app, not Google Sheets API
  // (API calls always need real internet — can't cache those)
  if (event.request.url.includes('script.google.com') ||
      event.request.url.includes('googleapis.com')) {
    return; // Let API calls go straight to the internet
  }

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Got a fresh response from internet — save a copy and return it
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // No internet — use the saved copy instead
        return caches.match(event.request);
      })
  );
});