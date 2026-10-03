import { useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * `app_config` (clave → valor) en memoria. Se carga una vez al entrar a la
 * app y se refresca al guardar la configuracion. Vive fuera de React para que
 * `compararTallas` pueda usarse como funcion comun en cualquier sort.
 */
type Config = Record<string, string>

let config: Config = {}
let cargada = false
const oyentes = new Set<() => void>()

function emitir() {
  config = { ...config }
  oyentes.forEach((o) => o())
}

export async function cargarConfig(): Promise<void> {
  const { data } = await supabase.from('app_config').select('key, value')
  const nueva: Config = {}
  for (const f of (data ?? []) as { key: string; value: string }[]) nueva[f.key] = f.value
  config = nueva
  cargada = true
  oyentes.forEach((o) => o())
}

export function setConfigLocal(parcial: Config) {
  config = { ...config, ...parcial }
  oyentes.forEach((o) => o())
}

export function limpiarConfig() {
  config = {}
  cargada = false
  emitir()
}

export function useConfig() {
  const valor = useSyncExternalStore(
    (cb) => {
      oyentes.add(cb)
      return () => oyentes.delete(cb)
    },
    () => config,
  )
  return { config: valor, cargada }
}

export function getConfig(clave: string, porDefecto = ''): string {
  return config[clave] ?? porDefecto
}

// ─────────────────────────────────────────────────────────────
// Orden de tallas (app_config.size_order = JSON ["XS","S",...])
// Las tallas que no estan configuradas van al final, en orden natural.
// ─────────────────────────────────────────────────────────────
export function ordenTallas(): string[] {
  try {
    const arr = JSON.parse(config.size_order || '[]')
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

export function compararTallas(a: string, b: string): number {
  const orden = ordenTallas()
  const ia = orden.indexOf(String(a))
  const ib = orden.indexOf(String(b))
  const pa = ia === -1 ? Infinity : ia
  const pb = ib === -1 ? Infinity : ib
  if (pa !== pb) return pa === Infinity ? 1 : pb === Infinity ? -1 : pa - pb
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export function ordenarTallas(tallas: string[]): string[] {
  return [...tallas].sort(compararTallas)
}
