// Plantilla del service worker. El plugin marcaApp() de vite.config.ts
// reemplaza los marcadores de nombre y version en cada build con los valores
// de package.json -- asi el nombre de cache SIEMPRE coincide con lo
// publicado y no hay dos archivos que mantener sincronizados a mano.
const PREFIJO_CACHE = '__APP_NOMBRE__-'
const CACHE_NAME = PREFIJO_CACHE + 'v' + '__APP_VERSION__'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys()
      await Promise.all(
        nombres
          .filter((n) => n.startsWith(PREFIJO_CACHE) && n !== CACHE_NAME)
          .map((n) => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Nunca intervenir: llamadas a la API propia, a Supabase, ni nada que no
  // sea GET del mismo origen. Los datos tienen que ser siempre frescos.
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Assets con hash de contenido (Vite): inmutables, cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME)
        const cacheada = await cache.match(request)
        if (cacheada) return cacheada
        const respuesta = await fetch(request)
        if (respuesta.ok) cache.put(request, respuesta.clone())
        return respuesta
      })(),
    )
    return
  }

  // El resto (navegacion, index.html, manifest, iconos): red primero, y
  // solo se usa el cache como ultimo recurso si no hay conexion. Esto es
  // lo que evita servir un index.html viejo apuntando a JS que un deploy
  // nuevo ya borro.
  event.respondWith(
    (async () => {
      try {
        const respuesta = await fetch(request)
        if (respuesta.ok) {
          const cache = await caches.open(CACHE_NAME)
          cache.put(request, respuesta.clone())
        }
        return respuesta
      } catch {
        const cache = await caches.open(CACHE_NAME)
        const cacheada = await cache.match(request)
        return cacheada || cache.match('/')
      }
    })(),
  )
})
