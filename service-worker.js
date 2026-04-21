const CACHE_NAME = 'momo-pos-cache-v1';
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/icon-192.svg',
  '/icon-512.svg',
  '/manifest.json',
  '/index.tsx',
  '/App.tsx',
  '/types.ts',
  '/constants.ts',
  '/utils/storage.ts',
  '/components/Menu.tsx',
  '/components/MenuItem.tsx',
  '/components/Bill.tsx',
  '/components/BillItem.tsx',
  '/components/PrintReceipt.tsx',
  '/components/VariantSelectionModal.tsx',
  '/components/Analytics.tsx',
  '/components/BillPreviewModal.tsx',
  '/components/ConfirmationModal.tsx',
  '/components/DeleteBillModal.tsx',
  '/components/BranchSelectionModal.tsx',
  '/components/ItemSalesReport.tsx'
];

// On install, cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache and caching app shell');
      return cache.addAll(APP_SHELL_URLS).catch(err => {
        console.error('Failed to cache all app shell URLs', err);
      });
    })
  );
});

// On fetch, use a cache-first strategy
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      // If we have a cached response, return it
      if (response) {
        return response;
      }
      // Otherwise, fetch from the network
      return fetch(event.request).then((networkResponse) => {
        // Clone the response because it's a stream and can only be consumed once.
        const responseToCache = networkResponse.clone();

        // Don't cache unsuccessful responses or non-http protocols
        if (networkResponse.ok && event.request.url.startsWith('http')) {
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
            });
        }
        
        return networkResponse;
      }).catch(error => {
          console.error('Fetch failed:', error);
          // The browser will handle the offline error display
      });
    })
  );
});

// On activate, clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});