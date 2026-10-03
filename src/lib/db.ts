import type { PostgrestError } from '@supabase/supabase-js'

/**
 * PostgREST corta cada respuesta en `max_rows` (1000 por defecto), asi que
 * una lista larga hay que pedirla por paginas. `crearConsulta` se llama una
 * vez por pagina y tiene que devolver una consulta NUEVA y ORDENADA (sin un
 * orden estable las paginas se pisan o se saltean filas).
 */
export async function traerTodo<T>(
  crearConsulta: () => { range: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: PostgrestError | null }> },
  tamano = 1000,
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += tamano) {
    const { data, error } = await crearConsulta().range(desde, desde + tamano - 1)
    if (error) throw new Error(error.message)
    const pagina = (data ?? []) as T[]
    filas.push(...pagina)
    if (pagina.length < tamano) break
  }
  return filas
}

/** Mensaje legible para un error de PostgREST/Postgres. */
export function mensajeError(error: { message: string; code?: string } | null | undefined, porDefecto: string): string {
  if (!error) return porDefecto
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) {
    // Los triggers de pedidos explican el motivo en el propio mensaje
    return /administrador|permiso para/i.test(error.message) ? error.message : 'No tenes permiso para esta operacion.'
  }
  if (error.code === '23505') return 'Ya existe un registro con ese valor.'
  return porDefecto
}
