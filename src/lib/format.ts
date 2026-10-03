/**
 * Helpers de formateo.
 *
 * Moneda: las ventas van en guaranies (₲) y los costos en dolares (US$).
 * Hay UN solo formato para cada una, usado en pantallas, PDFs y Excel, para
 * que no vuelva a pasar que un grafico muestre `$` para una venta en ₲.
 */

/** '2026-03-14' → '14/03/2026'. Recorta la hora si viene un timestamp. */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [fecha] = iso.split('T')
  const [a, m, d] = fecha.split('-')
  if (!a || !m || !d) return iso
  return `${d}/${m}/${a}`
}

export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return '—'
  return `${formatFecha(iso)} ${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`
}

/** Fecha de un timestamp ISO como 'YYYY-MM-DD' en hora local (para comparar con un <input type="date">). */
export function fechaLocalISO(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Fecha de hoy como 'YYYY-MM-DD' en hora local (no UTC). */
export function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Normaliza texto para buscar sin tildes ni mayusculas. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

const numero = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 })

/** 1234567 → '1.234.567' */
export function formatNumero(n: number | null | undefined): string {
  return numero.format(Math.round(n || 0))
}

/** Guaranies: '₲ 1.234.567'. Para PDFs (fuente sin glifo ₲) usar `formatGsPdf`. */
export function formatGs(n: number | null | undefined): string {
  return `₲ ${formatNumero(n)}`
}

/** Guaranies para PDF: 'Gs. 1.234.567' (la fuente estandar de jsPDF no tiene ₲). */
export function formatGsPdf(n: number | null | undefined): string {
  return `Gs. ${formatNumero(n)}`
}

/** Dolares (costos): 'US$ 1.234' */
export function formatUsd(n: number | null | undefined): string {
  return `US$ ${formatNumero(n)}`
}

/** Subtotal de una lista de items y total con descuento. */
export function totalesPedido(
  items: { quantity: number; unit_sale_price: number }[],
  descuentoPct: number,
) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_sale_price, 0)
  const descuento = subtotal * ((descuentoPct || 0) / 100)
  return { subtotal, descuento, total: subtotal - descuento }
}
