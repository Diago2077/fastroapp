import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from './field'

/** Encabezado estandar de pantalla: titulo, descripcion y acciones a la derecha. */
export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  buscador,
}: {
  titulo: string
  descripcion?: string
  acciones?: ReactNode
  /** Buscador: en escritorio va al lado de las acciones (a su izquierda); en celular baja a su propia fila. */
  buscador?: ReactNode
}) {
  if (buscador) {
    return (
      <div className="mb-5 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-4 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{titulo}</h1>
          {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
        </div>
        <div className="order-3 col-span-2 sm:order-2 sm:col-span-1 sm:w-80 [&>div]:max-w-none">{buscador}</div>
        {acciones && <div className="order-2 flex items-center gap-2 sm:order-3">{acciones}</div>}
      </div>
    )
  }
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{titulo}</h1>
        {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}

export function Buscador({
  valor,
  onChange,
  placeholder,
  accion,
}: {
  valor: string
  onChange: (v: string) => void
  placeholder: string
  /** Control a la derecha, dentro del campo (p. ej. el icono de filtros). */
  accion?: ReactNode
}) {
  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className={accion ? 'h-9 pl-9 pr-11' : 'h-9 pl-9'}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      />
      {accion && <div className="absolute right-1.5 top-1/2 z-30 -translate-y-1/2">{accion}</div>}
    </div>
  )
}

export function Tarjeta({
  titulo,
  children,
  acciones,
}: {
  titulo?: string
  children: ReactNode
  acciones?: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card shadow-xs">
      {(titulo || acciones) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
          {acciones}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}
