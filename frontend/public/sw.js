const CACHE_NAME = 'coffee-journal-cache-v1';
const OFFLINE_URLS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request).then((res) => {
          const cloned = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return res;
        })
      );
    })
  );
});
