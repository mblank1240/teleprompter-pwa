// Offline support. Network-first: when online you always get the latest deploy,
// and every response refreshes the cache. Offline (or on a network too slow to
// answer within NETWORK_TIMEOUT_MS), the cached copy is served instead.
//
// Bumping VERSION is optional; it only forces a clean re-download of everything.
const VERSION = 'v2';
const CACHE = `teleprompter-${VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;
const ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/storage.js',
  'js/sanitize.js',
  'js/files.js',
  'js/prompter.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const key = req.mode === 'navigate' ? 'index.html' : req;
  try {
    // Bypass the HTTP cache so a fresh deploy is picked up immediately.
    // (A navigate-mode Request can't be re-initialised, so fetch navigations by URL.)
    const request = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' });
    const res = await Promise.race([request, timeout(NETWORK_TIMEOUT_MS)]);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) return cached;
    return fetch(req); // nothing cached: let the real error surface
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(networkFirst(req));
});
