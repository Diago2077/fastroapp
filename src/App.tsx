import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import RequiereAdmin from '@/components/layout/RequiereAdmin'
import { Cargando } from '@/components/ui/estado'
import Login from '@/pages/Login'
import NoEncontrado from '@/pages/NoEncontrado'

// Todo lo que va detras del login se carga bajo demanda: el login no paga el
// peso de los graficos, el PDF ni el Excel.
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Pedidos = lazy(() => import('@/pages/Pedidos'))
const Clientes = lazy(() => import('@/pages/Clientes'))
const Productos = lazy(() => import('@/pages/Productos'))
const Marcas = lazy(() => import('@/pages/Marcas'))
const Proveedores = lazy(() => import('@/pages/Proveedores'))
const Reportes = lazy(() => import('@/pages/Reportes'))
const Usuarios = lazy(() => import('@/pages/Usuarios'))
const Configuracion = lazy(() => import('@/pages/Configuracion'))

/**
 * Dos zonas:
 *   /login   — publica
 *   /        — la app, dentro de AppLayout (exige sesion activa)
 *
 * Las pantallas se agregan como rutas hijas de AppLayout (y su link en el NAV
 * de AppLayout). Las que sean solo para administradores van dentro de
 * <RequiereAdmin>. Los permisos por modulo (`can_view_*`) los resuelve
 * AppLayout: si entran a una ruta sin permiso los manda al primer link propio.
 */
export default function App() {
  return (
    <Suspense fallback={<Cargando className="min-h-screen" />}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="pedidos" element={<Pedidos />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="productos" element={<Productos />} />
          <Route path="marcas" element={<Marcas />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="reportes" element={<Reportes />} />
          <Route element={<RequiereAdmin />}>
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>
        </Route>

        <Route path="*" element={<NoEncontrado />} />
      </Routes>
    </Suspense>
  )
}
