import { Loader2 } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Cargando({ texto = 'Cargando…', className }: { texto?: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" />
      {texto}
    </div>
  )
}

export function Vacio({
  icono: Icono,
  titulo,
  descripcion,
  accion,
}: {
  icono?: ComponentType<{ className?: string }>
  titulo: string
  descripcion?: string
  accion?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {Icono && (
        <div className="flex size-11 items-center justify-center rounded-full bg-secondary">
          <Icono className="size-5 text-muted-foreground" />
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-foreground">{titulo}</p>
        {descripcion && (
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{descripcion}</p>
        )}
      </div>
      {accion}
    </div>
  )
}

export function ErrorBox({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
      {mensaje}
    </div>
  )
}
