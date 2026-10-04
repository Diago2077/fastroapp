import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input, Select } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { getConfig, ordenarTallas } from '@/lib/config'
import { mensajeError } from '@/lib/db'
import type { Marca, Producto, Proveedor } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

interface FilaTalla {
  size: string
  sale: string
  cost: string
}

interface VarianteCargada {
  id: string
  color: string
  size: string
  sale_price: number
  product_variant_costs: { cost_price: number } | { cost_price: number }[] | null
}

const costoDe = (v: VarianteCargada): number | null => {
  const c = v.product_variant_costs
  if (!c) return null
  return Array.isArray(c) ? (c[0]?.cost_price ?? null) : c.cost_price
}

/**
 * Alta y edicion de un producto con su grilla Color × Talla.
 *
 * El precio de venta es por talla (el mismo para todos los colores), y cada
 * combinacion color × talla es una variante. El costo solo se ve y se edita
 * con `can_see_cost`: sin ese permiso la base ni siquiera lo devuelve, y al
 * guardar no se toca el costo de las variantes que ya existian.
 */
export function ProductoForm({
  abierto,
  productoId,
  proveedores,
  puedeVerCosto,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  /** null = producto nuevo */
  productoId: string | null
  proveedores: Proveedor[]
  puedeVerCosto: boolean
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [marca, setMarca] = useState('')
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [proveedor, setProveedor] = useState('')
  const [temporada, setTemporada] = useState('')
  const [tallas, setTallas] = useState<FilaTalla[]>([{ size: '', sale: '', cost: '' }])
  const [colores, setColores] = useState<string[]>([])
  const [nuevoColor, setNuevoColor] = useState('')

  // Las marcas se eligen del catalogo (vista Marcas)
  useEffect(() => {
    if (!abierto) return
    void supabase
      .from('brands')
      .select('*')
      .eq('active', true)
      .order('name')
      .then(({ data }) => setMarcas((data ?? []) as Marca[]))
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    setError(null)
    setNuevoColor('')

    if (!productoId) {
      setCodigo('')
      setDescripcion('')
      setMarca('')
      setProveedor('')
      setTemporada(getConfig('current_season'))
      setTallas([{ size: '', sale: '', cost: '' }])
      setColores([])
      return
    }

    let vivo = true
    setCargando(true)
    void supabase
      .from('products')
      .select('*, product_variants(id, color, size, sale_price, product_variant_costs(cost_price))')
      .eq('id', productoId)
      .single()
      .then(({ data, error: err }) => {
        if (!vivo) return
        setCargando(false)
        if (err || !data) return setError('No se pudo cargar el producto.')
        const p = data as Producto & { product_variants: VarianteCargada[] }
        setCodigo(p.code)
        setDescripcion(p.description)
        setMarca(p.brand ?? '')
        setProveedor(p.provider_id ?? '')
        setTemporada(p.season ?? '')
        const porTalla = new Map<string, FilaTalla>()
        for (const v of p.product_variants) {
          if (!porTalla.has(v.size)) {
            porTalla.set(v.size, {
              size: v.size,
              sale: String(v.sale_price),
              cost: String(costoDe(v) ?? ''),
            })
          }
        }
        const ordenadas = ordenarTallas([...porTalla.keys()]).map((t) => porTalla.get(t)!)
        setTallas(ordenadas.length ? ordenadas : [{ size: '', sale: '', cost: '' }])
        setColores([...new Set(p.product_variants.map((v) => v.color))])
      })
    return () => {
      vivo = false
    }
  }, [abierto, productoId])

  function agregarColor() {
    const nuevos = nuevoColor
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    if (nuevos.length) setColores((c) => [...new Set([...c, ...nuevos])])
    setNuevoColor('')
  }

  const tallasValidas = tallas.filter((t) => t.size.trim())
  const cantidadVariantes = tallasValidas.length * colores.length

  async function guardar() {
    setError(null)
    if (!codigo.trim() || !descripcion.trim()) return setError('Codigo y descripcion son obligatorios.')
    if (!marca) return setError('Elegi la marca (si no existe, registrala primero en Marcas).')
    if (!proveedor) return setError('Elegi el proveedor (si no existe, registralo primero en Proveedores).')
    const talles = new Map<string, FilaTalla>()
    for (const t of tallasValidas) talles.set(t.size.trim(), { ...t, size: t.size.trim() })
    if (talles.size !== tallasValidas.length) return setError('Hay tallas repetidas.')
    for (const t of talles.values()) {
      if (t.sale === '' || Number(t.sale) < 0 || Number.isNaN(Number(t.sale))) {
        return setError(`La talla ${t.size} necesita un precio de venta valido.`)
      }
    }
    if (talles.size === 0 || colores.length === 0) return setError('Agrega al menos una talla y un color.')

    setGuardando(true)
    try {
      const datos = {
        code: codigo.trim(),
        description: descripcion.trim(),
        brand: marca,
        provider_id: proveedor,
        season: temporada.trim() || null,
      }
      let id = productoId
      if (id) {
        const { error: err } = await supabase.from('products').update(datos).eq('id', id)
        if (err) throw err
      } else {
        const { data, error: err } = await supabase.from('products').insert(datos).select('id').single()
        if (err) throw err
        id = data.id as string
      }

      const filas = colores.flatMap((color) =>
        [...talles.values()].map((t) => ({
          product_id: id!,
          color,
          size: t.size,
          sale_price: Number(t.sale),
        })),
      )
      const { data: guardadas, error: errVar } = await supabase
        .from('product_variants')
        .upsert(filas, { onConflict: 'product_id,color,size' })
        .select('id, color, size')
      if (errVar) throw errVar

      // Variantes que ya no estan en la grilla
      const { data: actuales } = await supabase.from('product_variants').select('id, color, size').eq('product_id', id!)
      const vigentes = new Set(filas.map((f) => `${f.color}\u0000${f.size}`))
      const sobrantes = (actuales ?? []).filter((v) => !vigentes.has(`${v.color}\u0000${v.size}`)).map((v) => v.id as string)
      if (sobrantes.length) {
        const { error: errDel } = await supabase.from('product_variants').delete().in('id', sobrantes)
        if (errDel) throw errDel
      }

      if (puedeVerCosto) {
        const costos = (guardadas ?? []).map((v) => ({
          variant_id: v.id as string,
          cost_price: Number(talles.get(v.size as string)?.cost || 0),
        }))
        if (costos.length) {
          const { error: errCosto } = await supabase.from('product_variant_costs').upsert(costos, { onConflict: 'variant_id' })
          if (errCosto) throw errCosto
        }
      }

      toast.success(productoId ? 'Producto actualizado' : 'Producto creado')
      onGuardado()
    } catch (e) {
      const err = e as { message: string; code?: string }
      setError(err.code === '23505' ? 'Ya existe un producto con ese codigo.' : mensajeError(err, 'No se pudo guardar el producto.'))
    }
    setGuardando(false)
  }

  return (
    <Modal
      abierto={abierto}
      titulo={productoId ? 'Editar producto' : 'Nuevo producto'}
      onCerrar={onCerrar}
      ancho="max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || cargando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      {cargando ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Codigo *">
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus />
            </Field>
            <Field label="Descripcion *">
              <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </Field>
            <Field label="Marca *">
              <Select value={marca} onChange={(e) => setMarca(e.target.value)}>
                <option value="">Elegir marca…</option>
                {/* Una marca que ya no esta en el catalogo (dada de baja) se conserva hasta que se cambie */}
                {marca && !marcas.some((m) => m.name === marca) && <option value={marca}>{marca}</option>}
                {marcas.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Proveedor *">
              <Select value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                <option value="">Elegir proveedor…</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Temporada">
              <Input value={temporada} onChange={(e) => setTemporada(e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Tallas y precios *</p>
            <div className="space-y-2">
              {tallas.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="w-24"
                    placeholder="Talla"
                    value={t.size}
                    onChange={(e) => setTallas((ts) => ts.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Precio venta (₲)"
                    value={t.sale}
                    onChange={(e) => setTallas((ts) => ts.map((x, j) => (j === i ? { ...x, sale: e.target.value } : x)))}
                  />
                  {puedeVerCosto && (
                    <Input
                      type="number"
                      min={0}
                      placeholder="Costo (US$)"
                      value={t.cost}
                      onChange={(e) => setTallas((ts) => ts.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar talla"
                    disabled={tallas.length === 1}
                    onClick={() => setTallas((ts) => ts.filter((_, j) => j !== i))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setTallas((ts) => [...ts, { size: '', sale: '', cost: '' }])}
            >
              <Plus /> Agregar talla
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Colores *</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {colores.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs">
                  {c}
                  <button type="button" aria-label={`Quitar ${c}`} onClick={() => setColores((cs) => cs.filter((x) => x !== c))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Color (varios separados por coma)"
                value={nuevoColor}
                onChange={(e) => setNuevoColor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    agregarColor()
                  }
                }}
              />
              <Button variant="outline" onClick={agregarColor}>
                Agregar
              </Button>
            </div>
          </div>

          {cantidadVariantes > 0 && (
            <p className="text-xs text-muted-foreground">
              {cantidadVariantes} variantes ({colores.length} colores × {tallasValidas.length} tallas)
            </p>
          )}
          {error && <ErrorBox mensaje={error} />}
        </div>
      )}
    </Modal>
  )
}
