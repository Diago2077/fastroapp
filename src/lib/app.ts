/**
 * Identidad de la app, para el codigo del cliente.
 *
 * Los valores salen de `app.config.json` y de `package.json`, inyectados en
 * build time por `vite.config.ts` (ver el `define`). No hay que escribir el
 * nombre de la app suelto en ningun componente: siempre se importa de aca,
 * asi cambiar `app.config.json` alcanza para rebrandear todo.
 */

/** Nombre visible (cabecera, login, manifest, titulo de la pestana). */
export const APP_NOMBRE = __APP_NOMBRE__

export const APP_DESCRIPCION = __APP_DESCRIPCION__

/**
 * Identificador tecnico: el `name` de package.json. Es el prefijo de las
 * claves de localStorage y del cache del service worker, asi que dos apps
 * hechas sobre esta base no se pisan entre si aunque corran en el mismo
 * dominio.
 */
export const APP_ID = __APP_ID__

/** Version publicada. Subirla en package.json es el UNICO paso de una release. */
export const APP_VERSION = __APP_VERSION__

/**
 * Clave de localStorage con el prefijo de la app.
 * `claveLocal('tema')` → `'fastro-app:tema'`.
 */
export function claveLocal(nombre: string): string {
  return `${APP_ID}:${nombre}`
}
