import type { Chart as ChartJS } from 'chart.js'
import { CheckCircle2, ClipboardCheck, FileDown, FileText, Truck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { EncabezadoPagina, Tarjeta } from '@/components/ui/pagina'
import { GraficoBarras, GraficoDona } from '@/components/ui/graficos'
import { Tabla, type ColumnaTabla } from '@/components/ui/tabla'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { useConfig } from '@/lib/config'
import { ESTADO_LABEL } from '@/lib/database.types'
import { traerTodo } from '@/lib/db'
import { agrupar, costoDe, SELECT_STATS, ventaDe, vigentes, type PedidoStats } from '@/lib/estadisticas'
import { formatFecha, formatGs, formatGsPdf, formatUsd, hoyISO } from '@/lib/format'
import { TONO_ESTADO } from '@/lib/pedidos'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const { usuario } = useAuth()
  const { can } = usePermisos()
  const { config } = useConfig()
  const temporadaActual = config.current_season ?? ''
  const verCosto = can('can_see_cost')

  const [pedidos, setPedidos] = useState<PedidoStats[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refVendedores = useRef<ChartJS<'doughnut'>>(null)
  const refTemporadas = useRef<ChartJS<'bar'>>(null)

  useEffect(() => {
    let vivo = true
    traerTodo<PedidoStats>(() => supabase.from('orders').select(SELECT_STATS).order('id'))
      .then((d) => vivo && setPedidos(d))
      .catch(() => vivo && setError('No se pudieron cargar los datos.'))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
  }, [])

  const datos = useMemo(() => {
    const ok = vigentes(pedidos)
    const porTemporada = agrupar(ok, (p) => p.season ?? '').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
    const porVendedor = agrupar(
      ok.filter((p) => !temporadaActual || p.season === temporadaActual),
      (p) => p.vendedor?.nombre ?? '',
    ).sort((a, b) => b.ventas - a.ventas)
    const recientes = [...ok].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)
    return {
      ventas: ok.reduce((s, p) => s + ventaDe(p), 0),
      costo: ok.reduce((s, p) => s + costoDe(p), 0),
      abiertos: ok.filter((p) => p.status === 'open').length,
      cerrados: ok.filter((p) => p.status === 'closed').length,
      enviados: ok.filter((p) => p.status === 'sent').length,
      porTemporada,
      porVendedor,
      recientes,
    }
  }, [pedidos, temporadaActual])

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
    doc.text('Dashboard', 14, 17)
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

    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    const imgVend = refVendedores.current?.toBase64Image()
    const imgTemp = refTemporadas.current?.toBase64Image()
    if (imgVend) doc.addImage(imgVend, 'PNG', 10, y, 90, 70)
    if (imgTemp) doc.addImage(imgTemp, 'PNG', 105, y, 95, 70)
    y += 78

    autoTable(doc, {
      startY: y,
      head: [['N° Pedido', 'Cliente', 'Vendedor', 'Temporada', 'Total', 'Estado', 'Fecha']],
      body: datos.recientes.map((p) => [
        p.order_number,
        p.clients?.name ?? '',
        p.vendedor?.nombre ?? '',
        p.season ?? '',
        formatGsPdf(ventaDe(p)),
        ESTADO_LABEL[p.status],
        formatFecha(p.created_at),
      ]),
      headStyles: { fillColor: [155, 0, 0] },
      styles: { fontSize: 8 },
      margin: { left: 10, right: 10 },
    })
    doc.save(`dashboard-${hoyISO()}.pdf`)
  }

  const columnas: ColumnaTabla<PedidoStats>[] = [
    { id: 'num', header: 'N° Pedido', render: (p) => <span className="font-medium">{p.order_number}</span>, orden: (p) => p.order_number },
    { id: 'cliente', header: 'Cliente', render: (p) => p.clients?.name ?? '—', orden: (p) => p.clients?.name },
    { id: 'vendedor', header: 'Vendedor', render: (p) => p.vendedor?.nombre ?? '—', orden: (p) => p.vendedor?.nombre },
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

  return (
    <div>
      <EncabezadoPagina
        titulo={`Hola${primerNombre ? `, ${primerNombre}` : ''}`}
        descripcion={temporadaActual ? `Temporada actual: ${temporadaActual}` : undefined}
        acciones={
          <Button variant="outline" size="sm" onClick={descargarPDF} disabled={cargando}>
            <FileDown /> Descargar PDF
          </Button>
        }
      />

      {cargando ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Indicador etiqueta="Ventas Totales" valor={formatGs(datos.ventas)} icono={<span className="text-xs font-bold">Gs</span>} />
            {verCosto && (
              <Indicador etiqueta="Total Ventas en Costo" valor={formatUsd(datos.costo)} icono={<span className="text-xs font-bold">US$</span>} />
            )}
            <Indicador etiqueta="Pedidos Abiertos" valor={String(datos.abiertos)} icono={<FileText className="size-4" />} />
            <Indicador etiqueta="Pedidos Cerrados" valor={String(datos.cerrados)} icono={<ClipboardCheck className="size-4" />} />
            <Indicador etiqueta="Pedidos Enviados" valor={String(datos.enviados)} icono={<Truck className="size-4" />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta titulo={temporadaActual ? `Ventas por Vendedor · ${temporadaActual}` : 'Ventas por Vendedor'}>
              <div className="h-72">
                {datos.porVendedor.length === 0 ? (
                  <Vacio icono={CheckCircle2} titulo="Sin ventas en la temporada actual" />
                ) : (
                  <GraficoDona
                    ref={refVendedores}
                    etiquetas={datos.porVendedor.map((g) => g.nombre)}
                    valores={datos.porVendedor.map((g) => g.ventas)}
                    moneda="gs"
                  />
                )}
              </div>
            </Tarjeta>
            <Tarjeta titulo="Ventas por Temporada">
              <div className="h-72">
                <GraficoBarras
                  ref={refTemporadas}
                  etiquetas={datos.porTemporada.map((g) => g.nombre)}
                  series={[{ nombre: 'Ventas', valores: datos.porTemporada.map((g) => g.ventas), color: '#9B0000', moneda: 'gs' }]}
                />
              </div>
            </Tarjeta>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Ultimos pedidos</h2>
            {datos.recientes.length === 0 ? (
              <Vacio titulo="Todavia no hay pedidos" />
            ) : (
              <Tabla columnas={columnas} filas={datos.recientes} clave={(p) => p.id} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Indicador({ etiqueta, valor, icono }: { etiqueta: string; valor: string; icono: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icono}
      </span>
      <div className="min-w-0">
        <p className="tabular truncate text-lg font-semibold text-foreground">{valor}</p>
        <p className="truncate text-xs text-muted-foreground">{etiqueta}</p>
      </div>
    </div>
  )
}
