import { Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Modal } from '@/components/ui/modal'
import { mensajeError, traerTodo } from '@/lib/db'
import { descargarPlantilla, leerHoja } from '@/lib/exportar'
import { normalizar } from '@/lib/format'
import { aNumero, campo, indexarFila } from '@/lib/importar'
import { supabase } from '@/lib/supabase'

interface VarianteImport {
  color: string
  size: string
  sale: number
  cost: number | null
}

interface ProductoImport {
  code: string
  description: string
  brand: string
  provider: string
  season: string
  variantes: Map<string, VarianteImport>
}

/** Problema que impide importar: el archivo se corrige y se vuelve a subir. */
interface ErrorImport {
  titulo: string
  detalle: string
}

interface Conflicto {
  code: string
  marcaActual: string
  marcaNueva: string
}

const lotes = <T,>(arr: T[], n = 400): T[][] =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n))

/**
 * Importa productos desde una planilla con una fila por variante
 * (Codigo, Descripcion, Color, Talla, PrecioVenta + opcionales).
 *
 *  · Un codigo que ya existe con OTRA marca se avisa: se omite salvo que se
 *    tilde "reemplazar igual".
 *  · Marca y Proveedor son obligatorios y tienen que estar registrados (vistas
 *    Marcas y Proveedores); si falta alguno no se importa nada y se lista que
 *    corregir. Se escribe el nombre tal como esta registrado.
 *  · Las variantes de un producto importado quedan EXACTAMENTE las del
 *    archivo: las que no figuran se eliminan.
 *  · El costo solo se importa con `can_see_cost`.
 */
