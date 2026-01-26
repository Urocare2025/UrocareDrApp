// Aggressive cache-first service worker (navigation fallback)
const CACHE_NAME = 'patient-app-v5'; // Bumped for fresh cache
const ASSETS = [
  './',                 // root (relative)
  './index.html',
  './index.html?fresh',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // add more static assets if you have (css, js)
];

// Install - pre-cache everything
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate - remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Utility: try cache first, then network, else fallback
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (!res || !res.ok) {
      return caches.match('./index.html'); // Fallback to app shell on errors (relative)
    }
    // put a copy in cache if it's a same-origin GET
    if (request.method === 'GET' && res && res.ok && request.url.startsWith(self.location.origin)) {
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    return null;
  }
}

// Fetch - special-case navigation and then use cache-first for everything
self.addEventListener('fetch', event => {
  const req = event.request;

  // Always handle navigation requests by serving cached index.html first
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      caches.match('./index.html').then(cached => {  // Relative path
        if (cached) return cached;
        // fallback to network if not cached (should not happen if installed correctly)
        return fetch(req).catch(() => new Response('<h1>Offline</h1><p>Open app while online to cache.</p>', { headers:{'Content-Type':'text/html'} }));
      })
    );
    return;
  }

  // For other requests (assets / api), try cache-first then fallback to network, else fallback to cache index.html
  event.respondWith(
    cacheFirst(req).then(res => res || fetch(req).catch(() => caches.match('./index.html')))
  );
});