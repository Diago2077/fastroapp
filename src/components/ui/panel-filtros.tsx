import { Check, ChevronDown, ListFilter, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { normalizar } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Input } from './field'
import type { OpcionFiltro } from './filtro-multi'

/**
 * Un solo boton "Filtros" que despliega un panel con todos los filtros.
 * `activos` es la cantidad de filtros distintos del valor por defecto (va como
 * numerito en el boton) y `resumen` un texto corto de lo que se esta viendo.
 * Con `soloIcono` el disparador es un icono chico (para ir dentro del buscador)
 * y el panel se alinea a su derecha. `acciones` es una fila fija (no scrollea)
 * debajo de los filtros, p. ej. exportar. Cierra al tocar afuera y con Escape.
 */
export function PanelFiltros({
  activos,
  resumen,
  onLimpiar,
  soloIcono = false,
  acciones,
  children,
}: {
  activos: number
  resumen?: string
  onLimpiar: () => void
  soloIcono?: boolean
  /** Fila fija debajo de los filtros. Si es funcion, recibe `cerrar` para cerrar el panel antes de abrir un modal. */
  acciones?: ReactNode | ((cerrar: () => void) => ReactNode)
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** Corrimiento horizontal para que el panel no se salga de la pantalla (celular). */
  const [dx, setDx] = useState(0)
  /** Alto maximo (px) de la zona con scroll: lo que queda de pantalla debajo del panel, sin tapar el pie ni la barra inferior. */
  const [altoMax, setAltoMax] = useState<number | null>(null)

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
      // Lo fijo del panel (pie, fila de acciones, bordes) se mide, no se estima; ademas la barra inferior del celular (56 px) y un margen
      const fijo = el.offsetHeight - (scrollRef.current?.offsetHeight ?? 0)
      const libre = document.documentElement.clientHeight - el.getBoundingClientRect().top - fijo - 56 - 16
      setAltoMax(Math.max(160, Math.round(libre)))
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
      {soloIcono ? (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-label="Filtros y opciones"
          title="Filtros y opciones"
          onClick={() => setAbierto((a) => !a)}
          className={cn(
            'relative flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
            (abierto || activos > 0) && 'text-foreground',
          )}
        >
          <ListFilter className="size-4" />
          {activos > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activos}
            </span>
          )}
        </button>
      ) : (
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
      )}

      {abierto && (
        <div
          ref={panelRef}
          style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
          className={cn(
            'absolute top-full z-30 w-[min(22rem,calc(100vw-1rem))] rounded-lg border border-border bg-card shadow-lg',
            soloIcono ? 'right-0 mt-3' : 'left-0 mt-2',
          )}
        >
          <div
            ref={scrollRef}
            style={altoMax ? { maxHeight: `min(65vh, ${altoMax}px)` } : undefined}
            className="max-h-[min(65vh,calc(100dvh-22rem))] space-y-2.5 overflow-y-auto p-4"
          >
            {children}
          </div>
          {acciones && (
            <div className="border-t border-border px-4 py-3">
              {typeof acciones === 'function' ? acciones(() => setAbierto(false)) : acciones}
            </div>
          )}
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

/**
 * Campo plegable tipo "dropdown": cerrado muestra un resumen de lo elegido
 * ("Todas las marcas", "VER26", "3 vendedores"); al tocarlo se despliega
 * debajo, empujando el resto del panel. `children` recibe `cerrar` para
 * plegarlo (p. ej. al elegir en una lista de opcion unica).
 */
function Plegable({
  resumen,
  activo,
  children,
}: {
  resumen: string
  activo: boolean
  children: (cerrar: () => void) => ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-card px-3 text-left text-sm shadow-xs transition-colors hover:bg-accent/50',
          activo ? 'border-primary/60 text-foreground' : 'border-input text-muted-foreground',
          abierto && 'border-primary',
        )}
      >
        <span className="truncate">{resumen}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="mt-1.5 overflow-hidden rounded-md border border-border bg-background">
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  )
}

/**
 * Seleccion multiple plegable. Sin nada tildado no filtra. `todas` es el texto
 * del campo cerrado sin seleccion ("Todas las marcas") y `plural` el de varias
 * ("3 marcas"). Con 6 o mas opciones suma un buscador.
 */
export function ListaFiltro({
  label,
  todas,
  plural,
  opciones,
  valor,
  onChange,
}: {
  /** Nombre del filtro (accesibilidad). */
  label: string
  todas: string
  plural: string
  opciones: OpcionFiltro[]
  valor: string[]
  onChange: (valor: string[]) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const q = normalizar(busqueda)
  const visibles = q ? opciones.filter((o) => normalizar(o.label).includes(q)) : opciones
  const alternar = (v: string) => onChange(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v])
  const resumen =
    valor.length === 0
      ? todas
      : valor.length === 1
        ? (opciones.find((o) => o.value === valor[0])?.label ?? valor[0])
        : `${valor.length} ${plural}`

  return (
    <Plegable resumen={resumen} activo={valor.length > 0}>
      {() => (
        <div role="group" aria-label={label}>
          {opciones.length >= 6 && (
            <div className="relative border-b border-border p-1.5">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                className="w-full rounded-md border border-input bg-card py-1 pl-7 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto py-1">
            {visibles.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Sin opciones.</p>
            ) : (
              visibles.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={valor.includes(o.value)}
                    onChange={() => alternar(o.value)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span>{valor.length === 0 ? 'Todas incluidas' : `${valor.length} seleccionadas`}</span>
            {valor.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="font-medium text-primary hover:underline">
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}
    </Plegable>
  )
}

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** Rango de fechas plegable (desde / hasta, ambos inclusivos y opcionales). */
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
  const resumen =
    desde && hasta
      ? `${fechaCorta(desde)} – ${fechaCorta(hasta)}`
      : desde
        ? `Desde ${fechaCorta(desde)}`
        : hasta
          ? `Hasta ${fechaCorta(hasta)}`
          : `Cualquier ${label.toLowerCase()}`
  return (
    <Plegable resumen={resumen} activo={Boolean(desde || hasta)}>
      {() => (
        <div className="space-y-2 p-3">
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
          {(desde || hasta) && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  onDesde('')
                  onHasta('')
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>
      )}
    </Plegable>
  )
}

/** Una sola opcion entre varias, plegable: elegir una cierra el campo. */
export function OpcionUnica<T extends string>({
  label,
  opciones,
  valor,
  porDefecto,
  onChange,
}: {
  label: string
  opciones: { value: T; label: string }[]
  valor: T
  /** Valor inicial: si el elegido es otro, el campo se marca como activo. */
  porDefecto: T
  onChange: (valor: T) => void
}) {
  const elegida = opciones.find((o) => o.value === valor)
  return (
    <Plegable resumen={`${label}: ${elegida?.label ?? ''}`} activo={valor !== porDefecto}>
      {(cerrar) => (
        <div role="listbox" aria-label={label} className="py-1">
          {opciones.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={valor === o.value}
              onClick={() => {
                onChange(o.value)
                cerrar()
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className={cn(valor === o.value && 'font-medium')}>{o.label}</span>
              {valor === o.value && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </Plegable>
  )
}
