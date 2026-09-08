// Product image service worker — cache-first, 24h TTL
const CACHE  = 'product-img-v1'
const IMG_TTL = 86400 * 1000 // 24 hours in ms

self.addEventListener('install',  () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', event => {
  // Only intercept Supabase Storage product-image requests
  if (!event.request.url.includes('/storage/v1/object/public/product-images/')) return

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(event.request)
      if (cached) {
        const age = Date.now() - Number(cached.headers.get('x-sw-ts') || 0)
        if (age < IMG_TTL) return cached
        // Stale — delete and re-fetch
        cache.delete(event.request)
      }
      try {
        const response = await fetch(event.request)
        if (response.ok) {
          // Clone response, inject timestamp header, store in cache
          const headers = new Headers(response.headers)
          headers.set('x-sw-ts', String(Date.now()))
          const blob = await response.blob()
          cache.put(event.request, new Response(blob, { status: 200, headers }))
          return new Response(blob, { status: 200, headers: response.headers })
        }
        return response
      } catch {
        return cached || new Response('', { status: 503 })
      }
    })
  )
})
