import { FileDown, FileSpreadsheet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { GraficoBarras, GraficoDona } from '@/components/ui/graficos'
import { Select } from '@/components/ui/field'
import { EncabezadoPagina, Tarjeta } from '@/components/ui/pagina'
import { Tabla, type ColumnaTabla } from '@/components/ui/tabla'
import { usePermisos } from '@/hooks/usePermisos'
import { useConfig } from '@/lib/config'
import { traerTodo } from '@/lib/db'
import { agrupar, SELECT_STATS, vigentes, type Grupo, type PedidoStats } from '@/lib/estadisticas'
import { exportarExcel, exportarPDF, type Columna } from '@/lib/exportar'
import { formatGs, formatNumero, formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

type Pestana = 'temporada' | 'vendedor' | 'proveedor'

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'temporada', label: 'Por Temporada' },
  { id: 'vendedor', label: 'Por Vendedor' },
  { id: 'proveedor', label: 'Por Proveedor' },
]

/**
 * Reportes. Ventas en guaranies, costos en dolares: nunca se restan ni se
 * grafican en el mismo eje (la app anterior calculaba un "margen" restando
 * dolares a guaranies). Los costos y las columnas que dependen de ellos solo
 * aparecen con `can_see_cost`; sin ese permiso la base ni los devuelve.
 */
