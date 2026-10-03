// Migra los datos de FASTRO Pedidos (proyecto viejo) a esta app (proyecto nuevo).
//
//   node scripts/migrar-datos.mjs            # simulacro: lee, valida y cuenta, no escribe
//   node scripts/migrar-datos.mjs --aplicar  # escribe en el proyecto nuevo
//
// Lee las credenciales de `.env.migracion.local` (queda fuera de git por el
// patron *.local):
//
//   OLD_SUPABASE_URL=https://xxxx.supabase.co
//   OLD_SERVICE_ROLE_KEY=...
//   NEW_SUPABASE_URL=https://yyyy.supabase.co
//   NEW_SERVICE_ROLE_KEY=...
//
// Es de una sola corrida: el proyecto nuevo tiene que estar vacio (salvo la
// configuracion semilla). Solo LEE del proyecto viejo. Las cuentas se crean
// con contrasenas temporales que se escriben en `migracion-contrasenas.local.txt`.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')

const env = Object.fromEntries(
  readFileSync('.env.migracion.local', 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
for (const k of ['OLD_SUPABASE_URL', 'OLD_SERVICE_ROLE_KEY', 'NEW_SUPABASE_URL', 'NEW_SERVICE_ROLE_KEY']) {
  if (!env[k]) throw new Error(`Falta ${k} en .env.migracion.local`)
}
const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
const viejo = createClient(env.OLD_SUPABASE_URL, env.OLD_SERVICE_ROLE_KEY, opciones)
const nuevo = createClient(env.NEW_SUPABASE_URL, env.NEW_SERVICE_ROLE_KEY, opciones)

const log = (...a) => console.log(...a)

async function leerTodo(tabla, orden = 'id') {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await viejo.from(tabla).select('*').order(orden).range(desde, desde + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    filas.push(...data)
    if (data.length < 1000) break
  }
  return filas
}

async function insertar(tabla, filas, opts = {}) {
  if (!APLICAR || filas.length === 0) return
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500)
    const { error } = opts.upsert
      ? await nuevo.from(tabla).upsert(lote, { onConflict: opts.upsert })
      : await nuevo.from(tabla).insert(lote)
    if (error) throw new Error(`${tabla} (lote ${i}): ${error.message}`)
  }
}

// ── Lectura ────────────────────────────────────────────────
log('Leyendo el proyecto viejo…')
const perfiles = await leerTodo('profiles')
const clientes = await leerTodo('clients')
const proveedores = await leerTodo('providers')
const productos = await leerTodo('products')
const variantes = await leerTodo('product_variants')
const pedidos = await leerTodo('orders')
const items = await leerTodo('order_items')
const config = await leerTodo('app_config', 'key')

const cuentas = []
for (let pagina = 1; ; pagina++) {
  const { data, error } = await viejo.auth.admin.listUsers({ page: pagina, perPage: 200 })
  if (error) throw error
  cuentas.push(...data.users)
  if (data.users.length < 200) break
}

log({
  perfiles: perfiles.length,
  cuentas: cuentas.length,
  clientes: clientes.length,
  proveedores: proveedores.length,
  productos: productos.length,
  variantes: variantes.length,
  pedidos: pedidos.length,
  items: items.length,
  config: config.length,
})

// ── Usuarios ───────────────────────────────────────────────
const PERMISOS = [
  'can_see_cost', 'can_export_excel', 'can_view_dashboard',
  'can_view_orders', 'can_create_orders', 'can_edit_orders', 'can_delete_orders',
  'can_view_clients', 'can_create_clients', 'can_edit_clients', 'can_delete_clients',
  'can_view_products', 'can_create_products', 'can_edit_products', 'can_delete_products',
  'can_view_providers', 'can_create_providers', 'can_edit_providers', 'can_delete_providers',
  'can_view_reports',
]

const idNuevo = new Map() // id viejo -> id nuevo
const contrasenas = []

