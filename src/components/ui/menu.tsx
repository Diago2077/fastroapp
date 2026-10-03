import { ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export interface ItemMenu {
  etiqueta: string
  icono?: ReactNode
  onClick: () => void
  /** Accion destructiva: se pinta en rojo. */
  peligro?: boolean
  /** Linea separadora arriba del item. */
  separador?: boolean
}

/**
 * Boton que despliega una lista de acciones (hacia arriba: se usa en el pie de
 * los modales). Cierra al elegir, al tocar afuera y con Escape; el Escape no
 * llega al modal de abajo.
 */
export function MenuAcciones({ etiqueta, items }: { etiqueta: string; items: ItemMenu[] }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  if (items.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        {etiqueta}
        <ChevronUp className={cn('transition-transform', !abierto && 'rotate-180')} />
      </Button>
      {abierto && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-2 min-w-52 rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {items.map((item) => (
            <div key={item.etiqueta}>
              {item.separador && <div className="my-1 border-t border-border" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAbierto(false)
                  item.onClick()
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent [&_svg]:size-4',
                  item.peligro && 'text-destructive',
                )}
              >
                {item.icono}
                {item.etiqueta}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
