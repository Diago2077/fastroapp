import { ArrowDown, ArrowUp } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ColumnaTabla<T> {
  id: string
  header: string
  render: (fila: T) => ReactNode
  /** Valor para ordenar al tocar el encabezado. Sin esto la columna no ordena. */
  orden?: (fila: T) => string | number | null | undefined
  align?: 'left' | 'right' | 'center'
  className?: string
}

const LOTE = 50

/** Alto minimo de la tabla cuando se ajusta a la pantalla (no se aplasta si hay poco espacio). */
const ALTO_MINIMO = 220

/**
 * Tabla con orden por columna y carga progresiva (50 filas por vez, la
 * siguiente al llegar al final): las listas de FASTRO pueden tener miles de
 * filas y renderizarlas todas de golpe es lo que hacia lenta la app anterior.
 *
 * Con `ajustarAPantalla` la tabla ocupa hasta el borde inferior de la ventana
 * y scrollea por dentro: encabezado y pie quedan fijos y lo que hay encima
 * (buscador, filtros) no se mueve.
 */
export function Tabla<T>({
  columnas,
  filas,
  clave,
  onClickFila,
  ordenInicial,
  pie,
  ajustarAPantalla = false,
}: {
  columnas: ColumnaTabla<T>[]
  filas: T[]
  clave: (fila: T) => string
  onClickFila?: (fila: T) => void
  ordenInicial?: { id: string; desc: boolean }
  /** Fila extra al final (totales). */
  pie?: ReactNode
  /** Limita el alto al espacio que queda en pantalla y scrollea por dentro. */
  ajustarAPantalla?: boolean
}) {
  const [orden, setOrden] = useState<{ id: string; desc: boolean } | null>(ordenInicial ?? null)
  const [visibles, setVisibles] = useState(LOTE)
  const centinela = useRef<HTMLDivElement>(null)
  const contenedor = useRef<HTMLDivElement>(null)
  const [altoMax, setAltoMax] = useState<number | null>(null)

  // Alto disponible = pantalla - lo que hay arriba de la tabla - el margen de abajo
  // (en celular, la barra inferior de navegacion).
  useLayoutEffect(() => {
    const el = contenedor.current
    if (!ajustarAPantalla || !el) return
    const calcular = () => {
      const arriba = el.getBoundingClientRect().top + window.scrollY
      const escritorio = window.matchMedia('(min-width: 768px)').matches
      const margenAbajo = escritorio ? 34 : 24 + 64 + 2
      const libre = Math.max(ALTO_MINIMO, Math.floor(window.innerHeight - arriba - margenAbajo))
      setAltoMax((a) => (a !== null && Math.abs(a - libre) < 2 ? a : libre))
    }
    calcular()
    window.addEventListener('resize', calcular)
    // Si cambia el alto de lo de arriba (filtros que se reacomodan, mensajes) se recalcula
    const obs = new ResizeObserver(calcular)
    if (el.parentElement) obs.observe(el.parentElement)
    return () => {
      window.removeEventListener('resize', calcular)
      obs.disconnect()
    }
  }, [ajustarAPantalla])

  const ordenadas = useMemo(() => {
    if (!orden) return filas
    const col = columnas.find((c) => c.id === orden.id)
    if (!col?.orden) return filas
    const valor = col.orden
    const dir = orden.desc ? -1 : 1
    return [...filas].sort((a, b) => {
      const va = valor(a)
      const vb = valor(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' }) * dir
    })
  }, [filas, columnas, orden])

  // Al cambiar la lista (filtros, busqueda) se vuelve al primer lote
  useEffect(() => {
    setVisibles(LOTE)
    if (contenedor.current) contenedor.current.scrollTop = 0
  }, [filas, orden])

  useEffect(() => {
    const el = centinela.current
    if (!el || visibles >= ordenadas.length) return
    // Con scroll interno, el "final" se mide dentro del contenedor y no de la ventana
    const obs = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting) setVisibles((v) => v + LOTE)
      },
      { root: ajustarAPantalla ? contenedor.current : null, rootMargin: '200px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visibles, ordenadas.length, ajustarAPantalla])

  function alternar(id: string) {
    setOrden((o) => (o?.id === id ? (o.desc ? null : { id, desc: true }) : { id, desc: false }))
  }

  return (
    <div
      ref={contenedor}
      style={ajustarAPantalla && altoMax ? { maxHeight: altoMax } : undefined}
      className={cn('rounded-lg border border-border bg-card', ajustarAPantalla ? 'overflow-auto' : 'overflow-x-auto')}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {columnas.map((c) => (
              <th
                key={c.id}
                className={cn(
                  'whitespace-nowrap px-4 py-2.5 font-medium',
                  ajustarAPantalla && 'sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--color-border)]',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                  c.orden && 'cursor-pointer select-none hover:text-foreground',
                )}
                onClick={c.orden ? () => alternar(c.id) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {orden?.id === c.id &&
                    (orden.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.slice(0, visibles).map((f) => (
            <tr
              key={clave(f)}
              onClick={onClickFila ? () => onClickFila(f) : undefined}
              className={cn(
                'border-b border-border last:border-0',
                onClickFila && 'cursor-pointer hover:bg-accent/40',
              )}
            >
              {columnas.map((c) => (
                <td
                  key={c.id}
                  className={cn(
                    'whitespace-nowrap px-4 py-2.5',
                    c.align === 'right' && 'text-right tabular',
                    c.align === 'center' && 'text-center',
                    c.className,
                  )}
                >
                  {c.render(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {pie && (
          <tfoot
            className={cn(
              'whitespace-nowrap border-t border-border bg-secondary/50 font-medium',
              ajustarAPantalla &&
                '[&_td]:sticky [&_td]:bottom-0 [&_td]:z-10 [&_td]:bg-secondary [&_td]:shadow-[inset_0_1px_0_var(--color-border)]',
            )}
          >
            {pie}
          </tfoot>
        )}
      </table>
      {visibles < ordenadas.length && <div ref={centinela} className="h-8" />}
    </div>
  )
}
