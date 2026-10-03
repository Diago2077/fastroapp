/**
 * Exportacion a PDF y Excel. Las librerias pesan bastante, asi que se
 * cargan recien cuando alguien exporta (import dinamico) y no penalizan el
 * arranque de la app.
 */
export interface Columna<T> {
  header: string
  /** Valor ya formateado para mostrar. */
  valor: (fila: T) => string | number
  /** Ancho aproximado en caracteres (Excel). */
  ancho?: number
}

/** La fuente estandar de jsPDF no tiene el simbolo del guarani: se escribe 'Gs.'. */
const paraPdf = (v: string | number): string => String(v).replaceAll('₲', 'Gs.')

export async function exportarPDF<T>(opts: {
  titulo: string
  columnas: Columna<T>[]
  filas: T[]
  archivo: string
  /** Fila de totales al final (un valor por columna). */
  pie?: (string | number)[]
}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: opts.columnas.length > 6 ? 'landscape' : 'portrait' })
  const ancho = doc.internal.pageSize.getWidth()

  doc.setFillColor(17, 17, 17)
  doc.rect(0, 0, ancho, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('FASTRO S.A.', 14, 10)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(paraPdf(opts.titulo), 14, 17)
  doc.text(`Generado: ${new Date().toLocaleDateString('es-PY')}`, ancho - 14, 17, { align: 'right' })

  autoTable(doc, {
    startY: 27,
    head: [opts.columnas.map((c) => paraPdf(c.header))],
    body: opts.filas.map((f) => opts.columnas.map((c) => paraPdf(c.valor(f)))),
    foot: opts.pie ? [opts.pie.map(paraPdf)] : undefined,
    footStyles: { fillColor: [235, 235, 238], textColor: 20, fontStyle: 'bold', fontSize: 8 },
    showFoot: 'lastPage',
    headStyles: { fillColor: [155, 0, 0], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    styles: { cellPadding: 3, overflow: 'linebreak' },
    margin: { top: 27, left: 10, right: 10 },
  })

  doc.save(opts.archivo)
}

export async function exportarExcel<T>(opts: {
  hoja: string
  columnas: Columna<T>[]
  filas: T[]
  archivo: string
  /** Fila de totales al final (un valor por columna). */
  pie?: (string | number)[]
}) {
  const XLSX = await import('xlsx')
  const datos = [
    opts.columnas.map((c) => c.header),
    ...opts.filas.map((f) => opts.columnas.map((c) => c.valor(f))),
    ...(opts.pie ? [opts.pie] : []),
  ]
  const ws = XLSX.utils.aoa_to_sheet(datos)
  ws['!cols'] = opts.columnas.map((c) => ({ wch: Math.max(c.header.length + 4, c.ancho ?? 15) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, opts.hoja.substring(0, 31))
  XLSX.writeFile(wb, opts.archivo)
}

/** Lee la primera hoja de un .xlsx/.xls/.csv como filas de objetos (primera fila = encabezados). */
export async function leerHoja(archivo: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' })
}

/** Descarga una plantilla de Excel (encabezados + filas de ejemplo). */
export async function descargarPlantilla(archivo: string, encabezados: string[], ejemplos: (string | number)[][]) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([encabezados, ...ejemplos])
  ws['!cols'] = encabezados.map((h) => ({ wch: Math.max(h.length + 4, 16) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
  XLSX.writeFile(wb, archivo)
}
