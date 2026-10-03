/**
 * Tema claro/oscuro, sin provider.
 *
 * Vive en un modulo con sus propios suscriptores en vez de en un contexto de
 * React porque el interruptor aparece en lugares que nunca estan montados a
 * la vez (el login y el layout de la app) y aun asi todos tienen que ver el
 * mismo valor. `useSyncExternalStore` (ver hooks/useTema)
 * se encarga de eso con muy poco codigo.
 *
 * La clase `.dark` se aplica sobre <html>. Ademas del cambio en caliente que
 * hace este modulo, index.html trae un script inline que la aplica ANTES del
 * primer pintado: sin eso, entrar con tema oscuro muestra un fogonazo blanco
 * mientras carga el bundle. Alla la clave la inyecta el plugin `marcaApp` de
 * vite.config.ts con el mismo valor que calcula `claveLocal`, asi que las dos
 * no se pueden desincronizar.
 */
import { claveLocal } from './app'

export type Tema = 'claro' | 'oscuro' | 'sistema'

export const CLAVE_TEMA = claveLocal('tema')

const TEMAS: readonly Tema[] = ['sistema', 'claro', 'oscuro']

const suscriptores = new Set<() => void>()

function esTema(valor: unknown): valor is Tema {
  return typeof valor === 'string' && (TEMAS as readonly string[]).includes(valor)
}

/**
 * El acceso a localStorage puede tirar excepcion (ventana privada, cookies
 * de terceros bloqueadas): ante cualquier problema se cae a 'sistema', que
 * es un default correcto.
 */
export function leerTema(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE_TEMA)
    return esTema(guardado) ? guardado : 'sistema'
  } catch {
    return 'sistema'
  }
}

function prefiereOscuro(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** true si con el tema actual la pantalla se ve oscura. */
export function esOscuro(tema: Tema = leerTema()): boolean {
  return tema === 'oscuro' || (tema === 'sistema' && prefiereOscuro())
}

export function aplicarTema(tema: Tema = leerTema()): void {
  document.documentElement.classList.toggle('dark', esOscuro(tema))
}

export function setTema(tema: Tema): void {
  try {
    localStorage.setItem(CLAVE_TEMA, tema)
  } catch {
    // Sin persistencia el tema dura lo que la pestana: peor, pero no roto.
  }
  aplicarTema(tema)
  for (const avisar of suscriptores) avisar()
}

/** Siguiente tema del ciclo sistema → claro → oscuro → sistema. */
export function siguienteTema(tema: Tema): Tema {
  return TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length]
}

export function suscribirTema(avisar: () => void): () => void {
  suscriptores.add(avisar)
  return () => {
    suscriptores.delete(avisar)
  }
}

// Con el tema en 'sistema', seguir al sistema operativo tambien cuando cambia
// con la app abierta (por ejemplo, el modo oscuro automatico al anochecer).
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (leerTema() !== 'sistema') return
  aplicarTema('sistema')
  for (const avisar of suscriptores) avisar()
})
