import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Si falta el .env la app no explota: muestra un cartel de "falta configurar".
 * A diferencia de un sitio publico, aca no hay datos de demo posibles porque
 * todo esta detras del login.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
)

/** Token de la sesion actual, para autenticar las llamadas a /api/*. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** Wrapper de fetch que adjunta el JWT de Supabase a las funciones serverless. */
export async function apiFetch<T>(path: string, body?: unknown): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new Error('Sesion expirada. Volve a iniciar sesion.')

  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const texto = await res.text()
  let json: unknown
  try {
    json = texto ? JSON.parse(texto) : {}
  } catch {
    // Vercel corta los requests que superan su limite de cuerpo antes de que
    // llegue a correr la funcion, y contesta con HTML: no hay JSON que
    // parsear ni mensaje propio que mostrar.
    if (res.status === 413) throw new Error('El contenido enviado es demasiado grande.')
    throw new Error(`Respuesta invalida del servidor (${res.status})`)
  }

  if (!res.ok) {
    const msg = (json as { error?: string })?.error
    throw new Error(msg || `Error ${res.status}`)
  }
  return json as T
}
