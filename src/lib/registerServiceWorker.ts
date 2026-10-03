/**
 * Registra el service worker generado en dist/sw.js (ver vite.config.ts).
 * Habilita que la app sea instalable como PWA. Silencioso ante errores:
 * si el navegador no soporta service workers, la app sigue funcionando
 * igual, simplemente sin esa capa.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.error('No se pudo registrar el service worker', e)
    })
  })
}
