import { ArrowDown, ArrowUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

/**
 * Tabla con orden por columna y carga progresiva (50 filas por vez, la
 * siguiente al llegar al final): las listas de FASTRO pueden tener miles de
 * filas y renderizarlas todas de golpe es lo que hacia lenta la app anterior.
 */
export function Tabla<T>({
  columnas,
  filas,
  clave,
  onClickFila,
  ordenInicial,
  pie,
}: {
  columnas: ColumnaTabla<T>[]
  filas: T[]
  clave: (fila: T) => string
  onClickFila?: (fila: T) => void
  ordenInicial?: { id: string; desc: boolean }
  /** Fila extra al final (totales). */
  pie?: ReactNode
}) {
  const [orden, setOrden] = useState<{ id: string; desc: boolean } | null>(ordenInicial ?? null)
  const [visibles, setVisibles] = useState(LOTE)
  const centinela = useRef<HTMLDivElement>(null)

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
  useEffect(() => setVisibles(LOTE), [filas, orden])

  useEffect(() => {
    const el = centinela.current
    if (!el || visibles >= ordenadas.length) return
    const obs = new IntersectionObserver((e) => {
      if (e[0].isIntersecting) setVisibles((v) => v + LOTE)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [visibles, ordenadas.length])

  function alternar(id: string) {
    setOrden((o) => (o?.id === id ? (o.desc ? null : { id, desc: true }) : { id, desc: false }))
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {columnas.map((c) => (
              <th
                key={c.id}
                className={cn(
                  'whitespace-nowrap px-4 py-2.5 font-medium',
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
        {pie && <tfoot className="border-t border-border bg-secondary/50 font-medium">{pie}</tfoot>}
      </table>
      {visibles < ordenadas.length && <div ref={centinela} className="h-8" />}
    </div>
  )
}
