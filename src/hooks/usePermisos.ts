import { useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { PermisoKey } from '@/lib/database.types'

/**
 * Permisos de quien esta mirando. Un admin activo tiene todos. Esto decide
 * que se muestra; lo que protege los datos es la RLS (migracion 005).
 */
export function usePermisos() {
  const { usuario, esAdmin } = useAuth()
  const can = useCallback(
    (clave: PermisoKey) => {
      if (esAdmin) return true
      if (!usuario?.activo) return false
      return Boolean(usuario[clave])
    },
    [esAdmin, usuario],
  )
  return { can, esAdmin }
}
