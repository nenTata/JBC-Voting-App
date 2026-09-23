// ============================================================
// JBC VOTING SYSTEM — service-worker.js
// ============================================================
// UPDATE INSTRUCTIONS:
// Every time you change any app file, bump the version number
// below. Example: 'jbc-v3' → 'jbc-v4' → 'jbc-v5'
// This forces all phones to throw away old cache and
// download everything fresh on next open.
// ============================================================

const CACHE_NAME = 'jbc-v3'; // ← bump this every update

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

// Third-party static hosts that are safe to cache (fonts + libraries).
// The Apps Script API (script.google.com) is NEVER cached here.
const CACHEABLE_CDNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'unpkg.com'
];

// Fonts / libraries the pages need — cached on install so
// the first offline use already works.
const CDN_FILES_TO_CACHE = [
  'https://unpkg.com/docx@7.1.0/build/index.js',
  'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/1.3.8/FileSaver.js'
];

// ── INSTALL ──────────────────────────────────────────────────
// Each file is cached on its own, so ONE missing file (for
// example a missing icon) no longer makes the whole install
// fail. (cache.addAll() rejects everything if any file 404s,
// which leaves you with an empty cache and a dead offline mode.)
// cache: 'reload' bypasses the browser HTTP cache so we always
// store the newest copy of each file.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        [...FILES_TO_CACHE, ...CDN_FILES_TO_CACHE].map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch(err => console.warn('JBC SW: could not cache', url, err))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
// Delete old caches, then take control of every open tab.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
// Strategy: stale-while-revalidate.
//   • If the file is cached → show it INSTANTLY, and refresh the
//     cache in the background for next time.
//   • If not cached → go to the network.
//   • If the network fails too → fall back to the app shell.
// This is much faster on slow / weak connections than
// "network first", which waits for the network to time out
// before ever looking at the cache.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never touch the Apps Script API
  if (url.hostname === 'script.google.com' ||
      url.hostname.endsWith('googleusercontent.com')) return;

  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_CDNS.includes(url.hostname)) return;

  event.respondWith(staleWhileRevalidate(event));
});

async function staleWhileRevalidate(event) {
  const req    = event.request;
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(req, { ignoreSearch: true });

  const update = fetch(req)
    .then(res => {
      if (res && (res.status === 200 || res.type === 'opaque')) {
        cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(update);   // keep refreshing in the background
    return cached;
  }

  const fresh = await update;
  if (fresh) return fresh;

  // Offline and not cached: fall back to the login page shell
  if (req.mode === 'navigate') {
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
  }
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

// ── MESSAGE: force update from app ───────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});