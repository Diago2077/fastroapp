import { useCallback, useEffect, useState } from 'react'
import type { Permisos, Rol, Usuario } from '@/lib/database.types'
import { apiFetch, supabase } from '@/lib/supabase'

interface Estado {
  data: Usuario[]
  loading: boolean
  error: string | null
}

/**
 * Las personas del sistema. Quien no es admin solo recibe su propia fila:
 * eso lo decide la RLS (`supabase/migrations/002_rls.sql`), no este hook.
 *
 * El reparto entre PostgREST y /api no es arbitrario:
 *
 *   · Cambiar el rol y activar/desactivar van DIRECTO a PostgREST. Son las
 *     unicas dos columnas con `grant update` para el cliente, y la policy ya
 *     exige ser admin; no hace falta un endpoint que repita ese chequeo.
 *   · Crear, editar nombre/email, cambiar contrasena y eliminar pasan por
 *     /api/admin/usuarios, porque todas tocan `auth.users` y eso necesita la
 *     service_role key, que solo puede vivir en el servidor.
 *
 * Antes de agregar un endpoint nuevo conviene preguntarse de que lado cae.
 */
export function useUsuarios() {
  const [estado, setEstado] = useState<Estado>({ data: [], loading: true, error: null })

  const refetch = useCallback(async () => {
    setEstado((s) => ({ ...s, loading: true, error: null }))
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .order('nombre', { ascending: true })

    setEstado({
      data: (data ?? []) as Usuario[],
      loading: false,
      error: error ? 'No se pudieron cargar los usuarios.' : null,
    })
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function crear(payload: { nombre: string; email: string; password: string; rol: Rol }) {
    try {
      await apiFetch('/api/admin/usuarios', { accion: 'crear', ...payload })
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al crear el usuario.' }
    }
  }

  /** Nombre y email pasan por /api: el email es tambien el usuario del login. */
  async function editar(payload: { id: string; nombre: string; email: string }) {
    try {
      await apiFetch('/api/admin/usuarios', { accion: 'editar', ...payload })
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al guardar los datos.' }
    }
  }

  async function cambiarRol(id: string, rol: Rol) {
    const { error } = await supabase.from('usuarios').update({ rol }).eq('id', id)
    return { error: mensajeDePostgrest(error?.message) }
  }

  /** Los permisos finos van directo a PostgREST: tienen grant por columna y la policy exige admin. */
  async function guardarPermisos(id: string, permisos: Permisos) {
    const { error } = await supabase.from('usuarios').update(permisos).eq('id', id)
    return { error: mensajeDePostgrest(error?.message) }
  }

  async function setActivo(id: string, activo: boolean) {
    const { error } = await supabase.from('usuarios').update({ activo }).eq('id', id)
    return { error: mensajeDePostgrest(error?.message) }
  }

  /** Borra la cuenta entera, en Auth y en `usuarios`. No tiene vuelta atras. */
  async function eliminar(id: string) {
    try {
      await apiFetch('/api/admin/usuarios', { accion: 'eliminar', id })
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al eliminar la cuenta.' }
    }
  }

  async function cambiarPassword(id: string, password: string) {
    try {
      await apiFetch('/api/admin/usuarios', { accion: 'password', id, password })
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Error al cambiar la contrasena.' }
    }
  }

  return { ...estado, refetch, crear, editar, cambiarRol, guardarPermisos, setActivo, eliminar, cambiarPassword }
}

/**
 * Un update que la RLS rechaza no llega como error: Postgres afecta cero
 * filas y PostgREST contesta 200. El unico caso que SI da error es el que
 * falla el `with check` -- un admin intentando sacarse a si mismo el rol o
 * desactivarse -- y su mensaje crudo ("new row violates row-level security
 * policy") no le dice nada a nadie.
 */
function mensajeDePostgrest(mensaje: string | undefined): string | null {
  if (!mensaje) return null
  if (/row-level security/i.test(mensaje)) {
    return 'No podes quitarte a vos mismo el acceso de administrador.'
  }
  if (/permission denied/i.test(mensaje)) {
    return 'No tenes permiso para esta operacion.'
  }
  return 'No se pudo guardar el cambio.'
}
