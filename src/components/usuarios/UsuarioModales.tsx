import { KeyRound, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input, Select } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { MatrizPermisos } from '@/components/usuarios/MatrizPermisos'
import { useUsuarios } from '@/hooks/useUsuarios'
import { PERMISOS_FLAGS, ROLES, ROL_LABEL, type Permisos, type Rol, type Usuario } from '@/lib/database.types'
import { formatFecha } from '@/lib/format'

/**
 * Modales de gestion de usuarios. Solo los ve un administrador: la pantalla
 * que los monta ya esta detras de <RequiereAdmin>, y la RLS corta igual si
 * alguien llega por otro lado.
 *
 * Un admin puede nombrar a otro admin. Es a proposito: con dos niveles y sin
 * un super_admin por encima, si no pudiera no habria forma de tener un
 * segundo administrador sin entrar a la base. Lo unico que no puede es
 * sacarse el rol a si mismo (lo impide la policy de update), para que el
 * sistema nunca quede sin ningun admin.
 */

const LARGO_MINIMO_PASSWORD = 8

/** Los permisos de un usuario (o todos en true / en false si no hay usuario). */
function permisosDe(usuario: Usuario | null, todos = false): Permisos {
  return Object.fromEntries(
    PERMISOS_FLAGS.map((k) => [k, usuario ? Boolean(usuario[k]) : todos]),
  ) as Permisos
}

function SelectorDeRol({
  valor,
  onCambiar,
  deshabilitado,
  hint,
}: {
  valor: Rol
  onCambiar: (rol: Rol) => void
  deshabilitado?: boolean
  hint?: string
}) {
  return (
    <Field label="Rol" hint={hint}>
      <Select
        value={valor}
        disabled={deshabilitado}
        onChange={(e) => onCambiar(e.target.value as Rol)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROL_LABEL[r]}
          </option>
        ))}
      </Select>
    </Field>
  )
}

