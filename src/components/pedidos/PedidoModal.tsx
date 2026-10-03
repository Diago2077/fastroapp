import { Ban, Copy, FileDown, FileSpreadsheet, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CambioEstadoModal, type CambioEstado } from '@/components/pedidos/CambioEstadoModal'
import { SelectorProductos, type ItemPedido } from '@/components/pedidos/SelectorProductos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { MenuAcciones, type ItemMenu } from '@/components/ui/menu'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { claveLocal } from '@/lib/app'
import { getConfig } from '@/lib/config'
import { ESTADO_LABEL, type EstadoPedido, type Pedido } from '@/lib/database.types'
import { mensajeError } from '@/lib/db'
import { formatFecha, formatGs, formatUsd, normalizar, totalesPedido } from '@/lib/format'
import {
  cambioSoloAdmin,
  exportarPedidoExcel,
  exportarPedidoPDF,
  SIGUIENTE_ESTADO,
  TONO_ESTADO,
} from '@/lib/pedidos'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface ClienteOpcion {
  id: string
  code: number | null
  name: string
  store_name: string | null
}

interface Formulario {
  clientId: string
  providerId: string
  season: string
  discount: string
  observation: string
  items: ItemPedido[]
}

const FORM_VACIO = (): Formulario => ({
  clientId: '',
  providerId: '',
  season: getConfig('current_season'),
  discount: '0',
  observation: '',
  items: [],
})

interface PedidoCargado extends Pedido {
  order_items: {
    quantity: number
    unit_sale_price: number
    product_variants: { id: string; color: string; size: string; products: { code: string; description: string } | null } | null
    order_item_costs: { unit_cost_price: number } | { unit_cost_price: number }[] | null
  }[]
}

/**
 * Alta / edicion de un pedido. `pedidoId` null = pedido nuevo.
 *
 *  · Un pedido que no esta Abierto es de solo lectura (para tocarlo hay que
 *    reabrirlo, y eso es del admin).
 *  · Los precios no se mandan al guardar: la base toma el de venta de la
 *    variante (o conserva el congelado) y congela el costo ella misma.
 *  · Un pedido nuevo guarda borrador en localStorage (por usuario) para no
 *    perderlo si se cierra la pestana o se corta la conexion en el celular.
 */
