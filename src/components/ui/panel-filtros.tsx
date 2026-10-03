import { ListFilter, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { normalizar } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Input } from './field'
import type { OpcionFiltro } from './filtro-multi'

/**
 * Un solo boton "Filtros" que despliega un panel con todos los filtros.
 * `activos` es la cantidad de filtros distintos del valor por defecto (va como
 * numerito en el boton) y `resumen` un texto corto de lo que se esta viendo.
 * Cierra al tocar afuera y con Escape.
 */
export function PanelFiltros({
  activos,
  resumen,
  onLimpiar,
  children,
}: {
  activos: number
  resumen?: string
  onLimpiar: () => void
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /** Corrimiento horizontal para que el panel no se salga de la pantalla (celular). */
  const [dx, setDx] = useState(0)

  useLayoutEffect(() => {
    if (!abierto) return
    const acomodar = () => {
      const el = panelRef.current
      if (!el) return
      const margen = 8
      const { left, right } = el.getBoundingClientRect()
      const actual = dx
      const base = { left: left - actual, right: right - actual }
      let nuevo = 0
      // clientWidth y no innerWidth: en celular el panel desbordado ensancha la ventana y innerWidth deja de servir
      const ancho = document.documentElement.clientWidth
      if (base.right > ancho - margen) nuevo = ancho - margen - base.right
      if (base.left + nuevo < margen) nuevo = margen - base.left
      if (nuevo !== actual) setDx(nuevo)
    }
    acomodar()
    window.addEventListener('resize', acomodar)
    return () => window.removeEventListener('resize', acomodar)
  }, [abierto, dx])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla, true)
    return () => {
      document.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [abierto])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs hover:bg-accent',
          activos > 0 && 'border-primary/50',
        )}
      >
        <ListFilter className="size-4 text-muted-foreground" />
        Filtros
        {activos > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
            {activos}
          </span>
        )}
        {resumen && <span className="hidden text-xs text-muted-foreground sm:inline">· {resumen}</span>}
      </button>

      {abierto && (
        <div
          ref={panelRef}
          style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
          className="absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-1rem))] rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="max-h-[min(65vh,calc(100dvh-22rem))] space-y-4 overflow-y-auto p-4">{children}</div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <button
              type="button"
              onClick={onLimpiar}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Restablecer filtros
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Encabezado({ label, cantidad, onLimpiar }: { label: string; cantidad?: number; onLimpiar?: () => void }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <p className="text-xs font-medium text-muted-foreground">
        {label}
        {cantidad ? ` · ${cantidad}` : ''}
      </p>
      {cantidad ? (
        <button type="button" onClick={onLimpiar} className="text-[11px] text-muted-foreground hover:text-foreground">
          Limpiar
        </button>
      ) : null}
    </div>
  )
}

/** Seleccion multiple dentro del panel. Sin nada tildado no filtra. */
export function ListaFiltro({
  label,
  opciones,
  valor,
  onChange,
}: {
  label: string
  opciones: OpcionFiltro[]
  valor: string[]
  onChange: (valor: string[]) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const q = normalizar(busqueda)
  const visibles = q ? opciones.filter((o) => normalizar(o.label).includes(q)) : opciones
  const alternar = (v: string) => onChange(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v])

  return (
    <div>
      <Encabezado label={label} cantidad={valor.length} onLimpiar={() => onChange([])} />
      <div className="rounded-md border border-border">
        {opciones.length >= 6 && (
          <div className="relative border-b border-border p-1.5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-md border border-input bg-background py-1 pl-7 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}
        <div className="max-h-36 overflow-y-auto py-1">
          {visibles.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Sin opciones.</p>
          ) : (
            visibles.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  checked={valor.includes(o.value)}
                  onChange={() => alternar(o.value)}
                  className="size-3.5 accent-[var(--primary)]"
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/** Rango de fechas (desde / hasta, ambos inclusivos y opcionales). */
export function RangoFechas({
  label,
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  label: string
  desde: string
  hasta: string
  onDesde: (v: string) => void
  onHasta: (v: string) => void
}) {
  const hayRango = Boolean(desde || hasta)
  return (
    <div>
      <Encabezado
        label={label}
        cantidad={hayRango ? 1 : 0}
        onLimpiar={() => {
          onDesde('')
          onHasta('')
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted-foreground">
          Desde
          <Input type="date" className="mt-1 h-9" value={desde} max={hasta || undefined} onChange={(e) => onDesde(e.target.value)} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Hasta
          <Input type="date" className="mt-1 h-9" value={hasta} min={desde || undefined} onChange={(e) => onHasta(e.target.value)} />
        </label>
      </div>
    </div>
  )
}
