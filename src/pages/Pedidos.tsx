import { FileDown, FileSpreadsheet, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CambioEstadoModal, type CambioEstado } from '@/components/pedidos/CambioEstadoModal'
import { PedidoModal } from '@/components/pedidos/PedidoModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Select } from '@/components/ui/field'
import { Buscador, EncabezadoPagina } from '@/components/ui/pagina'
import { ListaFiltro, PanelFiltros, RangoFechas } from '@/components/ui/panel-filtros'
import { Tabla, type ColumnaTabla } from '@/components/ui/tabla'
import { usePermisos } from '@/hooks/usePermisos'
import { ESTADO_LABEL, type EstadoPedido } from '@/lib/database.types'
import { traerTodo } from '@/lib/db'
import { exportarExcel, exportarPDF, type Columna } from '@/lib/exportar'
import { fechaLocalISO, formatFecha, formatGs, formatGsPdf, formatUsd, hoyISO, normalizar } from '@/lib/format'
import {
  cambioSoloAdmin,
  costoPedido,
  SELECT_LISTA,
  SIGUIENTE_ESTADO,
  TONO_ESTADO,
  totalPedido,
  unidadesPedido,
  type PedidoLista,
} from '@/lib/pedidos'
import { supabase } from '@/lib/supabase'

type FiltroEstado = EstadoPedido | ''

