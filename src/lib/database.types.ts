/**
 * Tipos de la base, escritos a mano.
 *
 * Se mantienen a mano y no generados porque afinan cosas que el generador no
 * puede saber -- que `rol` es una union y no un string suelto -- y porque
 * llevan los comentarios que explican para que sirve cada campo.
 *
 * El riesgo es que una migracion los deje desactualizados en silencio. Si el
 * proyecto crece, conviene generar los tipos reales con `npm run tipos`
 * (hay que poner el project-id en package.json) y agregar al final de este
 * archivo un chequeo que compare los NOMBRES de las columnas contra
 * `database.generated.ts`: asi una columna renombrada rompe el build en vez
 * de fallar en produccion.
 */

/**
 * Los dos niveles del sistema, los dos globales:
 *   · admin   — gestiona a las demas personas y tiene todos los permisos.
 *   · usuario — usa la app con los permisos que el admin le configure.
 */
export type Rol = 'admin' | 'usuario'

export const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  usuario: 'Usuario',
}

export const ROLES: readonly Rol[] = ['usuario', 'admin']

/**
 * Permisos finos por persona (migracion 004). El Inicio es para todos: la columna
 * `can_view_dashboard` sigue en la base pero ya no se usa. Un admin activo los tiene todos
 * sin mirar estas columnas.
 */
export const PERMISOS_FLAGS = [
  'can_see_cost',
  'can_export_excel',
  'can_view_orders',
  'can_create_orders',
  'can_edit_orders',
  'can_delete_orders',
  'can_view_clients',
  'can_create_clients',
  'can_edit_clients',
  'can_delete_clients',
  'can_view_products',
  'can_create_products',
  'can_edit_products',
  'can_delete_products',
  'can_view_brands',
  'can_create_brands',
  'can_edit_brands',
  'can_delete_brands',
  'can_view_providers',
  'can_create_providers',
  'can_edit_providers',
  'can_delete_providers',
  'can_view_reports',
] as const

export type PermisoKey = (typeof PERMISOS_FLAGS)[number]
export type Permisos = Record<PermisoKey, boolean>

/** Perfil de una persona. Comparte el `id` con su cuenta de `auth.users`. */
export interface Usuario extends Permisos {
  id: string
  nombre: string
  email: string
  rol: Rol
  /** La baja. La cuenta sigue existiendo, pero la RLS deja de devolverle datos. */
  activo: boolean
  created_at: string
  updated_at: string
}

/** Campos que la base calcula sola y que no se mandan nunca en un insert/update. */
type Generados = 'created_at' | 'updated_at'

export type UsuarioInsert = Omit<Usuario, Generados>
export type UsuarioUpdate = Partial<Omit<Usuario, 'id' | Generados>>

// ─────────────────────────────────────────────────────────────
// Dominio de pedidos (migracion 005)
// ─────────────────────────────────────────────────────────────

export interface Cliente {
  id: string
  code: number | null
  name: string
  store_name: string | null
  ruc: string | null
  phone: string | null
  city: string | null
  email: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Marca {
  id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface Proveedor {
  id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface Variante {
  id: string
  product_id: string
  color: string
  size: string
  sale_price: number
  created_at: string
}

export interface Producto {
  id: string
  code: string
  description: string
  brand: string | null
  provider_id: string | null
  season: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type EstadoPedido = 'open' | 'closed' | 'sent' | 'cancelled'

export const ESTADO_LABEL: Record<EstadoPedido, string> = {
  open: 'Abierto',
  closed: 'Cerrado',
  sent: 'Enviado',
  cancelled: 'Cancelado',
}

export interface Pedido {
  id: string
  order_number: string
  client_id: string | null
  user_id: string | null
  provider_id: string | null
  status: EstadoPedido
  season: string | null
  shipping_date: string | null
  discount_pct: number
  observation: string | null
  created_at: string
  updated_at: string
}

/** Claves de `app_config` que usa la app. */
export type ConfigKey = 'current_season' | 'company_name' | 'size_order'
