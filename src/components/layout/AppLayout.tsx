import {
  BarChart3,
  Factory,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  UserRound,
  Users,
} from 'lucide-react'
import { useEffect, useState, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CambiarMiPasswordModal } from '@/components/cuenta/CambiarMiPasswordModal'
import { Button } from '@/components/ui/button'
import { Cargando } from '@/components/ui/estado'
import { MenuAcciones } from '@/components/ui/menu'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { APP_NOMBRE } from '@/lib/app'
import { cargarConfig, limpiarConfig } from '@/lib/config'
import { ROL_LABEL, type PermisoKey } from '@/lib/database.types'
import { cn } from '@/lib/utils'

interface ItemNav {
  to: string
  label: string
  icono: ComponentType<{ className?: string }>
  end?: boolean
  /** Permiso que habilita el link. 'admin' = solo administradores, 'todos' = cualquier usuario activo. */
  permiso: PermisoKey | 'admin' | 'todos'
  /** Aparece en la barra inferior del celular (el resto va en "Mas"). */
  principal?: boolean
  /** Tiene su propio boton en la barra superior (engranaje): no se repite en los menus. */
  enHeader?: boolean
}

/**
 * Los links de la barra. Una app hecha sobre esta base agrega los suyos aca
 * (y la ruta correspondiente en App.tsx): `permiso` decide si aparece, pero
 * quien protege los datos es la RLS, no esta lista.
 */
const NAV: ItemNav[] = [
  { to: '/', label: 'Inicio', icono: LayoutDashboard, end: true, permiso: 'todos', principal: true },
  { to: '/pedidos', label: 'Pedidos', icono: ShoppingCart, permiso: 'can_view_orders', principal: true },
  { to: '/productos', label: 'Productos', icono: Package, permiso: 'can_view_products', principal: true },
  { to: '/clientes', label: 'Clientes', icono: Store, permiso: 'can_view_clients', principal: true },
  { to: '/marcas', label: 'Marcas', icono: Tag, permiso: 'can_view_brands' },
  { to: '/proveedores', label: 'Proveedores', icono: Factory, permiso: 'can_view_providers' },
  { to: '/reportes', label: 'Reportes', icono: BarChart3, permiso: 'can_view_reports' },
  { to: '/usuarios', label: 'Usuarios', icono: Users, permiso: 'admin' },
  { to: '/configuracion', label: 'Configuracion', icono: Settings, permiso: 'admin', enHeader: true },
]

const MENSAJE_PROBLEMA = {
  inactivo: {
    titulo: 'Cuenta desactivada',
    texto: 'Tu usuario fue desactivado. Contactate con el administrador del sistema.',
  },
  'sin-perfil': {
    titulo: 'Cuenta sin configurar',
    texto: 'Tu usuario existe pero todavia no esta dado de alta. Contactate con el administrador del sistema.',
  },
} as const

export default function AppLayout() {
  const { user, usuario, rol, loading, problemaPerfil, signOut } = useAuth()
  const { can, esAdmin } = usePermisos()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [modalPassword, setModalPassword] = useState(false)
  const [masAbierto, setMasAbierto] = useState(false)

  const links = NAV.filter((item) =>
    item.permiso === 'todos' ? true : item.permiso === 'admin' ? esAdmin : can(item.permiso),
  )
  const enMenus = links.filter((l) => !l.enHeader)
  const principales = enMenus.filter((l) => l.principal)
  const secundarios = enMenus.filter((l) => !l.principal)

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true })
  }, [user, loading, navigate])

  // Temporada actual, orden de tallas, etc.: una vez por sesion
  const activo = Boolean(usuario?.activo)
  useEffect(() => {
    if (activo) void cargarConfig()
    else limpiarConfig()
  }, [activo])

  useEffect(() => setMasAbierto(false), [pathname])

  // Si entra a una ruta para la que no tiene permiso, va al primer link que si
  const rutaActual = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))
  const sinPermiso = Boolean(usuario?.activo) && rutaActual && !links.includes(rutaActual)
  useEffect(() => {
    if (sinPermiso && links[0]) navigate(links[0].to, { replace: true })
  }, [sinPermiso, links, navigate])

  if (loading) return <Cargando className="min-h-screen" texto="Cargando tu cuenta…" />
  if (!user) return null

  // Sesion valida pero algo impide usar la app: sin esto la pantalla queda
  // en blanco y no hay forma de entender por que.
  if (problemaPerfil) {
    const { titulo, texto } = MENSAJE_PROBLEMA[problemaPerfil]
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-xs">
          <h1 className="text-sm font-semibold text-foreground">{titulo}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
          <Button variant="outline" className="mt-5" onClick={signOut}>
            <LogOut /> Cerrar sesion
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          {/* Si el nombre no entra al lado del logo, pasa a una segunda linea y queda oculto (no se corta letra por letra) */}
          <span className="flex h-7 min-w-0 flex-wrap content-start items-center gap-x-2 overflow-hidden">
            <img src="/logo.svg" alt="" className="size-7 shrink-0 rounded-md" />
            <span className="whitespace-nowrap text-sm font-semibold leading-7 text-foreground">{APP_NOMBRE}</span>
          </span>

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {enMenus.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-2.5 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right lg:block">
              <p className="text-xs font-medium text-foreground">{usuario?.nombre}</p>
              <p className="text-[11px] text-muted-foreground">
                {rol ? ROL_LABEL[rol] : usuario?.email}
              </p>
            </div>
            <ThemeToggle />
            {esAdmin && (
              <NavLink
                to="/configuracion"
                title="Configuracion"
                aria-label="Configuracion"
                className={({ isActive }) =>
                  cn(
                    'flex size-9 items-center justify-center rounded-md transition-colors hover:bg-accent [&_svg]:size-4',
                    isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                <Settings />
              </NavLink>
            )}
            <MenuAcciones
              abajo
              etiqueta="Mi cuenta"
              icono={<UserRound />}
              encabezado={
                <>
                  <p className="truncate text-sm font-medium text-foreground">{usuario?.nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">{rol ? ROL_LABEL[rol] : usuario?.email}</p>
                </>
              }
              items={[
                { etiqueta: 'Cambiar mi contrasena', icono: <KeyRound />, onClick: () => setModalPassword(true) },
                { etiqueta: 'Cerrar sesion', icono: <LogOut />, onClick: signOut, separador: true },
              ]}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      {/* Barra inferior en celular: los 4 modulos de uso diario + "Mas" */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {principales.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
                isActive ? 'font-medium text-primary' : 'text-muted-foreground',
              )
            }
          >
            <item.icono className="size-5" />
            {item.label}
          </NavLink>
        ))}
        {secundarios.length > 0 && (
          <button
            type="button"
            onClick={() => setMasAbierto((a) => !a)}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
              masAbierto ? 'font-medium text-primary' : 'text-muted-foreground',
            )}
          >
            <MoreHorizontal className="size-5" />
            Mas
          </button>
        )}
      </nav>

      {masAbierto && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMasAbierto(false)}
        >
          <div
            className="absolute inset-x-0 bottom-14 rounded-t-lg border-t border-border bg-card p-2 pb-[env(safe-area-inset-bottom)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {secundarios.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-3 text-sm',
                    isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground',
                  )
                }
              >
                <item.icono className="size-4.5" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <CambiarMiPasswordModal abierto={modalPassword} onCerrar={() => setModalPassword(false)} />
    </div>
  )
}