export default function Pedidos() {
  const { can, esAdmin } = usePermisos()
  const [pedidos, setPedidos] = useState<PedidoLista[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('open')
  const [vendedores, setVendedores] = useState<string[]>([])
  const [temporadas, setTemporadas] = useState<string[]>([])
  const [proveedores, setProveedores] = useState<string[]>([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [modal, setModal] = useState<{ id: string | null; duplicarDe?: string } | null>(null)
  const [cambio, setCambio] = useState<CambioEstado | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      // La RLS ya limita a cada usuario a sus propios pedidos (el admin ve todos)
      setPedidos(
        await traerTodo<PedidoLista>(() =>
          supabase.from('orders').select(SELECT_LISTA).order('created_at', { ascending: false }).order('id'),
        ),
      )
      setError(null)
    } catch {
      setError('No se pudieron cargar los pedidos.')
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const opciones = useMemo(() => {
    const unicos = (valores: (string | null | undefined)[]) =>
      [...new Set(valores.filter((v): v is string => Boolean(v?.trim())))]
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((v) => ({ value: v, label: v }))
    const vend = new Map<string, string>()
    for (const p of pedidos) if (p.vendedor) vend.set(p.vendedor.id, p.vendedor.nombre)
    return {
      vendedores: [...vend.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([value, label]) => ({ value, label })),
      temporadas: unicos(pedidos.map((p) => p.season)),
      proveedores: unicos(pedidos.map((p) => p.providers?.name)),
    }
  }, [pedidos])

  const filas = useMemo(() => {
    const q = normalizar(busqueda)
    return pedidos.filter((p) => {
      if (estado && p.status !== estado) return false
      if (vendedores.length && !vendedores.includes(p.vendedor?.id ?? '')) return false
      if (temporadas.length && !temporadas.includes(p.season ?? '')) return false
      if (proveedores.length && !proveedores.includes(p.providers?.name ?? '')) return false
      if (desde || hasta) {
        const creado = fechaLocalISO(p.created_at)
        if (desde && creado < desde) return false
        if (hasta && creado > hasta) return false
      }
      return !q || normalizar(p.order_number).includes(q) || normalizar(p.clients?.name ?? '').includes(q)
    })
  }, [pedidos, busqueda, estado, vendedores, temporadas, proveedores, desde, hasta])

  // Los cancelados se listan pero no suman (igual que en dashboard y reportes)
  const vigentesListados = useMemo(() => filas.filter((p) => p.status !== 'cancelled'), [filas])
  const totalListado = useMemo(() => vigentesListados.reduce((s, p) => s + totalPedido(p), 0), [vigentesListados])
  const costoListado = useMemo(() => vigentesListados.reduce((s, p) => s + costoPedido(p), 0), [vigentesListados])

  function pedirCambio(p: PedidoLista) {
    const siguiente = p.status === 'cancelled' ? 'open' : SIGUIENTE_ESTADO[p.status]
    if (cambioSoloAdmin(p.status, siguiente) && !esAdmin) {
      return toast.warning('Solo un administrador puede hacer este cambio de estado.')
    }
    setCambio({ id: p.id, numero: p.order_number, actual: p.status, siguiente })
  }

  // Cantidad de filtros del panel con algo elegido
  const filtrosActivos =
    [vendedores, temporadas, proveedores].filter((v) => v.length > 0).length + (desde || hasta ? 1 : 0)

  // ── Exportar lo que muestra la lista (con los filtros aplicados) ──
  // El costo de fabrica solo sale con can_see_cost, igual que en la tabla.
  const verCosto = can('can_see_cost')
  const subtituloExport = () => {
    const partes = [`${filas.length} pedidos`, `Estado: ${estado ? ESTADO_LABEL[estado] : 'Todos'}`]
    if (desde || hasta) partes.push(`Creados ${desde ? 'desde ' + formatFecha(desde) : ''}${desde && hasta ? ' ' : ''}${hasta ? 'hasta ' + formatFecha(hasta) : ''}`)
    if (vendedores.length) partes.push(`Vendedor: ${vendedores.map((id) => opciones.vendedores.find((o) => o.value === id)?.label ?? id).join(', ')}`)
    if (temporadas.length) partes.push(`Temporada: ${temporadas.join(', ')}`)
    if (proveedores.length) partes.push(`Proveedor: ${proveedores.join(', ')}`)
    if (vigentesListados.length !== filas.length) partes.push('los cancelados no suman en el total')
    return partes.join(' · ')
  }

  const columnasPdf: Columna<PedidoLista>[] = [
    { header: 'N° Pedido', valor: (p) => p.order_number },
    { header: 'Fecha', valor: (p) => formatFecha(p.created_at) },
    { header: 'Cliente', valor: (p) => p.clients?.name ?? '' },
    { header: 'Proveedor', valor: (p) => p.providers?.name ?? '' },
    { header: 'Estado', valor: (p) => ESTADO_LABEL[p.status] },
    { header: 'Unid.', valor: (p) => unidadesPedido(p) },
    { header: 'Total', valor: (p) => formatGsPdf(totalPedido(p)) },
    ...(verCosto ? [{ header: 'Costo fabrica', valor: (p: PedidoLista) => formatUsd(costoPedido(p)) }] : []),
    { header: 'Vendedor', valor: (p) => p.vendedor?.nombre ?? '' },
  ]

  const columnasExcel: Columna<PedidoLista>[] = [
    { header: 'N° Pedido', valor: (p) => p.order_number, ancho: 12 },
    { header: 'Fecha', valor: (p) => formatFecha(p.created_at), ancho: 12 },
    { header: 'Cliente', valor: (p) => p.clients?.name ?? '', ancho: 32 },
    { header: 'Proveedor', valor: (p) => p.providers?.name ?? '', ancho: 26 },
    { header: 'Temporada', valor: (p) => p.season ?? '', ancho: 12 },
    { header: 'Estado', valor: (p) => ESTADO_LABEL[p.status], ancho: 12 },
    { header: 'Descuento %', valor: (p) => p.discount_pct, ancho: 12 },
    { header: 'Unidades', valor: (p) => unidadesPedido(p), ancho: 10 },
    { header: 'Total (Gs)', valor: (p) => Math.round(totalPedido(p)), ancho: 16 },
    ...(verCosto ? [{ header: 'Costo fabrica (US$)', valor: (p: PedidoLista) => costoPedido(p), ancho: 18 }] : []),
    { header: 'Vendedor', valor: (p) => p.vendedor?.nombre ?? '', ancho: 22 },
    { header: 'Fecha de envio', valor: (p) => (p.shipping_date ? formatFecha(p.shipping_date) : ''), ancho: 14 },
    { header: 'Observacion', valor: (p) => p.observation ?? '', ancho: 40 },
  ]

  // Totales de la lista: no suman los cancelados (igual que el pie de la tabla)
  const unidadesListadas = vigentesListados.reduce((s, p) => s + unidadesPedido(p), 0)
  const pieExport = (columnas: Columna<PedidoLista>[], formatear: boolean): (string | number)[] =>
    columnas.map((c, i) => {
      if (i === 0) return formatear ? 'TOTAL' : 'TOTAL (sin cancelados)'
      if (c.header === 'Unid.' || c.header === 'Unidades') return unidadesListadas
      if (c.header === 'Total' || c.header === 'Total (Gs)') return formatear ? formatGsPdf(totalListado) : Math.round(totalListado)
      if (c.header.startsWith('Costo')) return formatear ? formatUsd(costoListado) : costoListado
      return ''
    })

  const columnas: ColumnaTabla<PedidoLista>[] = [
    { id: 'num', header: 'N° Pedido', render: (p) => <span className="font-medium">{p.order_number}</span>, orden: (p) => p.order_number },
    { id: 'fecha', header: 'Fecha', render: (p) => formatFecha(p.created_at), orden: (p) => p.created_at },
    { id: 'cliente', header: 'Cliente', render: (p) => p.clients?.name ?? '—', orden: (p) => p.clients?.name },
    {
      id: 'estado',
      header: 'Estado',
      render: (p) => (
        <button
          type="button"
          title="Cambiar estado"
          onClick={(e) => {
            e.stopPropagation()
            pedirCambio(p)
          }}
        >
          <Badge tono={TONO_ESTADO[p.status]} className="cursor-pointer hover:opacity-80">
            {ESTADO_LABEL[p.status]}
          </Badge>
        </button>
      ),
      orden: (p) => ESTADO_LABEL[p.status],
    },
    { id: 'total', header: 'Total', align: 'right', render: (p) => formatGs(totalPedido(p)), orden: totalPedido },
    ...(can('can_see_cost')
      ? [{ id: 'costo', header: 'Costo fabrica', align: 'right' as const, render: (p: PedidoLista) => formatUsd(costoPedido(p)), orden: costoPedido }]
      : []),
    { id: 'vendedor', header: 'Vendedor', render: (p) => p.vendedor?.nombre ?? '—', orden: (p) => p.vendedor?.nombre },
  ]

  return (
    <div>
      <EncabezadoPagina
        titulo="Pedidos"
        descripcion={esAdmin ? 'Todos los pedidos.' : 'Tus pedidos.'}
        acciones={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={filas.length === 0}
              onClick={() =>
                exportarPDF({
                  titulo: `Pedidos · ${subtituloExport()}`,
                  columnas: columnasPdf,
                  filas,
                  pie: pieExport(columnasPdf, true),
                  archivo: `pedidos-${hoyISO()}.pdf`,
                })
              }
            >
              <FileDown /> PDF
            </Button>
            {can('can_export_excel') && (
              <Button
                variant="outline"
                size="sm"
                disabled={filas.length === 0}
                onClick={() =>
                  exportarExcel({
                    hoja: 'Pedidos',
                    columnas: columnasExcel,
                    filas,
                    pie: pieExport(columnasExcel, false),
                    archivo: `pedidos-${hoyISO()}.xlsx`,
                  })
                }
              >
                <FileSpreadsheet /> Excel
              </Button>
            )}
            {can('can_create_orders') && (
              <Button onClick={() => setModal({ id: null })}>
                <Plus /> Nuevo
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Buscar por N° de pedido o cliente…" />
        <Select className="h-9 w-auto" value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)}>
          <option value="open">Abiertos</option>
          <option value="sent">Enviados</option>
          <option value="closed">Cerrados</option>
          <option value="cancelled">Cancelados</option>
          <option value="">Todos</option>
        </Select>
        <PanelFiltros
          activos={filtrosActivos}
          onLimpiar={() => {
            setVendedores([])
            setTemporadas([])
            setProveedores([])
            setDesde('')
            setHasta('')
          }}
        >
          <RangoFechas label="Fecha de creacion" desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
          {esAdmin && <ListaFiltro label="Vendedor" opciones={opciones.vendedores} valor={vendedores} onChange={setVendedores} />}
          <ListaFiltro label="Temporada" opciones={opciones.temporadas} valor={temporadas} onChange={setTemporadas} />
          <ListaFiltro label="Proveedor" opciones={opciones.proveedores} valor={proveedores} onChange={setProveedores} />
        </PanelFiltros>
      </div>

      {cargando ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : filas.length === 0 ? (
        <Vacio titulo={pedidos.length === 0 ? 'Todavia no hay pedidos' : 'Sin resultados'} descripcion={pedidos.length > 0 ? 'Proba cambiando el estado o los filtros.' : undefined} />
      ) : (
        <Tabla
          ajustarAPantalla
          columnas={columnas}
          filas={filas}
          clave={(p) => p.id}
          onClickFila={(p) => setModal({ id: p.id })}
          pie={
            <tr>
              <td className="px-4 py-2.5 text-xs text-muted-foreground" colSpan={4}>
                {filas.length} pedidos{vigentesListados.length !== filas.length && ` (${filas.length - vigentesListados.length} cancelados no suman)`}
              </td>
              <td className="tabular px-4 py-2.5 text-right">{formatGs(totalListado)}</td>
              {can('can_see_cost') && <td className="tabular px-4 py-2.5 text-right">{formatUsd(costoListado)}</td>}
              <td />
            </tr>
          }
        />
      )}

      <PedidoModal
        abierto={modal !== null}
        pedidoId={modal?.id ?? null}
        duplicarDe={modal?.duplicarDe ?? null}
        onDuplicar={(id) => setModal({ id: null, duplicarDe: id })}
        onCerrar={() => setModal(null)}
        onCambio={() => void cargar()}
      />

      <CambioEstadoModal
        cambio={cambio}
        onCerrar={() => setCambio(null)}
        onHecho={() => {
          setCambio(null)
          void cargar()
        }}
      />
    </div>
  )
}
