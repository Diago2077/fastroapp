import { useSyncExternalStore } from 'react'
import { leerTema, setTema, suscribirTema, type Tema } from '@/lib/tema'

/**
 * Tema actual + como cambiarlo. La fuente de verdad es lib/tema.ts, asi que
 * todos los componentes que lo usen quedan sincronizados sin provider.
 */
export function useTema(): { tema: Tema; setTema: (tema: Tema) => void } {
  const tema = useSyncExternalStore(suscribirTema, leerTema, () => 'sistema' as Tema)
  return { tema, setTema }
}
