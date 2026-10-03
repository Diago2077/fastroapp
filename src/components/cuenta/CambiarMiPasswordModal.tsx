import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { apiFetch } from '@/lib/supabase'

/** Cualquier usuario logueado cambia su propia contrasena, sin depender del administrador. */
export function CambiarMiPasswordModal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (abierto) {
      setPassword('')
      setConfirmacion('')
      setError(null)
    }
  }, [abierto])

  async function onGuardar() {
    if (password.length < 8) return setError('Minimo 8 caracteres.')
    if (password !== confirmacion) return setError('Las contrasenas no coinciden.')

    setGuardando(true)
    setError(null)
    try {
      await apiFetch('/api/cuenta/password', { password })
      toast.success('Contrasena actualizada')
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contrasena.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Cambiar mi contrasena"
      onCerrar={onCerrar}
      ancho="max-w-sm"
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Cambiar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nueva contrasena" hint="Minimo 8 caracteres">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field label="Repetir contrasena">
          <Input type="password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
