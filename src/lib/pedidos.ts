import type { EstadoPedido, Pedido } from '@/lib/database.types'
import { ESTADO_LABEL } from '@/lib/database.types'
import { formatFecha, formatGsPdf, totalesPedido } from '@/lib/format'
import { supabase } from '@/lib/supabase'


/** Pedido tal como lo muestran las listas, con lo necesario para calcular el total. */
export interface PedidoLista extends Pedido {
  clients: { id: string; name: string } | null
  vendedor: { id: string; nombre: string } | null
  providers: { name: string } | null
  order_items: {
    quantity: number
    unit_sale_price: number
    order_item_costs: { unit_cost_price: number } | { unit_cost_price: number }[] | null
  }[]
}

export const SELECT_LISTA =
  '*, clients(id, name), vendedor:usuarios(id, nombre), providers(name), order_items(quantity, unit_sale_price, order_item_costs(unit_cost_price))'

export const totalPedido = (p: PedidoLista) => totalesPedido(p.order_items, p.discount_pct).total

/** Costo de fabrica (US$). Es 0 si quien consulta no tiene can_see_cost: la base no devuelve los costos. */
export const costoPedido = (p: PedidoLista) =>
  p.order_items.reduce((s, i) => {
    const c = i.order_item_costs
    const unit = !c ? 0 : Array.isArray(c) ? (c[0]?.unit_cost_price ?? 0) : c.unit_cost_price
    return s + i.quantity * unit
  }, 0)

export const unidadesPedido = (p: PedidoLista) => p.order_items.reduce((s, i) => s + i.quantity, 0)

/** Ciclo del boton de estado: abierto → cerrado → enviado → abierto. */
export const SIGUIENTE_ESTADO: Record<Exclude<EstadoPedido, 'cancelled'>, EstadoPedido> = {
  open: 'closed',
  closed: 'sent',
  sent: 'open',
}

/** Cerrado→Enviado y Enviado→Abierto (y cancelar/reactivar) son solo del admin. */
export function cambioSoloAdmin(actual: EstadoPedido, siguiente: EstadoPedido): boolean {
  return (
    (actual === 'closed' && siguiente === 'sent') ||
    (actual === 'sent' && siguiente === 'open') ||
    siguiente === 'cancelled' ||
    actual === 'cancelled'
  )
}

export const TONO_ESTADO = {
  open: 'primary',
  closed: 'warning',
  sent: 'success',
  cancelled: 'neutral',
} as const

export const etiquetaEstado = (e: EstadoPedido) => ESTADO_LABEL[e]

// ─────────────────────────────────────────────────────────────
// Exportacion de UN pedido (PDF / Excel)
// ─────────────────────────────────────────────────────────────

interface PedidoCompleto extends Pedido {
  clients: { name: string; ruc: string | null; phone: string | null; code: number | null; store_name: string | null } | null
  vendedor: { nombre: string } | null
  providers: { name: string } | null
  order_items: {
    quantity: number
    unit_sale_price: number
    product_variants: { color: string; size: string; products: { code: string; description: string } | null } | null
    order_item_costs: { unit_cost_price: number } | { unit_cost_price: number }[] | null
  }[]
}

async function cargarPedidoCompleto(id: string): Promise<PedidoCompleto> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      '*, clients(name, ruc, phone, code, store_name), vendedor:usuarios(nombre), providers(name), order_items(quantity, unit_sale_price, product_variants(color, size, products(code, description)), order_item_costs(unit_cost_price))',
    )
    .eq('id', id)
    .single()
  if (error || !data) throw new Error('No se pudo cargar el pedido.')
  return data as unknown as PedidoCompleto
}

const costoDeItem = (i: PedidoCompleto['order_items'][number]): number | null => {
  const c = i.order_item_costs
  if (!c) return null
  return Array.isArray(c) ? (c[0]?.unit_cost_price ?? null) : c.unit_cost_price
}

