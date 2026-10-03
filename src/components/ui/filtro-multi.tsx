import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { normalizar } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface OpcionFiltro {
  value: string
  label: string
}

/**
 * Filtro de seleccion multiple. Sin nada tildado no filtra (equivale a
 * "todos"). Con 6 o mas opciones suma un buscador.
 */
export function FiltroMulti({
  label,
  opciones,
  valor,
  onChange,
  className,
}: {
  label: string
  opciones: OpcionFiltro[]
  valor: string[]
  onChange: (valor: string[]) => void
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const q = normalizar(busqueda)
  const visibles = q ? opciones.filter((o) => normalizar(o.label).includes(q)) : opciones

  function alternar(v: string) {
    onChange(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v])
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs hover:bg-accent',
          valor.length > 0 && 'border-primary/50',
        )}
      >
        {label}
        {valor.length > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
            {valor.length}
          </span>
        )}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {abierto && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-md border border-border bg-card shadow-lg">
          {opciones.length >= 6 && (
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute left-4.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {visibles.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Sin opciones.</p>
            ) : (
              visibles.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
                >
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
          {valor.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
