import type { Pedido } from '@/lib/database.types'
import { totalesPedido } from '@/lib/format'

/** Pedido con lo necesario para dashboard y reportes. */
export interface PedidoStats extends Pedido {
  clients: { name: string; city: string | null } | null
  vendedor: { nombre: string } | null
  providers: { name: string } | null
  order_items: {
    quantity: number
    unit_sale_price: number
    order_item_costs: { unit_cost_price: number } | { unit_cost_price: number }[] | null
  }[]
}

/**
 * `order_item_costs` solo trae datos si quien consulta tiene `can_see_cost`
 * (lo decide la RLS): sin permiso los costos salen en 0 y las pantallas ni
 * los muestran.
 */
export const SELECT_STATS =
  '*, clients(name, city), vendedor:usuarios(nombre), providers(name), order_items(quantity, unit_sale_price, order_item_costs(unit_cost_price))'

const costoUnitario = (c: PedidoStats['order_items'][number]['order_item_costs']): number => {
  if (!c) return 0
  return Array.isArray(c) ? (c[0]?.unit_cost_price ?? 0) : c.unit_cost_price
}

/** Venta del pedido (con descuento). */
export const ventaDe = (p: PedidoStats) => totalesPedido(p.order_items, p.discount_pct).total

/** Costo del pedido: sin descuento, el descuento es sobre la venta. */
export const costoDe = (p: PedidoStats) =>
  p.order_items.reduce((s, i) => s + i.quantity * costoUnitario(i.order_item_costs), 0)

export const unidadesDe = (p: PedidoStats) => p.order_items.reduce((s, i) => s + i.quantity, 0)

/** Los cancelados no cuentan en ninguna estadistica. */
export const vigentes = (pedidos: PedidoStats[]) => pedidos.filter((p) => p.status !== 'cancelled')

export interface Grupo {
  nombre: string
  pedidos: number
  unidades: number
  ventas: number
  costo: number
}

export function agrupar(pedidos: PedidoStats[], clave: (p: PedidoStats) => string): Grupo[] {
  const mapa = new Map<string, Grupo>()
  for (const p of pedidos) {
    const nombre = clave(p) || 'Sin asignar'
    const g = mapa.get(nombre) ?? { nombre, pedidos: 0, unidades: 0, ventas: 0, costo: 0 }
    g.pedidos += 1
    g.unidades += unidadesDe(p)
    g.ventas += ventaDe(p)
    g.costo += costoDe(p)
    mapa.set(nombre, g)
  }
  return [...mapa.values()]
}

export const PALETA = ['#9B0000', '#1a1a1a', '#3182ce', '#38a169', '#d69e2e', '#805ad5', '#dd6b20']
