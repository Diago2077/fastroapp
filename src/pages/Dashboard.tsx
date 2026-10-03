import { ClipboardCheck, FileDown, FileText, Plus, Truck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PedidoModal } from '@/components/pedidos/PedidoModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { EncabezadoPagina } from '@/components/ui/pagina'
import { Tabla, type ColumnaTabla } from '@/components/ui/tabla'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { useConfig } from '@/lib/config'
import { ESTADO_LABEL } from '@/lib/database.types'
import { traerTodo } from '@/lib/db'
import { costoDe, SELECT_STATS, ventaDe, vigentes, type PedidoStats } from '@/lib/estadisticas'
import { formatFecha, formatGs, formatGsPdf, formatUsd, hoyISO } from '@/lib/format'
import { TONO_ESTADO } from '@/lib/pedidos'
import { supabase } from '@/lib/supabase'

/** Cuantos pedidos muestra "Ultimos pedidos". */
const ULTIMOS = 10

/**
 * Inicio, para todos. Trabaja sobre `orders`, y la RLS ya limita a cada
 * usuario a sus propios pedidos (el admin ve todos): los indicadores y la lista
 * de un usuario normal salen solo de lo suyo, igual que en Pedidos. Los
 * graficos generales viven en Reportes.
 */
export default function Dashboard() {
  const { usuario } = useAuth()
  const { can, esAdmin } = usePermisos()
  const { config } = useConfig()
  const temporadaActual = config.current_season ?? ''
  const verCosto = can('can_see_cost')
  const puedeVerPedidos = can('can_view_orders')

  const [pedidos, setPedidos] = useState<PedidoStats[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ id: string | null; duplicarDe?: string } | null>(null)

  const cargar = useCallback(async () => {
    try {
      setPedidos(await traerTodo<PedidoStats>(() => supabase.from('orders').select(SELECT_STATS).order('id')))
      setError(null)
    } catch {
      setError('No se pudieron cargar los datos.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const datos = useMemo(() => {
    // Los indicadores no cuentan cancelados; la lista de ultimos pedidos muestra todos los estados
    const ok = vigentes(pedidos)
    const recientes = [...pedidos].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, ULTIMOS)
    return {
      ventas: ok.reduce((s, p) => s + ventaDe(p), 0),
      costo: ok.reduce((s, p) => s + costoDe(p), 0),
      abiertos: ok.filter((p) => p.status === 'open').length,
      cerrados: ok.filter((p) => p.status === 'closed').length,
      enviados: ok.filter((p) => p.status === 'sent').length,
      recientes,
    }
  }, [pedidos])

  async function descargarPDF() {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const doc = new jsPDF()
    const ancho = doc.internal.pageSize.getWidth()
    doc.setFillColor(17, 17, 17)
    doc.rect(0, 0, ancho, 22, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('FASTRO S.A.', 14, 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(esAdmin ? 'Inicio' : `Inicio · ${usuario?.nombre ?? ''}`, 14, 17)
    doc.text(`Generado: ${new Date().toLocaleDateString('es-PY')}`, ancho - 14, 17, { align: 'right' })

    autoTable(doc, {
      startY: 28,
      head: [['Indicador', 'Valor']],
      body: [
        ['Ventas Totales', formatGsPdf(datos.ventas)],
        ...(verCosto ? [['Total Ventas en Costo', formatUsd(datos.costo)]] : []),
        ['Pedidos Abiertos', String(datos.abiertos)],
        ['Pedidos Cerrados', String(datos.cerrados)],
        ['Pedidos Enviados', String(datos.enviados)],
      ],
      headStyles: { fillColor: [155, 0, 0] },
      margin: { left: 10, right: 10 },
    })

    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    autoTable(doc, {
      startY: y,
      head: [['N° Pedido', 'Cliente', ...(esAdmin ? ['Vendedor'] : []), 'Temporada', 'Total', 'Estado', 'Fecha']],
      body: datos.recientes.map((p) => [
        p.order_number,
        p.clients?.name ?? '',
        ...(esAdmin ? [p.vendedor?.nombre ?? ''] : []),
        p.season ?? '',
        formatGsPdf(ventaDe(p)),
        ESTADO_LABEL[p.status],
        formatFecha(p.created_at),
      ]),
      headStyles: { fillColor: [155, 0, 0] },
      styles: { fontSize: 8 },
      margin: { left: 10, right: 10 },
    })
    doc.save(`inicio-${hoyISO()}.pdf`)
  }

  const columnas: ColumnaTabla<PedidoStats>[] = [
    { id: 'num', header: 'N° Pedido', render: (p) => <span className="font-medium">{p.order_number}</span>, orden: (p) => p.order_number },
    { id: 'cliente', header: 'Cliente', render: (p) => p.clients?.name ?? '—', orden: (p) => p.clients?.name },
    // Para un usuario normal el vendedor siempre es el mismo (el), no aporta
    ...(esAdmin
      ? [{ id: 'vendedor', header: 'Vendedor', render: (p: PedidoStats) => p.vendedor?.nombre ?? '—', orden: (p: PedidoStats) => p.vendedor?.nombre }]
      : []),
    { id: 'temporada', header: 'Temporada', render: (p) => p.season ?? '—', orden: (p) => p.season },
    { id: 'total', header: 'Total', align: 'right', render: (p) => formatGs(ventaDe(p)), orden: ventaDe },
    {
      id: 'estado',
      header: 'Estado',
      render: (p) => <Badge tono={TONO_ESTADO[p.status]}>{ESTADO_LABEL[p.status]}</Badge>,
      orden: (p) => ESTADO_LABEL[p.status],
    },
    { id: 'fecha', header: 'Fecha', render: (p) => formatFecha(p.created_at), orden: (p) => p.created_at },
  ]

  const primerNombre = usuario?.nombre?.split(' ')[0] ?? ''
  const descripcion = [esAdmin ? null : 'Solo tus pedidos', temporadaActual ? `Temporada actual: ${temporadaActual}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div>
      <EncabezadoPagina
        titulo={`Hola${primerNombre ? `, ${primerNombre}` : ''}`}
        descripcion={descripcion || undefined}
        acciones={
          <>
            <Button variant="outline" size="sm" onClick={descargarPDF} disabled={cargando}>
              <FileDown /> PDF
            </Button>
            {can('can_create_orders') && (
              <Button onClick={() => setModal({ id: null })}>
                <Plus /> Nuevo
              </Button>
            )}
          </>
        }
      />

      {cargando ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            <Indicador etiqueta="Ventas Totales" valor={formatGs(datos.ventas)} icono={<span className="text-xs font-bold">Gs</span>} />
            {verCosto && (
              <Indicador etiqueta="Total Ventas en Costo" valor={formatUsd(datos.costo)} icono={<span className="text-xs font-bold">US$</span>} />
            )}
            <Indicador etiqueta="Pedidos Abiertos" valor={String(datos.abiertos)} icono={<FileText className="size-4" />} />
            <Indicador etiqueta="Pedidos Cerrados" valor={String(datos.cerrados)} icono={<ClipboardCheck className="size-4" />} />
            <Indicador etiqueta="Pedidos Enviados" valor={String(datos.enviados)} icono={<Truck className="size-4" />} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Ultimos pedidos</h2>
              {puedeVerPedidos && (
                <Link to="/pedidos" className="text-xs text-muted-foreground hover:text-foreground">
                  Ver todos
                </Link>
              )}
            </div>
            {datos.recientes.length === 0 ? (
              <Vacio titulo="Todavia no hay pedidos" />
            ) : (
              <Tabla
                columnas={columnas}
                filas={datos.recientes}
                clave={(p) => p.id}
                onClickFila={puedeVerPedidos ? (p) => setModal({ id: p.id }) : undefined}
              />
            )}
          </div>
        </div>
      )}

      <PedidoModal
        abierto={modal !== null}
        pedidoId={modal?.id ?? null}
        duplicarDe={modal?.duplicarDe ?? null}
        onDuplicar={(id) => setModal({ id: null, duplicarDe: id })}
        onCerrar={() => setModal(null)}
        onCambio={() => void cargar()}
      />
    </div>
  )
}

function Indicador({ etiqueta, valor, icono }: { etiqueta: string; valor: string; icono: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-xs sm:p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icono}
      </span>
      <div className="min-w-0">
        <p className="tabular truncate text-base font-semibold text-foreground sm:text-lg">{valor}</p>
        <p className="truncate text-xs text-muted-foreground">{etiqueta}</p>
      </div>
    </div>
  )
}
