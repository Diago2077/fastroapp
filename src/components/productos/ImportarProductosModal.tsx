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
 *  · Los proveedores que no existen se crean por nombre.
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
  const [omitidas, setOmitidas] = useState(0)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!abierto) return
    setProductos([])
    setConflictos([])
    setReemplazar(false)
    setOmitidas(0)
    setError(null)
  }, [abierto])

  async function leer(archivo: File) {
    setLeyendo(true)
    setError(null)
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
        if (!p) {
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

      // Proveedores: los que faltan se crean
      const proveedores = await traerTodo<{ id: string; name: string }>(() =>
        supabase.from('providers').select('id, name').order('id'),
      )
      const idProveedor = new Map(proveedores.map((p) => [normalizar(p.name), p.id]))
      const faltan = [...new Set(aImportar.map((p) => p.provider).filter((n) => n && !idProveedor.has(normalizar(n))))]
      if (faltan.length) {
        const { data, error: err } = await supabase.from('providers').insert(faltan.map((name) => ({ name }))).select('id, name')
        if (err) throw err
        for (const p of data ?? []) idProveedor.set(normalizar(p.name as string), p.id as string)
      }

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
          brand: p.brand || previo?.brand || null,
          provider_id: (p.provider && idProveedor.get(normalizar(p.provider))) || previo?.provider_id || null,
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

  const cantidad = productos.length - (reemplazar ? 0 : conflictos.length)

  return (
    <Modal
      abierto={abierto}
      titulo="Importar productos"
      descripcion="Una fila por variante. Obligatorias: Codigo, Descripcion, Color, Talla y PrecioVenta. Opcionales: Marca, Proveedor, Temporada y PrecioCosto."
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
