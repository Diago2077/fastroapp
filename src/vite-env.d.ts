/// <reference types="vite/client" />

/**
 * Constantes inyectadas por el `define` de vite.config.ts a partir de
 * `app.config.json` y `package.json`. No se leen directo: pasan por
 * `src/lib/app.ts`, que es donde estan documentadas.
 */
declare const __APP_NOMBRE__: string
declare const __APP_DESCRIPCION__: string
declare const __APP_ID__: string
declare const __APP_VERSION__: string
