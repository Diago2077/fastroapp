/**
 * Ayudas para importar planillas: los encabezados de cada Excel vienen
 * escritos a gusto de quien lo armo ("Código", "COD", "Nro"), asi que se
 * comparan sin tildes, mayusculas ni signos.
 */
function clave(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '')
}

export type FilaPlanilla = Record<string, unknown>

/** Indexa la fila por encabezado normalizado. */
export function indexarFila(fila: FilaPlanilla): Record<string, string> {
  const salida: Record<string, string> = {}
  for (const [k, v] of Object.entries(fila)) salida[clave(k)] = v == null ? '' : String(v).trim()
  return salida
}

/** Primer valor no vacio entre los alias dados. */
export function campo(indexada: Record<string, string>, alias: string[]): string {
  for (const a of alias) {
    const v = indexada[clave(a)]
    if (v) return v
  }
  return ''
}

/** '1.234,50' / '1234.5' / 'Gs 1.000' → número. NaN si no se puede leer. */
export function aNumero(texto: string): number {
  const limpio = texto.replace(/[^\d.,-]/g, '')
  if (!limpio) return NaN
  // Si hay coma y punto, el ultimo es el decimal; si solo hay puntos y hay
  // varios o van de a tres cifras, son separadores de miles.
  const ultimaComa = limpio.lastIndexOf(',')
  const ultimoPunto = limpio.lastIndexOf('.')
  let normal = limpio
  if (ultimaComa > -1 && ultimoPunto > -1) {
    normal =
      ultimaComa > ultimoPunto
        ? limpio.replace(/\./g, '').replace(',', '.')
        : limpio.replace(/,/g, '')
  } else if (ultimaComa > -1) {
    normal = /,\d{3}$/.test(limpio) && limpio.split(',').length > 1 ? limpio.replace(/,/g, '') : limpio.replace(',', '.')
  } else if (ultimoPunto > -1 && /\.\d{3}$/.test(limpio)) {
    normal = limpio.replace(/\./g, '')
  }
  return Number(normal)
}