function lineas(p: PedidoCompleto) {
  return [...p.order_items]
    .map((i) => ({
      codigo: i.product_variants?.products?.code ?? '',
      descripcion: i.product_variants?.products?.description ?? '(producto eliminado)',
      color: i.product_variants?.color ?? '',
      talla: i.product_variants?.size ?? '',
      cantidad: i.quantity,
      precio: i.unit_sale_price,
      costo: costoDeItem(i),
      subtotal: i.quantity * i.unit_sale_price,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.color.localeCompare(b.color))
}

export async function exportarPedidoPDF(id: string) {
  const [{ jsPDF }, { default: autoTable }, p] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    cargarPedidoCompleto(id),
  ])
  const doc = new jsPDF()
  const ancho = doc.internal.pageSize.getWidth()
  const t = totalesPedido(p.order_items, p.discount_pct)

  doc.setFillColor(17, 17, 17)
  doc.rect(0, 0, ancho, 26, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('FASTRO S.A.', 14, 12)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('PEDIDO DE COMPRA', 14, 19)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(p.order_number, ancho - 14, 12, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(formatFecha(p.created_at), ancho - 14, 19, { align: 'right' })

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(9)
  const datos: [string, string][] = [
    ['Cliente', p.clients ? `${p.clients.code ?? ''} — ${p.clients.name}${p.clients.store_name ? ` (${p.clients.store_name})` : ''}` : '—'],
    ['RUC', p.clients?.ruc ?? '—'],
    ['Telefono', p.clients?.phone ?? '—'],
    ['Vendedor', p.vendedor?.nombre ?? '—'],
    ['Temporada', p.season ?? '—'],
    ['Envio', formatFecha(p.shipping_date)],
  ]
  let y = 34
  for (const [k, v] of datos) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${k}:`, 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(v, 38, y)
    y += 5.5
  }

  autoTable(doc, {
    startY: y + 3,
    head: [['Codigo', 'Descripcion', 'Color', 'Talla', 'Cant.', 'P. Venta', 'Subtotal']],
    body: lineas(p).map((l) => [
      l.codigo,
      l.descripcion,
      l.color,
      l.talla,
      String(l.cantidad),
      formatGsPdf(l.precio),
      formatGsPdf(l.subtotal),
    ]),
    headStyles: { fillColor: [155, 0, 0], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: 10, right: 10 },
    // Los totales van solo al pie de la ultima pagina
    foot: [
      ['', '', '', '', '', 'Subtotal', formatGsPdf(t.subtotal)],
      ['', '', '', '', '', `Descuento (${p.discount_pct}%)`, `- ${formatGsPdf(t.descuento)}`],
      ['', '', '', '', '', 'TOTAL', formatGsPdf(t.total)],
    ],
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold', halign: 'right' },
    showFoot: 'lastPage',
  })

  if (p.observation?.trim()) {
    const fin = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Observacion:', 14, fin + 10)
    doc.setFont('helvetica', 'normal')
    doc.text(doc.splitTextToSize(p.observation, ancho - 28), 14, fin + 15)
  }

  doc.save(`${p.order_number}.pdf`)
}

/** El costo solo se incluye si `conCosto` (can_see_cost): la base ya no lo devuelve sin permiso. */
export async function exportarPedidoExcel(id: string, conCosto: boolean) {
  const [XLSX, p] = await Promise.all([import('xlsx'), cargarPedidoCompleto(id)])
  const t = totalesPedido(p.order_items, p.discount_pct)
  const ls = lineas(p)

  const encabezado = ['Codigo', 'Descripcion', 'Color', 'Talla', 'Cantidad', 'P. Venta (Gs)', ...(conCosto ? ['P. Costo (US$)'] : []), 'Subtotal (Gs)']
  const filas = ls.map((l) => [
    l.codigo,
    l.descripcion,
    l.color,
    l.talla,
    l.cantidad,
    l.precio,
    ...(conCosto ? [l.costo ?? ''] : []),
    l.subtotal,
  ])
  const hueco = conCosto ? 4 : 3
  const datos: (string | number)[][] = [
    ['PEDIDO', p.order_number],
    ['Fecha', formatFecha(p.created_at)],
    ['Cliente', p.clients?.name ?? ''],
    ['RUC', p.clients?.ruc ?? ''],
    ['Telefono', p.clients?.phone ?? ''],
    ['Vendedor', p.vendedor?.nombre ?? ''],
    ['Proveedor', p.providers?.name ?? ''],
    ['Temporada', p.season ?? ''],
    ['Estado', ESTADO_LABEL[p.status]],
    ['Envio', formatFecha(p.shipping_date)],
    [],
    encabezado,
    ...filas,
    [],
    [...Array(hueco + 2).fill(''), 'Subtotal', t.subtotal],
    [...Array(hueco + 2).fill(''), `Descuento (${p.discount_pct}%)`, -t.descuento],
    [...Array(hueco + 2).fill(''), 'TOTAL', t.total],
  ]
  if (p.observation?.trim()) datos.push([], ['Observacion', p.observation])

  const ws = XLSX.utils.aoa_to_sheet(datos)
  ws['!cols'] = [{ wch: 14 }, { wch: 36 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, p.order_number)
  XLSX.writeFile(wb, `${p.order_number}.xlsx`)
}

