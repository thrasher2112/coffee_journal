// Bump on every change to this file or to what it precaches: the activate
// handler deletes every cache that is not this one.
const CACHE_NAME = 'coffee-journal-cache-v4';

// The shell. Hashed bundles are discovered from index.html at install time
// (see precache) because their filenames change on every build.
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico'
];

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  // Individually, so one 404 cannot fail the whole install the way addAll does.
  await Promise.all(
    OFFLINE_URLS.map((url) => cache.add(url).catch(() => undefined))
  );

  // Without the JS and CSS bundles, a first-ever offline launch renders nothing
  // but an empty <div id="root">. Read them straight out of the served HTML.
  try {
    const res = await fetch('/index.html', { cache: 'reload' });
    const html = await res.text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    await Promise.all(assets.map((url) => cache.add(url).catch(() => undefined)));
  } catch {
    // Installed while offline; the runtime handler fills the cache later.
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  // Never cache or intercept API calls. Now that the API and the app share an
  // origin, this check is what keeps live data out of the shell cache.
  if (new URL(event.request.url).pathname.startsWith('/api/')) {
    return;
  }

  // Navigations: network first so a deployed update is picked up, falling back
  // to the cached shell. Client-side routes like /beans have no file of their
  // own, so the fallback must be index.html rather than the requested URL.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) || (await cache.match('/'));
      })
    );
    return;
  }

  // Everything else (hashed bundles, fonts, icons): cache first.
  event.respondWith(
    caches.match(event.request).then(
      (response) =>
        response ||
        fetch(event.request).then((res) => {
          if (res.ok) {
            const cloned = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return res;
        })
    )
  );
});
