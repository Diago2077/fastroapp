import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export function Modal({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
  footer,
  ancho = 'max-w-lg',
}: {
  abierto: boolean
  titulo: string
  descripcion?: string
  onCerrar: () => void
  children: ReactNode
  footer?: ReactNode
  ancho?: string
}) {
  // Escape cierra, y el body no scrollea detras del modal
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', onKey)
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflowPrevio
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cn('w-full rounded-lg border border-border bg-card shadow-xl', ancho)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
            {descripcion && (
              <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onCerrar} aria-label="Cerrar">
            <X />
          </Button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  )
}

/** Confirmacion para acciones destructivas. */
export function ConfirmModal({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = 'Eliminar',
  procesando = false,
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean
  titulo: string
  mensaje: ReactNode
  textoConfirmar?: string
  procesando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      onCerrar={onCancelar}
      ancho="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirmar} disabled={procesando}>
            {procesando ? 'Eliminando…' : textoConfirmar}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground">{mensaje}</div>
    </Modal>
  )
}