export function PedidoModal({
  abierto,
  pedidoId,
  duplicarDe = null,
  onDuplicar,
  onCerrar,
  onCambio,
}: {
  abierto: boolean
  pedidoId: string | null
  /** Con pedidoId null: arma un pedido nuevo copiando este (precios vigentes). */
  duplicarDe?: string | null
  onDuplicar?: (id: string) => void
  onCerrar: () => void
  /** Algo cambio en la base (guardado, estado, borrado): recargar la lista. */
  onCambio: () => void
}) {
  const { usuario } = useAuth()
  const { can, esAdmin } = usePermisos()
  const claveBorrador = claveLocal(`pedido-borrador:${usuario?.id ?? ''}`)

  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientes, setClientes] = useState<ClienteOpcion[]>([])
  const [proveedores, setProveedores] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState<Formulario>(FORM_VACIO)
  const [original, setOriginal] = useState('')
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [filtroItems, setFiltroItems] = useState('')
  const [selector, setSelector] = useState(false)
  /** Variante de la fila tocada: abre el selector directo en ese producto. */
  const [variantEditar, setVariantEditar] = useState<string | null>(null)
  const [cambio, setCambio] = useState<CambioEstado | null>(null)
  const [confirmarSalir, setConfirmarSalir] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [borrador, setBorrador] = useState<Formulario | null>(null)
  const exportando = useRef(false)

  const nuevo = pedidoId === null
  const estado: EstadoPedido = pedido?.status ?? 'open'
  const bloqueado = !nuevo && estado !== 'open'
  const puedeGuardar = !bloqueado && (nuevo ? can('can_create_orders') : can('can_edit_orders'))
  const sucio = JSON.stringify(form) !== original

  // ── Carga ──────────────────────────────────────────────────
  useEffect(() => {
    if (!abierto) return
    let vivo = true
    setError(null)
    setPedido(null)
    setBorrador(null)
    setCargando(true)

    void (async () => {
      const [cli, prov, ped] = await Promise.all([
        supabase.from('clients').select('id, code, name, store_name').eq('active', true).order('name').limit(5000),
        supabase.from('providers').select('id, name').eq('active', true).order('name'),
        pedidoId ?? duplicarDe
          ? supabase
              .from('orders')
              .select(
                '*, order_items(quantity, unit_sale_price, product_variants(id, color, size, products(code, description)), order_item_costs(unit_cost_price))',
              )
              .eq('id', (pedidoId ?? duplicarDe) as string)
              .single()
          : Promise.resolve(null),
      ])
      if (!vivo) return
      setClientes((cli.data ?? []) as ClienteOpcion[])
      setProveedores((prov.data ?? []) as { id: string; name: string }[])

      let inicial = FORM_VACIO()
      if (ped) {
        if (ped.error || !ped.data) {
          setError('No se pudo cargar el pedido.')
          setCargando(false)
          return
        }
        const p = ped.data as PedidoCargado
        if (!duplicarDe) setPedido(p)
        inicial = {
          clientId: p.client_id ?? '',
          providerId: p.provider_id ?? '',
          season: p.season ?? '',
          discount: String(p.discount_pct ?? 0),
          observation: p.observation ?? '',
          items: p.order_items
            .filter((i) => i.product_variants)
            .map((i) => ({
              variantId: i.product_variants!.id,
              code: i.product_variants!.products?.code ?? '',
              description: i.product_variants!.products?.description ?? '',
              color: i.product_variants!.color,
              size: i.product_variants!.size,
              qty: i.quantity,
              price: i.unit_sale_price,
              cost: Array.isArray(i.order_item_costs)
                ? (i.order_item_costs[0]?.unit_cost_price ?? null)
                : (i.order_item_costs?.unit_cost_price ?? null),
            })),
        }
        if (duplicarDe) {
          // Copia: precios y costos vigentes del catalogo, temporada actual
          const ids = inicial.items.map((i) => i.variantId)
          const vigentes = new Map<string, { price: number; cost: number | null }>()
          for (let k = 0; k < ids.length; k += 150) {
            const { data, error: errV } = await supabase
              .from('product_variants')
              .select('id, sale_price, products(active), product_variant_costs(cost_price)')
              .in('id', ids.slice(k, k + 150))
            if (errV) {
              setError('No se pudo traer los precios vigentes para duplicar.')
              setCargando(false)
              return
            }
            for (const v of (data ?? []) as unknown as {
              id: string
              sale_price: number
              products: { active: boolean } | { active: boolean }[] | null
              product_variant_costs: { cost_price: number } | { cost_price: number }[] | null
            }[]) {
              const prod = Array.isArray(v.products) ? v.products[0] : v.products
              if (prod && !prod.active) continue
              const c = Array.isArray(v.product_variant_costs) ? v.product_variant_costs[0] : v.product_variant_costs
              vigentes.set(v.id, { price: v.sale_price, cost: c?.cost_price ?? null })
            }
          }
          const conPrecio = inicial.items.filter((i) => vigentes.has(i.variantId))
          const omitidas = inicial.items.length - conPrecio.length
          if (omitidas > 0) toast.warning(`${omitidas} variante${omitidas === 1 ? '' : 's'} ya no existe${omitidas === 1 ? '' : 'n'} en el catalogo y no se copiaron.`)
          const obs = (p.observation ?? '').trim()
          inicial = {
            ...inicial,
            season: FORM_VACIO().season,
            observation: `Copia de ${p.order_number}${obs ? ` · ${obs}` : ''}`,
            items: conPrecio.map((i) => ({
              ...i,
              price: vigentes.get(i.variantId)!.price,
              cost: vigentes.get(i.variantId)!.cost,
            })),
          }
        }
      } else {
        try {
          const guardado = localStorage.getItem(claveBorrador)
          if (guardado) setBorrador(JSON.parse(guardado) as Formulario)
        } catch {
          /* sin borrador */
        }
      }
      setForm(inicial)
      // Una copia arranca "sucia": cerrarla sin guardar pide confirmacion
      setOriginal(JSON.stringify(duplicarDe ? FORM_VACIO() : inicial))
      setFiltroItems('')
      setCargando(false)
    })()

    return () => {
      vivo = false
    }
  }, [abierto, pedidoId, duplicarDe, claveBorrador])

  // ── Borrador autoguardado (solo pedidos nuevos) ────────────
  useEffect(() => {
    if (!abierto || !nuevo || duplicarDe || cargando || borrador) return
    const t = setTimeout(() => {
      try {
        if (sucio) localStorage.setItem(claveBorrador, JSON.stringify(form))
        else localStorage.removeItem(claveBorrador)
      } catch {
        /* sin localStorage no hay borrador */
      }
    }, 600)
    return () => clearTimeout(t)
  }, [form, sucio, abierto, nuevo, duplicarDe, cargando, borrador, claveBorrador])

  // Aviso del navegador si cierra la pestana con cambios sin guardar
  useEffect(() => {
    if (!abierto || !sucio || bloqueado) return
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [abierto, sucio, bloqueado])

  const intentarCerrar = useCallback(() => {
    if (sucio && !bloqueado && puedeGuardar) setConfirmarSalir(true)
    else onCerrar()
  }, [sucio, bloqueado, puedeGuardar, onCerrar])

  // ── Items ──────────────────────────────────────────────────
  const totales = useMemo(
    () => totalesPedido(form.items.map((i) => ({ quantity: i.qty, unit_sale_price: i.price })), Number(form.discount) || 0),
    [form.items, form.discount],
  )
  const unidades = form.items.reduce((s, i) => s + i.qty, 0)
  // Lo que le va a costar el pedido a la fabrica, en dolares (solo con can_see_cost)
  const costoFabrica = form.items.reduce((s, i) => s + i.qty * (i.cost ?? 0), 0)

  // Una fila por producto y color: el subtotal junta todas las tallas
  const filasColor = useMemo(() => {
    const grupos = new Map<string, { variantId: string; code: string; description: string; color: string; unidades: number; subtotal: number }>()
    for (const i of form.items) {
      const clave = `${i.code} ${i.color}`
      const g = grupos.get(clave)
      if (g) {
        g.unidades += i.qty
        g.subtotal += i.qty * i.price
      } else {
        grupos.set(clave, {
          variantId: i.variantId,
          code: i.code,
          description: i.description,
          color: i.color,
          unidades: i.qty,
          subtotal: i.qty * i.price,
        })
      }
    }
    return [...grupos.values()]
  }, [form.items])

  const filasVisibles = useMemo(() => {
    const q = normalizar(filtroItems)
    if (!q) return filasColor
    return filasColor.filter((f) => normalizar(`${f.code} ${f.description} ${f.color}`).includes(q))
  }, [filasColor, filtroItems])

  function cambiarProveedor(id: string) {
    if (form.items.length > 0 && id !== form.providerId) {
      if (!window.confirm('Al cambiar de proveedor se vacian los productos del pedido. ¿Continuar?')) return
      setForm((f) => ({ ...f, providerId: id, items: [] }))
    } else {
      setForm((f) => ({ ...f, providerId: id }))
    }
  }

  // ── Guardar ────────────────────────────────────────────────
  async function guardar(): Promise<boolean> {
    setError(null)
    const descuento = Number(form.discount) || 0
    if (!form.clientId) return setError('Elegi un cliente.'), false
    if (!form.providerId) return setError('Elegi un proveedor.'), false
    if (form.items.length === 0) return setError('Agrega al menos un producto.'), false
    if (descuento < 0 || descuento > 100) return setError('El descuento tiene que estar entre 0 y 100.'), false

    setGuardando(true)
    const { error: err } = await supabase.rpc('save_order_with_items', {
      p_order_id: pedidoId,
      p_client_id: form.clientId,
      p_provider_id: form.providerId,
      p_season: form.season.trim() || null,
      p_discount_pct: descuento,
      p_shipping_date: pedido?.shipping_date ?? null,
      p_status: estado,
      p_observation: form.observation.trim() || null,
      p_items: form.items.map((i) => ({ variant_id: i.variantId, quantity: i.qty })),
    })
    setGuardando(false)
    if (err) {
      setError(mensajeError(err, 'No se pudo guardar el pedido.'))
      return false
    }
    try {
      localStorage.removeItem(claveBorrador)
    } catch {
      /* nada */
    }
    return true
  }

  async function onGuardar() {
    if (!(await guardar())) return
    toast.success(nuevo ? 'Pedido creado' : 'Pedido guardado')
    onCambio()
    onCerrar()
  }

  /** Exportar guarda antes los cambios pendientes, para que el archivo refleje lo que se ve. */
  async function exportar(formato: 'pdf' | 'excel') {
    if (exportando.current || !pedidoId) return
    exportando.current = true
    try {
      if (sucio && puedeGuardar) {
        if (!(await guardar())) return
        setOriginal(JSON.stringify(form))
        onCambio()
      }
      if (formato === 'pdf') await exportarPedidoPDF(pedidoId)
      else await exportarPedidoExcel(pedidoId, can('can_see_cost'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar el pedido.')
    } finally {
      exportando.current = false
    }
  }

  async function borrar() {
    if (!pedidoId) return
    const { error: err } = await supabase.from('orders').delete().eq('id', pedidoId)
    setConfirmarBorrar(false)
    if (err) return toast.error(mensajeError(err, 'No se pudo eliminar el pedido.'))
    toast.success('Pedido eliminado')
    onCambio()
    onCerrar()
  }

  // ── Estado ─────────────────────────────────────────────────
  function pedirCambioEstado(siguiente: EstadoPedido) {
    if (!pedido) return
    if (cambioSoloAdmin(pedido.status, siguiente) && !esAdmin) {
      return toast.warning('Solo un administrador puede hacer este cambio de estado.')
    }
    if (sucio && puedeGuardar) return toast.warning('Guarda los cambios del pedido antes de cambiar su estado.')
    setCambio({ id: pedido.id, numero: pedido.order_number, actual: pedido.status, siguiente })
  }

  function pedirDuplicar() {
    if (!pedido) return
    if (sucio && puedeGuardar) return toast.warning('Guarda los cambios del pedido antes de duplicarlo.')
    onDuplicar?.(pedido.id)
  }

  const itemsAcciones: ItemMenu[] = nuevo
    ? []
    : [
        { etiqueta: 'PDF', icono: <FileDown />, onClick: () => exportar('pdf') },
        ...(can('can_export_excel')
          ? [{ etiqueta: 'Excel', icono: <FileSpreadsheet />, onClick: () => exportar('excel') }]
          : []),
        ...(can('can_create_orders') && onDuplicar
          ? [{ etiqueta: 'Duplicar', icono: <Copy />, onClick: pedirDuplicar }]
          : []),
        ...(esAdmin && estado !== 'cancelled'
          ? [
              {
                etiqueta: 'Cancelar pedido',
                icono: <Ban />,
                onClick: () => pedirCambioEstado('cancelled'),
                peligro: true,
                separador: true,
              },
            ]
          : []),
        ...(esAdmin && estado === 'cancelled'
          ? [{ etiqueta: 'Reactivar', icono: <RotateCcw />, onClick: () => pedirCambioEstado('open'), separador: true }]
          : []),
        ...(can('can_delete_orders')
          ? [
              {
                etiqueta: 'Eliminar',
                icono: <Trash2 />,
                onClick: () => setConfirmarBorrar(true),
                peligro: true,
                separador: !esAdmin,
              },
            ]
          : []),
      ]

  const opcionesCliente = clientes.map((c) => ({
    value: c.id,
    label: `${c.code ?? '—'} — ${c.name}${c.store_name ? ` (${c.store_name})` : ''}`,
  }))

  return (
    <>
      <Modal
        abierto={abierto}
        titulo={nuevo ? (duplicarDe ? 'Nuevo pedido (copia)' : 'Nuevo pedido') : (pedido?.order_number ?? '')}
        tituloExtra={
          pedido && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-muted-foreground">
              <Badge tono={TONO_ESTADO[estado]}>{ESTADO_LABEL[estado]}</Badge>
              <span>Creado {formatFecha(pedido.created_at)}</span>
              {pedido.shipping_date && <span>Enviado {formatFecha(pedido.shipping_date)}</span>}
            </span>
          )
        }
        onCerrar={() => {
          // Con un dialogo encima, Escape es de ese dialogo
          if (selector || variantEditar || cambio || confirmarSalir || confirmarBorrar) return
          intentarCerrar()
        }}
        ancho="max-w-5xl"
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            <MenuAcciones etiqueta="Acciones" items={itemsAcciones} />
            {!nuevo && estado !== 'cancelled' && (
              <Button variant="outline" onClick={() => pedirCambioEstado(SIGUIENTE_ESTADO[estado])}>
                {ESTADO_LABEL[estado]} → {ESTADO_LABEL[SIGUIENTE_ESTADO[estado]]}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={intentarCerrar}>
                Cerrar
              </Button>
              {puedeGuardar && (
                <Button onClick={onGuardar} disabled={guardando || cargando}>
                  {guardando ? 'Guardando…' : 'Guardar'}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {cargando ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="space-y-5">
            {borrador && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span>Quedo un pedido sin terminar. ¿Recuperarlo?</span>
                <Button
                  size="sm"
                  onClick={() => {
                    setForm(borrador)
                    setBorrador(null)
                  }}
                >
                  Recuperar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    try {
                      localStorage.removeItem(claveBorrador)
                    } catch {
                      /* nada */
                    }
                    setBorrador(null)
                  }}
                >
                  Descartar
                </Button>
              </div>
            )}

            {bloqueado && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                Este pedido esta <strong>{ESTADO_LABEL[estado].toLowerCase()}</strong> y no se puede modificar.
                {esAdmin ? ' Cambiale el estado para poder editarlo.' : ' Solo un administrador puede reabrirlo.'}
              </div>
            )}

            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))]">
              <Field label="Cliente *">
                {bloqueado ? (
                  <Input disabled value={opcionesCliente.find((o) => o.value === form.clientId)?.label ?? ''} />
                ) : (
                  <Combobox
                    value={form.clientId}
                    onChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
                    options={opcionesCliente}
                    placeholder="Buscar por codigo, nombre o tienda…"
                    vacioLabel="Elegir cliente…"
                  />
                )}
              </Field>
              <Field label="Proveedor *">
                <Select
                  value={form.providerId}
                  disabled={bloqueado}
                  onChange={(e) => cambiarProveedor(e.target.value)}
                >
                  <option value="">Elegir proveedor…</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                {form.items.length > 0 && (
                  <div className="relative min-w-[14rem] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar por codigo, descripcion o color…"
                      value={filtroItems}
                      onChange={(e) => setFiltroItems(e.target.value)}
                    />
                  </div>
                )}
                <p className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                  Productos · {filasColor.length} items · {unidades} u.
                </p>
                {!bloqueado && (
                  <Button size="sm" className="ml-auto" disabled={!form.providerId} onClick={() => setSelector(true)}>
                    <Plus /> Agregar productos
                  </Button>
                )}
              </div>
              {!form.providerId && !bloqueado && (
                <p className="mb-2 text-xs text-muted-foreground">Elegi primero el proveedor para buscar sus productos.</p>
              )}
              {form.items.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Todavia no hay productos en el pedido.
                </div>
              ) : (
                <div className="max-h-[13.7rem] overflow-auto rounded-md border border-border">
                  <table className="w-full whitespace-nowrap text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Codigo</th>
                        <th className="px-3 py-2 font-medium">Descripcion</th>
                        <th className="px-3 py-2 font-medium">Color</th>
                        <th className="px-3 py-2 text-center font-medium">Cant.</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasVisibles.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-sm text-muted-foreground">
                            Ningun producto del pedido coincide con la busqueda.
                          </td>
                        </tr>
                      )}
                      {filasVisibles.map((f) => (
                        <tr
                          key={`${f.code}-${f.color}`}
                          onClick={bloqueado ? undefined : () => setVariantEditar(f.variantId)}
                          title={bloqueado ? undefined : 'Tocar para modificar las cantidades'}
                          className={cn(
                            'border-b border-border last:border-0',
                            !bloqueado && 'cursor-pointer hover:bg-accent',
                          )}
                        >
                          <td className="px-3 py-2 font-medium">{f.code}</td>
                          <td className="px-3 py-2">{f.description}</td>
                          <td className="px-3 py-2">{f.color}</td>
                          <td className="px-3 py-2 text-center tabular">{f.unidades}</td>
                          <td className="px-3 py-2 text-right tabular">{formatGs(f.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <Field label="Observacion">
                <Textarea
                  value={form.observation}
                  disabled={bloqueado}
                  onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))}
                />
              </Field>
              <div className="w-full space-y-2 text-sm md:w-64">
                <Field label="Descuento (%)">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form.discount}
                    disabled={bloqueado}
                    onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                  />
                </Field>
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular">{formatGs(totales.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Descuento</span>
                  <span className="tabular">- {formatGs(totales.descuento)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
                  <span>TOTAL</span>
                  <span className="tabular">{formatGs(totales.total)}</span>
                </div>
                {can('can_see_cost') && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Costo de fabrica</span>
                    <span className="tabular">{formatUsd(costoFabrica)}</span>
                  </div>
                )}
              </div>
            </div>

            {error && <ErrorBox mensaje={error} />}
          </div>
        )}
      </Modal>

      <SelectorProductos
        abierto={selector || variantEditar !== null}
        proveedorId={form.providerId}
        variantInicial={variantEditar}
        items={form.items}
        onCerrar={() => {
          setSelector(false)
          setVariantEditar(null)
        }}
        onAplicar={(_producto, variantes, idsDelProducto) => {
          const ids = new Set(idsDelProducto)
          setForm((f) => ({
            ...f,
            items: [...f.items.filter((i) => !ids.has(i.variantId)), ...variantes].sort(
              (a, b) => a.code.localeCompare(b.code) || a.color.localeCompare(b.color),
            ),
          }))
          setSelector(false)
          setVariantEditar(null)
        }}
      />

      <CambioEstadoModal
        cambio={cambio}
        onCerrar={() => setCambio(null)}
        onHecho={() => {
          setCambio(null)
          onCambio()
          onCerrar()
        }}
      />

      <ConfirmModal
        abierto={confirmarSalir}
        titulo="Salir sin guardar"
        textoConfirmar="Salir sin guardar"
        mensaje="Hay cambios sin guardar en este pedido. Si salis ahora se pierden."
        onCancelar={() => setConfirmarSalir(false)}
        onConfirmar={() => {
          setConfirmarSalir(false)
          onCerrar()
        }}
      />

      <ConfirmModal
        abierto={confirmarBorrar}
        titulo="Eliminar pedido"
        mensaje="Se va a eliminar el pedido definitivamente, con todos sus items."
        onCancelar={() => setConfirmarBorrar(false)}
        onConfirmar={borrar}
      />
    </>
  )
}
