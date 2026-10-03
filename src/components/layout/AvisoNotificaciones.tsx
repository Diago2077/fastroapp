import { Bell, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { claveLocal } from '@/lib/app'
import { activarPush, asegurarPush, estadoPermiso, pushConfigurado, pushSoportado } from '@/lib/push'

const CLAVE_POSPONER = claveLocal('notif-posponer')
const TRES_DIAS = 3 * 24 * 60 * 60 * 1000

const posponido = () => {
  try {
    return Number(localStorage.getItem(CLAVE_POSPONER) || 0) > Date.now()
  } catch {
    return false
  }
}

/**
 * Con el permiso ya concedido, deja la suscripcion de este dispositivo al dia
 * en silencio (sobrevive a actualizaciones). Sin decidir, ofrece activar las
 * notificaciones; si lo descartan no vuelve a aparecer por 3 dias.
 */
export function AvisoNotificaciones({ userId }: { userId: string }) {
  const [visible, setVisible] = useState(false)
  const [activando, setActivando] = useState(false)

  useEffect(() => {
    if (!pushSoportado() || !pushConfigurado()) return
    const permiso = estadoPermiso()
    if (permiso === 'granted') void asegurarPush(userId)
    else if (permiso === 'default' && !posponido()) setVisible(true)
  }, [userId])

  if (!visible) return null

  async function activar() {
    setActivando(true)
    try {
      await activarPush(userId)
      toast.success('Notificaciones activadas')
      setVisible(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo activar')
    }
    setActivando(false)
  }

  function posponer() {
    try {
      localStorage.setItem(CLAVE_POSPONER, String(Date.now() + TRES_DIAS))
    } catch {
      /* sin localStorage vuelve a preguntar */
    }
    setVisible(false)
  }

  return (
    <div className="border-b border-border bg-primary/5">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm sm:px-6">
        <Bell className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">Activa las notificaciones para enterarte de los cambios en los pedidos.</span>
        <Button size="sm" onClick={activar} disabled={activando}>
          {activando ? 'Activando…' : 'Activar'}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Ahora no" onClick={posponer}>
          <X />
        </Button>
      </div>
    </div>
  )
}
