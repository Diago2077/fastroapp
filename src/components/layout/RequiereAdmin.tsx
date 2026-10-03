import { Navigate, Outlet } from 'react-router-dom'
import { Cargando } from '@/components/ui/estado'
import { useAuth } from '@/hooks/useAuth'

/**
 * Envuelve las rutas que son solo para administradores.
 *
 * Es una comodidad de la UI, no el control de acceso: lo que de verdad
 * protege los datos es la RLS en Postgres, que no devuelve nada aunque
 * alguien escriba la URL a mano o tenga el bundle modificado. Esto solo
 * evita que a un usuario comun le aparezca una pantalla vacia o rota.
 *
 * Espera a que termine de cargar el perfil antes de decidir: si no,
 * redirigiria en el primer render, cuando el rol todavia es null.
 */
export default function RequiereAdmin() {
  const { loading, esAdmin } = useAuth()

  if (loading) return <Cargando />
  if (!esAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
