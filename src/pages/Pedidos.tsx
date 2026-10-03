import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CambioEstadoModal, type CambioEstado } from '@/components/pedidos/CambioEstadoModal'
import { PedidoModal } from '@/components/pedidos/PedidoModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { FiltroMulti } from '@/components/ui/filtro-multi'
import { Select } from '@/components/ui/field'
import { Buscador, EncabezadoPagina } from '@/components/ui/pagina'
import { Tabla, type ColumnaTabla } from '@/components/ui/tabla'
import { usePermisos } from '@/hooks/usePermisos'
import { ESTADO_LABEL, type EstadoPedido } from '@/lib/database.types'
import { traerTodo } from '@/lib/db'
import { formatFecha, formatGs, formatUsd, normalizar } from '@/lib/format'
import {
  cambioSoloAdmin,
  costoPedido,
  SELECT_LISTA,
  SIGUIENTE_ESTADO,
  TONO_ESTADO,
  totalPedido,
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
  const [modal, setModal] = useState<{ id: string | null } | null>(null)
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
      return !q || normalizar(p.order_number).includes(q) || normalizar(p.clients?.name ?? '').includes(q)
    })
  }, [pedidos, busqueda, estado, vendedores, temporadas, proveedores])

  const totalListado = useMemo(() => filas.reduce((s, p) => s + totalPedido(p), 0), [filas])
  const costoListado = useMemo(() => filas.reduce((s, p) => s + costoPedido(p), 0), [filas])

  function pedirCambio(p: PedidoLista) {
    const siguiente = p.status === 'cancelled' ? 'open' : SIGUIENTE_ESTADO[p.status]
    if (cambioSoloAdmin(p.status, siguiente) && !esAdmin) {
      return toast.warning('Solo un administrador puede hacer este cambio de estado.')
    }
    setCambio({ id: p.id, numero: p.order_number, actual: p.status, siguiente })
  }

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
          can('can_create_orders') && (
            <Button onClick={() => setModal({ id: null })}>
              <Plus /> Nuevo pedido
            </Button>
          )
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
        {esAdmin && <FiltroMulti label="Vendedor" opciones={opciones.vendedores} valor={vendedores} onChange={setVendedores} />}
        <FiltroMulti label="Temporada" opciones={opciones.temporadas} valor={temporadas} onChange={setTemporadas} />
        <FiltroMulti label="Proveedor" opciones={opciones.proveedores} valor={proveedores} onChange={setProveedores} />
      </div>

      {cargando ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : filas.length === 0 ? (
        <Vacio titulo={pedidos.length === 0 ? 'Todavia no hay pedidos' : 'Sin resultados'} descripcion={pedidos.length > 0 ? 'Proba cambiando el estado o los filtros.' : undefined} />
      ) : (
        <Tabla
          columnas={columnas}
          filas={filas}
          clave={(p) => p.id}
          onClickFila={(p) => setModal({ id: p.id })}
          pie={
            <tr>
              <td className="px-4 py-2.5 text-xs text-muted-foreground" colSpan={4}>
                {filas.length} pedidos
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
