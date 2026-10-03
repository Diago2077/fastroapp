import { supabase } from '@/lib/supabase'

/**
 * Notificaciones push (Web Push / VAPID). Suscribe el dispositivo al servicio
 * de push del navegador y guarda la suscripcion en `push_subscriptions`; el
 * envio real lo hace la Edge Function `send-push`.
 *
 * La clave publica VAPID es publica por diseño (va en el bundle). El par se
 * genero junto con los secrets de la funcion; ver CLAUDE.md. En iPhone/iPad
 * solo funciona con la app instalada en la pantalla de inicio (iOS 16.4+).
 */
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

export type EstadoPermiso = 'granted' | 'denied' | 'default' | 'unsupported'

export const pushSoportado = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const pushConfigurado = () => VAPID_PUBLIC_KEY.length > 0

export function estadoPermiso(): EstadoPermiso {
  return pushSoportado() ? Notification.permission : 'unsupported'
}

export async function dispositivoSuscripto(): Promise<boolean> {
  if (!pushSoportado()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    return Boolean(await reg.pushManager.getSubscription())
  } catch {
    return false
  }
}

function claveABytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function suscribirYGuardar(userId: string) {
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: claveABytes(VAPID_PUBLIC_KEY),
    })
  }
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(error.message)
}

/** Pide permiso (hay que llamarlo desde un gesto del usuario), suscribe y guarda. */
export async function activarPush(userId: string): Promise<void> {
  if (!pushSoportado()) throw new Error('Este dispositivo no soporta notificaciones.')
  if (!pushConfigurado()) throw new Error('Falta configurar la clave VITE_VAPID_PUBLIC_KEY.')
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('Permiso de notificaciones denegado.')
  await suscribirYGuardar(userId)
}

/** Si el permiso ya estaba concedido, re-suscribe en silencio (no hay prompt). */
export async function asegurarPush(userId: string): Promise<void> {
  if (!pushSoportado() || !pushConfigurado() || Notification.permission !== 'granted') return
  try {
    await suscribirYGuardar(userId)
  } catch {
    /* sin push, la app sigue igual */
  }
}

/** Cancela la suscripcion de ESTE dispositivo y borra su fila. */
export async function desactivarPush(): Promise<void> {
  if (!pushSoportado()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  try {
    await sub.unsubscribe()
  } catch {
    /* ya estaba dada de baja */
  }
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

/**
 * Avisa el cambio de estado de un pedido a quienes estan en
 * `notify_recipients`. Dispara y olvida: nunca debe romper ni demorar el
 * cambio de estado.
 */
export function avisarCambioDeEstado(orderId: string, status: string): void {
  void supabase.functions
    .invoke('send-push', { body: { type: 'order_status', orderId, status } })
    .catch(() => {})
}
