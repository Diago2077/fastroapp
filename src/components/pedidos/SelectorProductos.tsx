import { Minus, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { compararTallas } from '@/lib/config'
import { formatGs } from '@/lib/format'
import { supabase } from '@/lib/supabase'

export interface ItemPedido {
  variantId: string
  code: string
  description: string
  color: string
  size: string
  qty: number
  price: number
  /** Costo de fabrica en US$. null si no se tiene permiso para verlo. */
  cost: number | null
}

interface ProductoBusqueda {
  id: string
  code: string
  description: string
  product_variants: {
    id: string
    color: string
    size: string
    sale_price: number
    created_at: string
    product_variant_costs: { cost_price: number } | { cost_price: number }[] | null
  }[]
}

const SELECT_PRODUCTO =
  'id, code, description, product_variants(id, color, size, sale_price, created_at, product_variant_costs(cost_price))'

const costoDe = (c: ProductoBusqueda['product_variants'][number]['product_variant_costs']): number | null => {
  if (!c) return null
  return Array.isArray(c) ? (c[0]?.cost_price ?? null) : c.cost_price
}

/**
 * Buscador de productos del proveedor elegido + grilla Color × Talla para
 * cargar cantidades. Devuelve, por variante, la cantidad definitiva: lo que
 * queda en 0 se saca del pedido.
 */
export function SelectorProductos({
  abierto,
  proveedorId,
  variantInicial = null,
  items,
  onCerrar,
  onAplicar,
}: {
  abierto: boolean
  proveedorId: string
  /** Si viene, abre directo la grilla del producto al que pertenece esa variante. */
  variantInicial?: string | null
  items: ItemPedido[]
  onCerrar: () => void
  onAplicar: (producto: { code: string; description: string }, variantes: ItemPedido[], idsVariantesProducto: string[]) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ProductoBusqueda[]>([])
  const [buscando, setBuscando] = useState(false)
  const [producto, setProducto] = useState<ProductoBusqueda | null>(null)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!abierto) return
    setBusqueda('')
    setResultados([])
    setProducto(null)
    if (!variantInicial) return
    let vivo = true
    ;(async () => {
      const { data: v } = await supabase
        .from('product_variants')
        .select('product_id')
        .eq('id', variantInicial)
        .maybeSingle()
      if (!v || !vivo) return
      const { data } = await supabase.from('products').select(SELECT_PRODUCTO).eq('id', v.product_id).maybeSingle()
      if (data && vivo) elegir(data as ProductoBusqueda)
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [abierto, variantInicial])

  // Busqueda con espera de 250 ms entre teclas
  useEffect(() => {
    if (!abierto || producto) return
    const q = busqueda.trim()
    if (q.length < 2) {
      setResultados([])
      return
    }
    setBuscando(true)
    const t = setTimeout(async () => {
      const limpio = q.replace(/[%,()]/g, ' ')
      const { data } = await supabase
        .from('products')
        .select(SELECT_PRODUCTO)
        .eq('active', true)
        .eq('provider_id', proveedorId)
        .or(`code.ilike.%${limpio}%,description.ilike.%${limpio}%`)
        .order('code')
        .limit(10)
      setResultados((data ?? []) as ProductoBusqueda[])
      setBuscando(false)
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda, abierto, producto, proveedorId])

  function elegir(p: ProductoBusqueda) {
    setProducto(p)
    // La grilla arranca con lo que ya hay en el pedido
    const previas: Record<string, number> = {}
    for (const i of items) previas[i.variantId] = i.qty
    setCantidades(previas)
  }

  const grilla = useMemo(() => {
    if (!producto) return null
    const colores = [...new Map(
      [...producto.product_variants]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((v) => [v.color, v.color]),
    ).keys()]
    const tallas = [...new Set(producto.product_variants.map((v) => v.size))].sort(compararTallas)
    const porClave = new Map(producto.product_variants.map((v) => [`${v.color}\u0000${v.size}`, v]))
    return { colores, tallas, porClave }
  }, [producto])

  const cambiar = (id: string, delta: number) =>
    setCantidades((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) }))

  function aplicar() {
    if (!producto) return
    const variantes: ItemPedido[] = producto.product_variants
      .filter((v) => (cantidades[v.id] ?? 0) > 0)
      .map((v) => ({
        variantId: v.id,
        code: producto.code,
        description: producto.description,
        color: v.color,
        size: v.size,
        qty: cantidades[v.id],
        // Si ya estaba en el pedido conserva su precio congelado
        price: items.find((i) => i.variantId === v.id)?.price ?? v.sale_price,
        cost: items.find((i) => i.variantId === v.id)?.cost ?? costoDe(v.product_variant_costs),
      }))
    onAplicar(
      { code: producto.code, description: producto.description },
      variantes,
      producto.product_variants.map((v) => v.id),
    )
  }

  const total = Object.entries(cantidades).reduce((s, [id, q]) => {
    const v = producto?.product_variants.find((x) => x.id === id)
    return v ? s + q : s
  }, 0)

  return (
    <Modal
      abierto={abierto}
      titulo={producto ? `${producto.code} — ${producto.description}` : 'Agregar productos'}
      descripcion={producto ? 'Carga las cantidades por color y talla.' : 'Productos del proveedor elegido.'}
      onCerrar={onCerrar}
      ancho="max-w-3xl"
      footer={
        producto ? (
          <>
            <Button variant="outline" className="mr-auto" onClick={() => setProducto(null)}>
              Volver a la busqueda
            </Button>
            <Button onClick={aplicar}>Agregar al pedido ({total} u.)</Button>
          </>
        ) : (
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
        )
      }
    >
      {!producto ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Codigo o descripcion (minimo 2 letras)…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
            />
          </div>
          {buscando && <p className="text-xs text-muted-foreground">Buscando…</p>}
          {!buscando && busqueda.trim().length >= 2 && resultados.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay productos de este proveedor que coincidan.</p>
          )}
          <ul className="divide-y divide-border rounded-md border border-border">
            {resultados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => elegir(p)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent"
                >
                  <span>
                    <span className="font-medium">{p.code}</span> — {p.description}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.product_variants.length} variantes</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : grilla && grilla.colores.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-2 py-2 text-left font-medium">Color</th>
                {grilla.tallas.map((t) => {
                  const precio = producto.product_variants.find((v) => v.size === t)?.sale_price
                  return (
                    <th key={t} className="px-2 py-2 text-center font-medium">
                      <div>{t}</div>
                      <div className="tabular text-[11px] font-normal">{precio !== undefined && formatGs(precio)}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {grilla.colores.map((color) => (
                <tr key={color} className="border-b border-border last:border-0">
                  <td className="px-2 py-2 font-medium">{color}</td>
                  {grilla.tallas.map((talla) => {
                    const v = grilla.porClave.get(`${color}\u0000${talla}`)
                    return (
                      <td key={talla} className="px-2 py-2 text-center">
                        {v ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              aria-label="Menos"
                              onClick={() => cambiar(v.id, -1)}
                              className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent"
                            >
                              <Minus className="size-3" />
                            </button>
                            <input
                              inputMode="numeric"
                              value={cantidades[v.id] ?? 0}
                              onChange={(e) =>
                                setCantidades((c) => ({ ...c, [v.id]: Math.max(0, parseInt(e.target.value, 10) || 0) }))
                              }
                              className="h-7 w-10 rounded-md border border-input bg-card text-center text-sm"
                            />
                            <button
                              type="button"
                              aria-label="Mas"
                              onClick={() => cambiar(v.id, 1)}
                              className="flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent"
                            >
                              <Plus className="size-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Este producto no tiene variantes cargadas.</p>
      )}
    </Modal>
  )
}