export default function Reportes() {
  const { can } = usePermisos()
  const { config } = useConfig()
  const verCosto = can('can_see_cost')
  const temporadaActual = config.current_season ?? ''

  const [pedidos, setPedidos] = useState<PedidoStats[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pestana, setPestana] = useState<Pestana>('temporada')
  /** Filtro de temporada de la pestana "Por Vendedor" ('' = todas). */
  const [tempVendedor, setTempVendedor] = useState('')

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

  const ok = useMemo(() => vigentes(pedidos), [pedidos])
  const temporadas = useMemo(
    () => [...new Set(ok.map((p) => p.season).filter((s): s is string => Boolean(s)))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
    [ok],
  )

  const grupos = useMemo(() => {
    if (pestana === 'temporada') return agrupar(ok, (p) => p.season ?? 'Sin temporada').sort((a, b) => b.ventas - a.ventas)
    if (pestana === 'vendedor') {
      const deLaTemporada = ok.filter((p) => !tempVendedor || p.season === tempVendedor)
      return agrupar(deLaTemporada, (p) => p.vendedor?.nombre ?? 'Sin vendedor').sort((a, b) => b.ventas - a.ventas)
    }
    const deLaTemporada = ok.filter((p) => !temporadaActual || p.season === temporadaActual)
    return agrupar(deLaTemporada, (p) => p.providers?.name ?? 'Sin proveedor').sort((a, b) =>
      verCosto ? b.costo - a.costo : b.ventas - a.ventas,
    )
  }, [ok, pestana, temporadaActual, verCosto, tempVendedor])

  const totalVentas = grupos.reduce((s, g) => s + g.ventas, 0)
  const totalCosto = grupos.reduce((s, g) => s + g.costo, 0)
  const pct = (parte: number, total: number) => (total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : '—')

  const etiquetaGrupo = { temporada: 'Temporada', vendedor: 'Vendedor', proveedor: 'Proveedor' }[pestana]

  const columnas: ColumnaTabla<Grupo>[] = [
    { id: 'nombre', header: etiquetaGrupo, render: (g) => <span className="font-medium">{g.nombre}</span>, orden: (g) => g.nombre },
    { id: 'pedidos', header: 'Pedidos', align: 'right', render: (g) => formatNumero(g.pedidos), orden: (g) => g.pedidos },
    { id: 'unidades', header: 'Unidades', align: 'right', render: (g) => formatNumero(g.unidades), orden: (g) => g.unidades },
    { id: 'ventas', header: 'Ventas', align: 'right', render: (g) => formatGs(g.ventas), orden: (g) => g.ventas },
    ...(verCosto
      ? [{ id: 'costo', header: 'Costo', align: 'right' as const, render: (g: Grupo) => formatUsd(g.costo), orden: (g: Grupo) => g.costo }]
      : []),
    ...(pestana === 'vendedor'
      ? [{ id: 'part', header: '% Ventas', align: 'right' as const, render: (g: Grupo) => pct(g.ventas, totalVentas), orden: (g: Grupo) => g.ventas }]
      : []),
    ...(pestana === 'proveedor' && verCosto
      ? [{ id: 'pcosto', header: '% Costo', align: 'right' as const, render: (g: Grupo) => pct(g.costo, totalCosto), orden: (g: Grupo) => g.costo }]
      : []),
  ]

  const columnasExport: Columna<Grupo>[] = [
    { header: etiquetaGrupo, valor: (g) => g.nombre, ancho: 28 },
    { header: 'Pedidos', valor: (g) => g.pedidos },
    { header: 'Unidades', valor: (g) => g.unidades },
    { header: 'Ventas (Gs)', valor: (g) => Math.round(g.ventas), ancho: 18 },
    ...(verCosto ? [{ header: 'Costo (US$)', valor: (g: Grupo) => Math.round(g.costo), ancho: 16 }] : []),
    ...(pestana === 'vendedor' ? [{ header: '% Ventas', valor: (g: Grupo) => pct(g.ventas, totalVentas) }] : []),
  ]

  const titulo = {
    temporada: 'Ventas por temporada',
    vendedor: `Ventas por vendedor${tempVendedor ? ` · ${tempVendedor}` : ''}`,
    proveedor: `Costo por proveedor${temporadaActual ? ` · ${temporadaActual}` : ''}`,
  }[pestana]
  const archivo = { temporada: 'ventas-temporada', vendedor: 'ventas-vendedor', proveedor: 'costo-proveedor' }[pestana]

  const nombres = grupos.map((g) => g.nombre)

  return (
    <div>
      <EncabezadoPagina
        titulo="Reportes"
        descripcion="Pedidos no cancelados."
        acciones={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={cargando || grupos.length === 0}
              onClick={() => exportarPDF({ titulo, columnas: columnasExport, filas: grupos, archivo: `${archivo}.pdf` })}
            >
              <FileDown /> PDF
            </Button>
            {can('can_export_excel') && (
              <Button
                variant="outline"
                size="sm"
                disabled={cargando || grupos.length === 0}
                onClick={() => exportarExcel({ hoja: titulo, columnas: columnasExport, filas: grupos, archivo: `${archivo}.xlsx` })}
              >
                <FileSpreadsheet /> Excel
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 flex gap-1 border-b border-border">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm',
              pestana === p.id
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {pestana === 'vendedor' && temporadas.length > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Temporada</span>
          <Select className="h-9 w-auto" value={tempVendedor} onChange={(e) => setTempVendedor(e.target.value)}>
            <option value="">Todas</option>
            {temporadas.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      )}

      {cargando ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : grupos.length === 0 ? (
        <Vacio titulo="Sin datos para mostrar" />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {pestana === 'proveedor' ? (
              <Tarjeta titulo={verCosto ? 'Costo por proveedor (US$)' : 'Ventas por proveedor (₲)'}>
                <div className="h-80">
                  <GraficoBarras
                    horizontal
                    multicolor
                    etiquetas={nombres}
                    series={[
                      verCosto
                        ? { nombre: 'Costo', valores: grupos.map((g) => g.costo), color: '#9B0000', moneda: 'usd' }
                        : { nombre: 'Ventas', valores: grupos.map((g) => g.ventas), color: '#9B0000', moneda: 'gs' },
                    ]}
                  />
                </div>
              </Tarjeta>
            ) : (
              <>
                <Tarjeta titulo={pestana === 'temporada' ? 'Ventas por temporada (₲)' : 'Ventas por vendedor (₲)'}>
                  <div className="h-72">
                    <GraficoBarras
                      multicolor={pestana === 'vendedor'}
                      etiquetas={nombres}
                      series={[{ nombre: 'Ventas', valores: grupos.map((g) => g.ventas), color: '#9B0000', moneda: 'gs' }]}
                    />
                  </div>
                </Tarjeta>
                <Tarjeta titulo="Participacion en las ventas">
                  <div className="h-72">
                    <GraficoDona
                      tipo={pestana === 'temporada' ? 'dona' : 'torta'}
                      etiquetas={nombres}
                      valores={grupos.map((g) => g.ventas)}
                      moneda="gs"
                    />
                  </div>
                </Tarjeta>
                {pestana === 'temporada' && verCosto && (
                  <Tarjeta titulo="Costo por temporada (US$)">
                    <div className="h-72">
                      <GraficoBarras
                        etiquetas={nombres}
                        series={[{ nombre: 'Costo', valores: grupos.map((g) => g.costo), color: '#555555', moneda: 'usd' }]}
                      />
                    </div>
                  </Tarjeta>
                )}
              </>
            )}
          </div>

          <Tabla
            columnas={columnas}
            filas={grupos}
            clave={(g) => g.nombre}
            pie={
              <tr>
                <td className="px-4 py-2.5">Total</td>
                <td className="tabular px-4 py-2.5 text-right">{formatNumero(grupos.reduce((s, g) => s + g.pedidos, 0))}</td>
                <td className="tabular px-4 py-2.5 text-right">{formatNumero(grupos.reduce((s, g) => s + g.unidades, 0))}</td>
                <td className="tabular px-4 py-2.5 text-right">{formatGs(totalVentas)}</td>
                {verCosto && <td className="tabular px-4 py-2.5 text-right">{formatUsd(totalCosto)}</td>}
                {(pestana === 'vendedor' || (pestana === 'proveedor' && verCosto)) && <td />}
              </tr>
            }
          />
        </div>
      )}
    </div>
  )
}
