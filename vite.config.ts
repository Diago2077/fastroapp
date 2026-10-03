import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const raiz = import.meta.dirname
const leer = (rel: string) => readFileSync(path.resolve(raiz, rel), 'utf-8')

const pkg = JSON.parse(leer('package.json'))
const marca = JSON.parse(leer('app.config.json'))

const APP_ID: string = pkg.name
const APP_VERSION: string = pkg.version
const APP_NOMBRE: string = marca.nombre
const APP_DESCRIPCION: string = marca.descripcion

/**
 * El manifest de la PWA se genera a partir de `app.config.json` en vez de
 * vivir en `public/`: si fuera un archivo estatico habria que acordarse de
 * cambiarle el nombre y el color a mano en cada app nueva, que es
 * justamente lo que esta base evita.
 */
function manifest(): string {
  return JSON.stringify(
    {
      name: APP_NOMBRE,
      short_name: APP_NOMBRE,
      description: APP_DESCRIPCION,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: marca.colorFondo,
      theme_color: marca.colorPrimario,
      lang: marca.idioma,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: '/icons/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    null,
    2,
  )
}

/**
 * Todo lo que lleva el nombre de la app fuera del bundle de React:
 *
 *  · index.html — los `%MARCA_*%` (titulo, metas, y la clave de localStorage
 *    del script que aplica el tema antes del primer pintado).
 *  · manifest.webmanifest — servido en dev, escrito a dist/ en el build.
 *  · sw.js — a partir de scripts/sw-template.js, con el nombre y la version
 *    ya inyectados. El service worker NO vive en public/ a proposito: si
 *    estuviera ahi, Vite lo copiaria tal cual y el nombre del cache no
 *    coincidiria con lo publicado.
 */
function marcaApp(): Plugin {
  const REEMPLAZOS: Record<string, string> = {
    '%MARCA_NOMBRE%': APP_NOMBRE,
    '%MARCA_DESCRIPCION%': APP_DESCRIPCION,
    '%MARCA_COLOR%': marca.colorPrimario,
    '%MARCA_IDIOMA%': marca.idioma,
    '%MARCA_CLAVE_TEMA%': `${APP_ID}:tema`,
  }

  return {
    name: 'marca-app',

    transformIndexHtml(html) {
      return Object.entries(REEMPLAZOS).reduce(
        (acc, [clave, valor]) => acc.replaceAll(clave, valor),
        html,
      )
    },

    // En dev no hay build: el manifest se sirve desde memoria para que la
    // pestana no tire un 404 y se pueda probar la instalacion de la PWA.
    configureServer(server) {
      server.middlewares.use((req, res, siguiente) => {
        if (req.url !== '/manifest.webmanifest') return siguiente()
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest())
      })
    },

    closeBundle() {
      const sw = leer('scripts/sw-template.js')
        .replaceAll('__APP_NOMBRE__', APP_ID)
        .replaceAll('__APP_VERSION__', APP_VERSION)
      writeFileSync(path.resolve(raiz, 'dist/sw.js'), sw)
      writeFileSync(path.resolve(raiz, 'dist/manifest.webmanifest'), manifest())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), marcaApp()],
  resolve: {
    alias: {
      '@': path.resolve(raiz, './src'),
    },
  },
  define: {
    __APP_NOMBRE__: JSON.stringify(APP_NOMBRE),
    __APP_DESCRIPCION__: JSON.stringify(APP_DESCRIPCION),
    __APP_ID__: JSON.stringify(APP_ID),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    outDir: 'dist',
  },
})