export function ImportarProductosModal({
  abierto,
  puedeVerCosto,
  onCerrar,
  onImportado,
}: {
  abierto: boolean
  puedeVerCosto: boolean
  onCerrar: () => void
  onImportado: () => void
}) {
  const [productos, setProductos] = useState<ProductoImport[]>([])
  const [conflictos, setConflictos] = useState<Conflicto[]>([])
  const [reemplazar, setReemplazar] = useState(false)
  const [errores, setErrores] = useState<ErrorImport[]>([])
  const [omitidas, setOmitidas] = useState(0)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!abierto) return
    setProductos([])
    setConflictos([])
    setErrores([])
    setReemplazar(false)
    setOmitidas(0)
    setError(null)
  }, [abierto])

  async function leer(archivo: File) {
    setLeyendo(true)
    setError(null)
    setErrores([])
    try {
      const crudas = await leerHoja(archivo)
      const porCodigo = new Map<string, ProductoImport>()
      let descartadas = 0
      for (const cruda of crudas) {
        const r = indexarFila(cruda)
        const code = campo(r, ['codigo', 'cod', 'sku']).toUpperCase()
        const description = campo(r, ['descripcion', 'producto', 'articulo', 'nombre'])
        const color = campo(r, ['color'])
        const size = campo(r, ['talla', 'talle', 'size'])
        const sale = aNumero(campo(r, ['precioventa', 'precio venta', 'venta', 'precio']))
        if (!code || !description || !color || !size || Number.isNaN(sale)) {
          descartadas++
          continue
        }
        let p = porCodigo.get(code)
        if (p) {
          // Si la primera fila no traia marca o proveedor y otra si, se toma la que esta
          p.brand ||= campo(r, ['marca', 'brand'])
          p.provider ||= campo(r, ['proveedor', 'fabrica', 'provider'])
        } else {
          p = {
            code,
            description,
            brand: campo(r, ['marca', 'brand']),
            provider: campo(r, ['proveedor', 'fabrica', 'provider']),
            season: campo(r, ['temporada', 'season']),
            variantes: new Map(),
          }
          porCodigo.set(code, p)
        }
        const costo = aNumero(campo(r, ['preciocosto', 'precio costo', 'costo', 'cost']))
        p.variantes.set(`${color}\u0000${size}`, { color, size, sale, cost: Number.isNaN(costo) ? null : costo })
      }
      const lista = [...porCodigo.values()]

      // Marca y proveedor: obligatorios y ya registrados (se usa el nombre registrado)
      const [marcasReg, proveedoresReg] = await Promise.all([
        traerTodo<{ name: string }>(() => supabase.from('brands').select('name').eq('active', true).order('id')),
        traerTodo<{ name: string }>(() => supabase.from('providers').select('name').eq('active', true).order('id')),
      ])
      const nombreMarca = new Map(marcasReg.map((m) => [normalizar(m.name), m.name]))
      const nombreProveedor = new Map(proveedoresReg.map((p) => [normalizar(p.name), p.name]))
      const sinMarca: string[] = []
      const sinProveedor: string[] = []
      const marcasNuevas = new Set<string>()
      const proveedoresNuevos = new Set<string>()
      for (const p of lista) {
        if (!p.brand) sinMarca.push(p.code)
        else if (nombreMarca.has(normalizar(p.brand))) p.brand = nombreMarca.get(normalizar(p.brand))!
        else marcasNuevas.add(p.brand)
        if (!p.provider) sinProveedor.push(p.code)
        else if (nombreProveedor.has(normalizar(p.provider))) p.provider = nombreProveedor.get(normalizar(p.provider))!
        else proveedoresNuevos.add(p.provider)
      }
      const resumen = (xs: string[]) => (xs.length > 8 ? `${xs.slice(0, 8).join(', ')} y ${xs.length - 8} mas` : xs.join(', '))
      const problemas: ErrorImport[] = []
      if (sinMarca.length) problemas.push({ titulo: `${sinMarca.length} producto(s) sin Marca`, detalle: `Codigos: ${resumen(sinMarca)}` })
      if (sinProveedor.length)
        problemas.push({ titulo: `${sinProveedor.length} producto(s) sin Proveedor`, detalle: `Codigos: ${resumen(sinProveedor)}` })
      if (marcasNuevas.size)
        problemas.push({
          titulo: `${marcasNuevas.size} marca(s) no registrada(s)`,
          detalle: `${resumen([...marcasNuevas])}. Registralas primero en Marcas.`,
        })
      if (proveedoresNuevos.size)
        problemas.push({
          titulo: `${proveedoresNuevos.size} proveedor(es) no registrado(s)`,
          detalle: `${resumen([...proveedoresNuevos])}. Registralos primero en Proveedores.`,
        })
      setErrores(problemas)

      // Codigos existentes con otra marca
      const existentes = await traerTodo<{ code: string; brand: string | null }>(() =>
        supabase.from('products').select('code, brand').order('id'),
      )
      const marcaActual = new Map(existentes.map((e) => [e.code, e.brand ?? '']))
      const choques: Conflicto[] = lista
        .filter((p) => {
          const actual = marcaActual.get(p.code)
          return actual !== undefined && actual && p.brand && normalizar(actual) !== normalizar(p.brand)
        })
        .map((p) => ({ code: p.code, marcaActual: marcaActual.get(p.code) ?? '', marcaNueva: p.brand }))

      setProductos(lista)
      setConflictos(choques)
      setOmitidas(descartadas)
      if (lista.length === 0) setError('No se encontro ninguna fila valida (hace falta Codigo, Descripcion, Color, Talla y PrecioVenta).')
    } catch {
      setError('No se pudo leer el archivo.')
    }
    setLeyendo(false)
  }

  async function importar() {
    setGuardando(true)
    setError(null)
    try {
      const omitir = new Set(reemplazar ? [] : conflictos.map((c) => c.code))
      const aImportar = productos.filter((p) => !omitir.has(p.code))

      // Proveedores: ya validados al leer el archivo (existen y estan activos)
      const proveedores = await traerTodo<{ id: string; name: string }>(() =>
        supabase.from('providers').select('id, name').eq('active', true).order('id'),
      )
      const idProveedor = new Map(proveedores.map((p) => [normalizar(p.name), p.id]))

      // Productos existentes: lo que el archivo no trae se conserva
      const previos = await traerTodo<{ id: string; code: string; brand: string | null; provider_id: string | null; season: string | null }>(
        () => supabase.from('products').select('id, code, brand, provider_id, season').order('id'),
      )
      const previoPorCodigo = new Map(previos.map((p) => [p.code, p]))

      const filasProducto = aImportar.map((p) => {
        const previo = previoPorCodigo.get(p.code)
        return {
          code: p.code,
          description: p.description,
          brand: p.brand,
          provider_id: idProveedor.get(normalizar(p.provider)) ?? null,
          season: p.season || previo?.season || null,
          active: true,
        }
      })
      const idPorCodigo = new Map<string, string>()
      for (const lote of lotes(filasProducto)) {
        const { data, error: err } = await supabase.from('products').upsert(lote, { onConflict: 'code' }).select('id, code')
        if (err) throw err
        for (const f of data ?? []) idPorCodigo.set(f.code as string, f.id as string)
      }

      // Variantes
      const filasVariante = aImportar.flatMap((p) =>
        [...p.variantes.values()].map((v) => ({
          product_id: idPorCodigo.get(p.code)!,
          color: v.color,
          size: v.size,
          sale_price: v.sale,
        })),
      )
      const costoPorClave = new Map<string, number>()
      for (const p of aImportar) {
        for (const v of p.variantes.values()) {
          if (v.cost !== null) costoPorClave.set(`${idPorCodigo.get(p.code)}\u0000${v.color}\u0000${v.size}`, v.cost)
        }
      }
      const idVariante = new Map<string, string>()
      for (const lote of lotes(filasVariante)) {
        const { data, error: err } = await supabase
          .from('product_variants')
          .upsert(lote, { onConflict: 'product_id,color,size' })
          .select('id, product_id, color, size')
        if (err) throw err
        for (const v of data ?? []) idVariante.set(`${v.product_id}\u0000${v.color}\u0000${v.size}`, v.id as string)
      }

      // Variantes que el archivo ya no trae
      const idsProducto = [...idPorCodigo.values()]
      const sobrantes: string[] = []
      for (const lote of lotes(idsProducto, 100)) {
        const { data } = await supabase.from('product_variants').select('id, product_id, color, size').in('product_id', lote)
        for (const v of data ?? []) {
          if (!idVariante.has(`${v.product_id}\u0000${v.color}\u0000${v.size}`)) sobrantes.push(v.id as string)
        }
      }
      for (const lote of lotes(sobrantes, 100)) {
        const { error: err } = await supabase.from('product_variants').delete().in('id', lote)
        if (err) throw err
      }

      if (puedeVerCosto && costoPorClave.size) {
        const costos = [...costoPorClave.entries()]
          .map(([k, cost_price]) => ({ variant_id: idVariante.get(k)!, cost_price }))
          .filter((c) => c.variant_id)
        for (const lote of lotes(costos)) {
          const { error: err } = await supabase.from('product_variant_costs').upsert(lote, { onConflict: 'variant_id' })
          if (err) throw err
        }
      }

      toast.success(`Importados ${aImportar.length} productos (${filasVariante.length} variantes)`)
      onImportado()
    } catch (e) {
      setError(mensajeError(e as { message: string; code?: string }, 'No se pudo importar el archivo.'))
    }
    setGuardando(false)
  }

  const cantidad = errores.length > 0 ? 0 : productos.length - (reemplazar ? 0 : conflictos.length)

  return (
    <Modal
      abierto={abierto}
      titulo="Importar productos"
      descripcion="Una fila por variante. Obligatorias: Codigo, Descripcion, Marca, Proveedor, Color, Talla y PrecioVenta (la marca y el proveedor tienen que estar registrados). Opcionales: Temporada y PrecioCosto."
      onCerrar={onCerrar}
      ancho="max-w-2xl"
      footer={
        <>
          <Button
            variant="outline"
            className="mr-auto"
            onClick={() =>
              descargarPlantilla(
                'plantilla-productos.xlsx',
                ['Codigo', 'Descripcion', 'Marca', 'Proveedor', 'Temporada', 'Color', 'Talla', 'PrecioVenta', 'PrecioCosto'],
                [
                  ['REM-001', 'Remera lisa', 'Nike', 'Fabrica Uno', 'Verano 2026', 'Negro', 'M', 120000, 15],
                  ['REM-001', 'Remera lisa', 'Nike', 'Fabrica Uno', 'Verano 2026', 'Negro', 'L', 120000, 15],
                ],
              )
            }
          >
            Descargar plantilla
          </Button>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={guardando || cantidad <= 0}>
            {guardando ? 'Importando…' : `Importar ${cantidad > 0 ? cantidad : ''}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f) void leer(f)
          }}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 text-sm text-muted-foreground hover:bg-accent/40"
        >
          <Upload className="size-5" />
          {leyendo ? 'Leyendo…' : 'Toca para elegir un archivo o arrastralo aca'}
        </button>

        {errores.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
            <p className="mb-2 font-medium text-foreground">No se puede importar: corregi el archivo y volve a subirlo.</p>
            <ul className="space-y-1 text-muted-foreground">
              {errores.map((e) => (
                <li key={e.titulo}>
                  <span className="font-medium text-foreground">{e.titulo}.</span> {e.detalle}
                </li>
              ))}
            </ul>
          </div>
        )}

        {productos.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {productos.length} productos y {productos.reduce((s, p) => s + p.variantes.size, 0)} variantes
              {omitidas > 0 && ` · ${omitidas} filas omitidas por datos incompletos`}. Atencion: las variantes de
              un producto que ya existe quedan exactamente como en el archivo (las que no figuran se eliminan).
              {!puedeVerCosto && ' Tu usuario no puede ver costos: la columna PrecioCosto se ignora.'}
            </p>

            {conflictos.length > 0 && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
                <p className="mb-2 font-medium text-foreground">
                  {conflictos.length} codigo(s) ya existen con otra marca:
                </p>
                <ul className="mb-2 max-h-28 list-inside list-disc overflow-auto text-muted-foreground">
                  {conflictos.map((c) => (
                    <li key={c.code}>
                      {c.code}: {c.marcaActual} → {c.marcaNueva}
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-foreground">
                  <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
                  Reemplazar igual (si no, esos codigos se omiten)
                </label>
              </div>
            )}

            <div className="max-h-56 overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-1.5">Codigo</th>
                    <th className="px-3 py-1.5">Descripcion</th>
                    <th className="px-3 py-1.5">Marca</th>
                    <th className="px-3 py-1.5 text-right">Variantes</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.slice(0, 50).map((p) => (
                    <tr key={p.code} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5">{p.code}</td>
                      <td className="px-3 py-1.5">{p.description}</td>
                      <td className="px-3 py-1.5">{p.brand}</td>
                      <td className="px-3 py-1.5 text-right">{p.variantes.size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
