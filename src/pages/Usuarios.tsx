import { Plus, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { ConfirmModal } from '@/components/ui/modal'
import { Buscador } from '@/components/ui/pagina'
import { OpcionUnica, PanelFiltros } from '@/components/ui/panel-filtros'
import {
  CambiarPasswordModal,
  EditarUsuarioModal,
  NuevoUsuarioModal,
  UsuarioDetalleModal,
} from '@/components/usuarios/UsuarioModales'
import { useAuth } from '@/hooks/useAuth'
import { useUsuarios } from '@/hooks/useUsuarios'
import { ROL_LABEL, type Rol, type Usuario } from '@/lib/database.types'
import { normalizar } from '@/lib/format'

/**
 * Las personas del sistema. Solo la ve un administrador: la ruta esta
 * envuelta en <RequiereAdmin> (src/App.tsx) y la RLS no le devuelve la lista
 * a nadie mas, asi que aca no hace falta repetir el chequeo.
 */
export default function Usuarios() {
  const { usuario: yo, refrescarPerfil } = useAuth()
  const {
    data,
    loading,
    error,
    refetch,
    crear,
    editar,
    cambiarRol,
    guardarPermisos,
    setActivo,
    eliminar,
    cambiarPassword,
  } = useUsuarios()

  const [busqueda, setBusqueda] = useState('')
  const [filtroRol, setFiltroRol] = useState<Rol | ''>('')
  const [filtroEstado, setFiltroEstado] = useState<'' | 'activo' | 'inactivo'>('')

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda)
    return data.filter((u) => {
      if (filtroRol && u.rol !== filtroRol) return false
      if (filtroEstado && (u.activo ? 'activo' : 'inactivo') !== filtroEstado) return false
      return !q || normalizar(u.nombre).includes(q) || normalizar(u.email).includes(q)
    })
  }, [data, busqueda, filtroRol, filtroEstado])

  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalDetalle, setModalDetalle] = useState<Usuario | null>(null)
  const [modalEditar, setModalEditar] = useState<Usuario | null>(null)
  const [modalPassword, setModalPassword] = useState<Usuario | null>(null)
  const [modalEliminar, setModalEliminar] = useState<Usuario | null>(null)

  const esYo = (u: Usuario | null) => u?.id === yo?.id

  /** Tras editarse a si mismo, el perfil del header quedaria con los datos viejos. */
  async function recargar(cambiado: Usuario | null) {
    await refetch()
    if (esYo(cambiado)) await refrescarPerfil()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Quienes tienen acceso al sistema y con que rol.
          </p>
        </div>
        <Button onClick={() => setModalNuevo(true)}>
          <Plus /> Nuevo
        </Button>
      </div>

      {data.length > 0 && (
        <div className="mb-4">
          <Buscador
            valor={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar por nombre o email…"
            accion={
              <PanelFiltros
                soloIcono
                activos={(filtroRol ? 1 : 0) + (filtroEstado ? 1 : 0)}
                onLimpiar={() => {
                  setFiltroRol('')
                  setFiltroEstado('')
                }}
              >
                <OpcionUnica
                  label="Rol"
                  porDefecto=""
                  valor={filtroRol}
                  onChange={setFiltroRol}
                  opciones={[
                    { value: '', label: 'Todos' },
                    { value: 'admin', label: 'Administradores' },
                    { value: 'usuario', label: 'Usuarios' },
                  ]}
                />
                <OpcionUnica
                  label="Estado"
                  porDefecto=""
                  valor={filtroEstado}
                  onChange={setFiltroEstado}
                  opciones={[
                    { value: '', label: 'Todos' },
                    { value: 'activo', label: 'Activos' },
                    { value: 'inactivo', label: 'Inactivos' },
                  ]}
                />
              </PanelFiltros>
            }
          />
        </div>
      )}

      {loading ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : data.length === 0 ? (
        <Vacio icono={UserRound} titulo="Sin usuarios" />
      ) : filtrados.length === 0 ? (
        <Vacio icono={UserRound} titulo="Sin resultados" descripcion="Probá con otra busqueda." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Nombre</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Rol</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setModalDetalle(u)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {u.nombre}
                    {esYo(u) && <span className="ml-2 text-xs text-muted-foreground">(vos)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{ROL_LABEL[u.rol]}</td>
                  <td className="px-4 py-2.5">
                    <Badge tono={u.activo ? 'success' : 'neutral'}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NuevoUsuarioModal
        abierto={modalNuevo}
        onCerrar={() => setModalNuevo(false)}
        onCreado={() => {
          setModalNuevo(false)
          refetch()
        }}
        crear={crear}
      />

      <UsuarioDetalleModal
        usuario={modalDetalle}
        esYo={esYo(modalDetalle)}
        onCerrar={() => setModalDetalle(null)}
        onEditar={() => {
          setModalEditar(modalDetalle)
          setModalDetalle(null)
        }}
        onCambiarPassword={() => {
          setModalPassword(modalDetalle)
          setModalDetalle(null)
        }}
        onEliminar={() => {
          setModalEliminar(modalDetalle)
          setModalDetalle(null)
        }}
        onToggleActivo={async () => {
          if (!modalDetalle) return
          const { error: err } = await setActivo(modalDetalle.id, !modalDetalle.activo)
          if (err) {
            toast.error(err)
            return
          }
          toast.success(modalDetalle.activo ? 'Cuenta desactivada' : 'Cuenta activada')
          setModalDetalle({ ...modalDetalle, activo: !modalDetalle.activo })
          refetch()
        }}
      />

      <EditarUsuarioModal
        usuario={modalEditar}
        esYo={esYo(modalEditar)}
        onCerrar={() => setModalEditar(null)}
        onGuardado={() => {
          recargar(modalEditar)
          setModalEditar(null)
        }}
        editar={editar}
        cambiarRol={cambiarRol}
        guardarPermisos={guardarPermisos}
      />

      <CambiarPasswordModal
        usuario={modalPassword}
        onCerrar={() => setModalPassword(null)}
        cambiarPassword={cambiarPassword}
      />

      <ConfirmModal
        abierto={modalEliminar !== null}
        titulo="Eliminar cuenta"
        textoConfirmar="Eliminar"
        mensaje={
          <>
            Se va a eliminar la cuenta de <strong>{modalEliminar?.nombre}</strong> (
            {modalEliminar?.email}) y no va a poder volver a entrar. No tiene vuelta atras; si
            solo querés cortarle el acceso, desactivala en vez de eliminarla.
          </>
        }
        onCancelar={() => setModalEliminar(null)}
        onConfirmar={async () => {
          if (!modalEliminar) return
          const { error: err } = await eliminar(modalEliminar.id)
          if (err) toast.error(err)
          else {
            toast.success('Cuenta eliminada')
            refetch()
          }
          setModalEliminar(null)
        }}
      />
    </div>
  )
}
