// Self-destroying cleanup Service Worker to replace legacy momo-pos-cache-v1 registrations.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      } catch (_err) {
        // Ignore cache cleanup errors
      }
      try {
        await self.registration.unregister();
      } catch (_err) {
        // Ignore unregister errors
      }
      try {
        const windowClients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });
        for (const client of windowClients) {
          if ('navigate' in client) {
            client.navigate(client.url);
          }
        }
      } catch (_err) {
        // Ignore client navigation errors
      }
    })()
  );
});