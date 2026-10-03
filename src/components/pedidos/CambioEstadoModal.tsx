import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Textarea } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { ESTADO_LABEL, type EstadoPedido } from '@/lib/database.types'
import { mensajeError } from '@/lib/db'
import { hoyISO } from '@/lib/format'
import { supabase } from '@/lib/supabase'

export interface CambioEstado {
  id: string
  numero: string
  actual: EstadoPedido
  siguiente: EstadoPedido
}

/**
 * Confirma y aplica un cambio de estado. Al pasar de Cerrado a Enviado pide
 * una nota de envio (opcional) que se agrega a la observacion y fija la fecha
 * de envio. Quien puede hacer cada cambio lo decide la base (trigger
 * `orders_reglas`); la UI solo evita ofrecer lo que va a ser rechazado.
 */
export function CambioEstadoModal({
  cambio,
  onCerrar,
  onHecho,
}: {
  cambio: CambioEstado | null
  onCerrar: () => void
  onHecho: () => void
}) {
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setNota('')
    setError(null)
  }, [cambio])

  if (!cambio) return null
  const { siguiente, actual } = cambio
  const aEnviado = siguiente === 'sent'
  const cancelar = siguiente === 'cancelled'
  const reactivar = actual === 'cancelled'

  const titulo = cancelar
    ? 'Cancelar pedido'
    : reactivar
      ? 'Reactivar pedido'
      : aEnviado
        ? 'Marcar como Enviado'
        : 'Cambiar estado'
  const mensaje = cancelar
    ? `El pedido ${cambio.numero} quedara cancelado y no cuenta en dashboard ni reportes.`
    : reactivar
      ? `El pedido ${cambio.numero} volvera al estado "Abierto".`
      : `El pedido ${cambio.numero} pasara de "${ESTADO_LABEL[actual]}" a "${ESTADO_LABEL[siguiente]}".`

  async function confirmar() {
    if (!cambio) return
    setGuardando(true)
    setError(null)

    const cambios: { status: EstadoPedido; shipping_date?: string; observation?: string } = { status: siguiente }
    if (aEnviado) {
      cambios.shipping_date = hoyISO()
      if (nota.trim()) {
        const { data } = await supabase.from('orders').select('observation').eq('id', cambio.id).maybeSingle()
        const previa = (data?.observation ?? '').trim()
        cambios.observation = previa ? `${previa}\n${nota.trim()}` : nota.trim()
      }
    }

    const { error: err } = await supabase.from('orders').update(cambios).eq('id', cambio.id)
    setGuardando(false)
    if (err) return setError(mensajeError(err, 'No se pudo cambiar el estado.'))
    toast.success(`Estado: ${ESTADO_LABEL[siguiente]}`)
    onHecho()
  }

  return (
    <Modal
      abierto
      titulo={titulo}
      onCerrar={onCerrar}
      ancho="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Volver
          </Button>
          <Button variant={cancelar ? 'destructive' : 'primary'} onClick={confirmar} disabled={guardando}>
            {guardando ? 'Guardando…' : cancelar ? 'Cancelar pedido' : reactivar ? 'Reactivar' : aEnviado ? 'Marcar Enviado' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>{mensaje}</p>
        {aEnviado && (
          <Textarea
            placeholder="Observacion del envio (opcional). Se agrega a la observacion del pedido. Ej: enviado por encomienda…"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            autoFocus
          />
        )}
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
