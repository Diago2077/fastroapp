import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { normalizar } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
}

const control =
  'w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Select con buscador, para listas largas donde un <select> nativo es
 * incomodo. El desplegable se monta con un portal y se posiciona con las
 * coordenadas del boton, para no heredar el overflow o el z-index de donde
 * se lo invoque (por ejemplo, una tarjeta con overflow-hidden lo recortaria
 * si estuviera anidado normalmente).
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Buscar…',
  vacioLabel = 'Sin seleccionar',
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  vacioLabel?: string
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [posicion, setPosicion] = useState({ top: 0, left: 0, width: 0, arriba: false })
  const botonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  function reposicionar() {
    const rect = botonRef.current?.getBoundingClientRect()
    if (!rect) return
    const espacioAbajo = window.innerHeight - rect.bottom
    const arriba = espacioAbajo < 260 && rect.top > espacioAbajo
    setPosicion({
      top: arriba ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      arriba,
    })
  }

  useLayoutEffect(() => {
    if (abierto) reposicionar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  useEffect(() => {
    if (!abierto) return

    function onClickFuera(e: MouseEvent) {
      const objetivo = e.target as Node
      if (botonRef.current?.contains(objetivo) || panelRef.current?.contains(objetivo)) return
      setAbierto(false)
      setBusqueda('')
    }
    function onScrollOResize() {
      reposicionar()
    }

    document.addEventListener('mousedown', onClickFuera)
    window.addEventListener('scroll', onScrollOResize, true)
    window.addEventListener('resize', onScrollOResize)
    return () => {
      document.removeEventListener('mousedown', onClickFuera)
      window.removeEventListener('scroll', onScrollOResize, true)
      window.removeEventListener('resize', onScrollOResize)
    }
  }, [abierto])

  const seleccionado = options.find((o) => o.value === value)
  const q = normalizar(busqueda)
  const filtradas = q ? options.filter((o) => normalizar(o.label).includes(q)) : options

  function elegir(v: string) {
    onChange(v)
    setAbierto(false)
    setBusqueda('')
  }

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className={cn(control, 'flex h-9.5 items-center justify-between gap-2 text-left', className)}
      >
        <span className={cn('truncate', !seleccionado && 'text-muted-foreground')}>
          {seleccionado ? seleccionado.label : vacioLabel}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {abierto &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: posicion.top,
              left: posicion.left,
              width: posicion.width,
              transform: posicion.arriba ? 'translateY(-100%)' : undefined,
            }}
            className="z-[60] overflow-hidden rounded-md border border-border bg-card shadow-lg"
          >
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute left-4.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => elegir('')}
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-sm hover:bg-accent',
                  !value && 'bg-accent/60 font-medium',
                )}
              >
                {vacioLabel}
              </button>
              {filtradas.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados.</p>
              ) : (
                filtradas.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => elegir(o.value)}
                    className={cn(
                      'block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-accent',
                      value === o.value && 'bg-accent/60 font-medium',
                    )}
                  >
                    {o.label}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