export function NuevoUsuarioModal({
  abierto,
  onCerrar,
  onCreado,
  crear,
}: {
  abierto: boolean
  onCerrar: () => void
  onCreado: () => void
  crear: ReturnType<typeof useUsuarios>['crear']
}) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<Rol>('usuario')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setNombre('')
    setEmail('')
    setPassword('')
    setRol('usuario')
    setError(null)
  }, [abierto])

  async function onGuardar() {
    if (!nombre.trim() || !email.trim()) return setError('Completa todos los campos.')
    if (password.length < LARGO_MINIMO_PASSWORD) {
      return setError(`La contrasena necesita al menos ${LARGO_MINIMO_PASSWORD} caracteres.`)
    }

    setGuardando(true)
    setError(null)
    const { error: err } = await crear({
      nombre: nombre.trim(),
      email: email.trim(),
      password,
      rol,
    })
    setGuardando(false)
    if (err) setError(err)
    else {
      toast.success('Usuario creado')
      onCreado()
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Nuevo usuario"
      onCerrar={onCerrar}
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre *">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field label="Email *" hint="Es el email con el que va a iniciar sesion.">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Contrasena *" hint={`Minimo ${LARGO_MINIMO_PASSWORD} caracteres`}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <SelectorDeRol
          valor={rol}
          onCambiar={setRol}
          hint="Un administrador gestiona a todas las personas del sistema."
        />
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}

export function UsuarioDetalleModal({
  usuario,
  esYo,
  onCerrar,
  onEditar,
  onCambiarPassword,
  onEliminar,
  onToggleActivo,
}: {
  usuario: Usuario | null
  /** Es la cuenta de quien esta mirando: no puede desactivarse ni borrarse. */
  esYo: boolean
  onCerrar: () => void
  onEditar: () => void
  onCambiarPassword: () => void
  onEliminar: () => void
  onToggleActivo: () => void
}) {
  if (!usuario) return null

  return (
    <Modal
      abierto={usuario !== null}
      titulo="Detalle del usuario"
      onCerrar={onCerrar}
      ancho="max-w-md"
      footer={
        <>
          {!esYo && (
            <Button variant="outline" onClick={onEliminar}>
              <Trash2 className="text-destructive" /> Eliminar
            </Button>
          )}
          <Button variant="outline" onClick={onCambiarPassword}>
            <KeyRound /> Contrasena
          </Button>
          <Button onClick={onEditar}>
            <Pencil /> Editar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">{usuario.nombre}</h2>
            <p className="text-sm text-muted-foreground">{usuario.email}</p>
          </div>
          <button onClick={onToggleActivo} disabled={esYo}>
            <Badge tono={usuario.activo ? 'success' : 'neutral'}>
              {usuario.activo ? 'Activo' : 'Inactivo'}
            </Badge>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Rol</p>
            <p className="text-foreground">{ROL_LABEL[usuario.rol]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Alta</p>
            <p className="text-foreground">{formatFecha(usuario.created_at)}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {esYo
            ? 'Es tu propia cuenta: no podes desactivarla ni eliminarla.'
            : `Tocá el estado para ${usuario.activo ? 'desactivar' : 'activar'} la cuenta.`}
        </p>
      </div>
    </Modal>
  )
}

export function EditarUsuarioModal({
  usuario,
  esYo,
  onCerrar,
  onGuardado,
  editar,
  cambiarRol,
  guardarPermisos,
}: {
  usuario: Usuario | null
  esYo: boolean
  onCerrar: () => void
  onGuardado: () => void
  editar: ReturnType<typeof useUsuarios>['editar']
  cambiarRol: ReturnType<typeof useUsuarios>['cambiarRol']
  guardarPermisos: ReturnType<typeof useUsuarios>['guardarPermisos']
}) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Rol>('usuario')
  const [permisos, setPermisos] = useState<Permisos>(permisosDe(null))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!usuario) return
    setNombre(usuario.nombre)
    setEmail(usuario.email)
    setRol(usuario.rol)
    setPermisos(permisosDe(usuario))
    setError(null)
  }, [usuario])

  async function onGuardar() {
    if (!usuario) return
    if (!nombre.trim() || !email.trim()) return setError('Completa todos los campos.')

    setGuardando(true)
    setError(null)

    // Dos escrituras por caminos distintos: nombre/email van por /api
    // (tocan auth.users) y el rol va directo a PostgREST. Si la primera
    // falla no se intenta la segunda, para no dejar el cambio a medias.
    const { error: errDatos } = await editar({
      id: usuario.id,
      nombre: nombre.trim(),
      email: email.trim(),
    })
    if (errDatos) {
      setGuardando(false)
      setError(errDatos)
      return
    }

    if (rol !== usuario.rol) {
      const { error: errRol } = await cambiarRol(usuario.id, rol)
      if (errRol) {
        setGuardando(false)
        setError(errRol)
        return
      }
    }

    // Un admin tiene todos los permisos: se guardan todos en true
    const aGuardar = rol === 'admin' ? permisosDe(null, true) : permisos
    const { error: errPermisos } = await guardarPermisos(usuario.id, aGuardar)
    if (errPermisos) {
      setGuardando(false)
      setError(errPermisos)
      return
    }

    setGuardando(false)
    toast.success('Datos actualizados')
    onGuardado()
  }

  return (
    <Modal
      abierto={usuario !== null}
      titulo={`Editar — ${usuario?.nombre ?? ''}`}
      onCerrar={onCerrar}
      ancho="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre *">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Field>
        <Field label="Email *" hint="Es el email con el que inicia sesion: cambiarlo cambia su login.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <SelectorDeRol
          valor={rol}
          onCambiar={setRol}
          deshabilitado={esYo}
          hint={esYo ? 'No podes cambiarte el rol a vos mismo.' : undefined}
        />
        {rol === 'admin' ? (
          <p className="text-xs text-muted-foreground">Un administrador tiene todos los permisos.</p>
        ) : (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Permisos</p>
            <MatrizPermisos valor={permisos} onChange={setPermisos} />
          </div>
        )}
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}

export function CambiarPasswordModal({
  usuario,
  onCerrar,
  cambiarPassword,
}: {
  usuario: { id: string; nombre: string } | null
  onCerrar: () => void
  cambiarPassword: ReturnType<typeof useUsuarios>['cambiarPassword']
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setPassword('')
    setError(null)
  }, [usuario])

  async function onGuardar() {
    if (!usuario) return
    if (password.length < LARGO_MINIMO_PASSWORD) {
      return setError(`Minimo ${LARGO_MINIMO_PASSWORD} caracteres.`)
    }
    setGuardando(true)
    const { error: err } = await cambiarPassword(usuario.id, password)
    setGuardando(false)
    if (err) setError(err)
    else {
      toast.success('Contrasena actualizada')
      onCerrar()
    }
  }

  return (
    <Modal
      abierto={usuario !== null}
      titulo={`Cambiar contrasena — ${usuario?.nombre ?? ''}`}
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
        <Field label="Nueva contrasena" hint={`Minimo ${LARGO_MINIMO_PASSWORD} caracteres`}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