for (const p of perfiles) {
  const email = (p.email ?? cuentas.find((c) => c.id === p.id)?.email ?? '').trim().toLowerCase()
  if (!email) throw new Error(`El perfil ${p.id} no tiene email`)
  const temporal = `Fs-${randomBytes(6).toString('base64url')}`
  let id = p.id // se conserva el id viejo: asi no hay que remapear pedidos
  if (APLICAR) {
    const { data, error } = await nuevo.auth.admin.createUser({ id: p.id, email, password: temporal, email_confirm: true })
    if (error) throw new Error(`Crear cuenta ${email}: ${error.message}`)
    id = data.user.id
    const fila = {
      id,
      nombre: (p.name || email).trim(),
      email,
      rol: p.role === 'admin' ? 'admin' : 'usuario',
      activo: p.active !== false,
      ...Object.fromEntries(PERMISOS.map((k) => [k, Boolean(p[k])])),
    }
    const { error: e2 } = await nuevo.from('usuarios').insert(fila)
    if (e2) throw new Error(`Perfil ${email}: ${e2.message}`)
  }
  idNuevo.set(p.id, id)
  contrasenas.push(`${email}\t${temporal}\t${p.role}${p.active === false ? '\t(inactivo)' : ''}`)
}
log(`Usuarios: ${perfiles.length}`)

// ── Configuracion (sin destinatarios de correo/push: etapa 2) ──
const claves = new Set(['company_name', 'current_season', 'size_order'])
await insertar(
  'app_config',
  config.filter((c) => claves.has(c.key)).map(({ key, value }) => ({ key, value })),
  { upsert: 'key' },
)

// ── Catalogos ──────────────────────────────────────────────
await insertar('providers', proveedores)
await insertar('clients', clientes)
await insertar('products', productos)
await insertar(
  'product_variants',
  variantes.map(({ cost_price: _c, ...v }) => v),
)
await insertar(
  'product_variant_costs',
  variantes.map((v) => ({ variant_id: v.id, cost_price: v.cost_price ?? 0 })),
)

// ── Pedidos ────────────────────────────────────────────────
const sinDueno = pedidos.filter((o) => o.user_id && !idNuevo.has(o.user_id))
if (sinDueno.length) throw new Error(`${sinDueno.length} pedidos con vendedor desconocido`)
await insertar(
  'orders',
  pedidos.map((o) => ({ ...o, user_id: o.user_id ? idNuevo.get(o.user_id) : null })),
)
await insertar(
  'order_items',
  items.map(({ unit_cost_price: _c, ...i }) => i),
)
// El trigger ya copio el costo vigente de la variante; se pisa con el que
// tenia cada item en la app vieja (el costo "congelado" de ese momento).
await insertar(
  'order_item_costs',
  items.map((i) => ({ order_item_id: i.id, unit_cost_price: i.unit_cost_price ?? 0 })),
  { upsert: 'order_item_id' },
)

// ── Verificacion ───────────────────────────────────────────
if (APLICAR) {
  writeFileSync('migracion-contrasenas.local.txt', 'email\tcontrasena temporal\trol\n' + contrasenas.join('\n') + '\n')
  const cuenta = async (t) => (await nuevo.from(t).select('*', { count: 'exact', head: true })).count
  const resultado = {}
  for (const [tabla, esperado] of [
    ['usuarios', perfiles.length], ['clients', clientes.length], ['providers', proveedores.length],
    ['products', productos.length], ['product_variants', variantes.length], ['product_variant_costs', variantes.length],
    ['orders', pedidos.length], ['order_items', items.length], ['order_item_costs', items.length],
  ]) {
    const real = await cuenta(tabla)
    resultado[tabla] = `${real}/${esperado}${real === esperado ? ' OK' : ' ¡DIFIERE!'}`
  }
  log(resultado)
  const maxNum = Math.max(0, ...pedidos.map((o) => Number(String(o.order_number).replace(/\D/g, '')) || 0))
  log(`Falta: select setval('order_number_seq', ${maxNum});  (correrlo en el proyecto nuevo)`)
  log('Contrasenas temporales en migracion-contrasenas.local.txt')
} else {
  log('Simulacro terminado: no se escribio nada. Corre con --aplicar para migrar.')
}
