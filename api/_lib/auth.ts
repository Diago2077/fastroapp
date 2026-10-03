import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { error, type ApiRequest, type ApiResponse } from './http.js'

export type Rol = 'admin' | 'usuario'

export interface PerfilServidor {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
}

/**
 * Cliente con service_role: pasa por encima de la RLS.
 * Solo puede existir del lado del servidor. Si esta clave llegara al
 * navegador, cualquiera podria leer y escribir toda la base.
 */
export function clienteAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el servidor')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function tokenDe(req: ApiRequest): string | null {
  const cabecera = req.headers.authorization ?? req.headers.Authorization
  const valor = Array.isArray(cabecera) ? cabecera[0] : cabecera
  if (!valor?.startsWith('Bearer ')) return null
  const token = valor.slice(7).trim()
  return token || null
}

/**
 * Valida el JWT contra Supabase y devuelve el perfil.
 *
 * El rol NUNCA sale de lo que manda el cliente: se lee de la base a partir
 * del id que trae el token ya verificado del lado del servidor.
 */
export async function usuarioAutenticado(req: ApiRequest): Promise<PerfilServidor | null> {
  const token = tokenDe(req)
  if (!token) return null

  const admin = clienteAdmin()
  const { data, error: errAuth } = await admin.auth.getUser(token)
  if (errAuth || !data.user) return null

  const { data: perfil } = await admin
    .from('usuarios')
    .select('id, nombre, email, rol, activo')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!perfil || !perfil.activo) return null
  return perfil as PerfilServidor
}

/** Devuelve el perfil de cualquier usuario activo; si no, ya respondio. */
export async function exigeUsuario(
  req: ApiRequest,
  res: ApiResponse,
): Promise<PerfilServidor | null> {
  const perfil = await usuarioAutenticado(req)
  if (!perfil) {
    error(res, 401, 'No autenticado.')
    return null
  }
  return perfil
}

/** Devuelve el perfil solo si es admin; si no, ya respondio el error. */
export async function exigeAdmin(
  req: ApiRequest,
  res: ApiResponse,
): Promise<PerfilServidor | null> {
  const perfil = await exigeUsuario(req, res)
  if (!perfil) return null
  if (perfil.rol !== 'admin') {
    error(res, 403, 'No tenes permiso para esta operacion.')
    return null
  }
  return perfil
}
