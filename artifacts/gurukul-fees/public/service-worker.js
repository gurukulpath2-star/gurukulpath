// Service Worker for offline support
// Implements network-first strategy for APIs, cache-first for assets

const CACHE_VERSION = 'v1';
const CACHE_NAMES = {
  STATIC: `${CACHE_VERSION}-static`,
  API: `${CACHE_VERSION}-api`,
  DYNAMIC: `${CACHE_VERSION}-dynamic`,
};

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

const API_CACHE_PATTERNS = [
  /^https?:\/\/.*\/api\//,
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAMES.STATIC).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets could not be cached', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!Object.values(CACHE_NAMES).includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network-first for APIs, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  const isApiRequest = API_CACHE_PATTERNS.some((pattern) =>
    pattern.test(request.url)
  );

  if (isApiRequest) {
    event.respondWith(networkFirstStrategy(request));
  } else {
    event.respondWith(cacheFirstStrategy(request));
  }
});

/**
 * Network-first strategy for API calls
 * 1. Try network
 * 2. Fall back to cache
 * 3. Return offline error if neither available
 */
async function networkFirstStrategy(request) {
  try {
    // Try network
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(CACHE_NAMES.API);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('[SW] Network failed, checking cache:', request.url);

    // Try cache
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Serving from cache:', request.url);
      return cached;
    }

    // Return offline error
    console.log('[SW] No cache and offline:', request.url);
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'You are offline. This data is not available.',
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Cache-first strategy for assets
 * 1. Check cache first
 * 2. Fall back to network
 * 3. Cache the network response
 */
async function cacheFirstStrategy(request) {
  try {
    // Check cache
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Serving from cache:', request.url);
      return cached;
    }

    // Try network
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(CACHE_NAMES.DYNAMIC);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('[SW] Failed to fetch asset:', request.url, error);

    // Return cached if available
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // Return offline page
    return new Response('Offline - Asset not available', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}
