import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Cargando } from '@/components/ui/estado'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Tarjeta } from '@/components/ui/pagina'
import { useAuth } from '@/hooks/useAuth'
import { cargarConfig, useConfig } from '@/lib/config'
import { mensajeError } from '@/lib/db'
import {
  activarPush,
  desactivarPush,
  dispositivoSuscripto,
  estadoPermiso,
  pushConfigurado,
  pushSoportado,
} from '@/lib/push'
import { supabase } from '@/lib/supabase'

interface Persona {
  id: string
  nombre: string
  email: string
}

const DIAS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']

const leerIds = (valor: string | undefined): string[] => {
  try {
    const arr = JSON.parse(valor || '[]')
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

function ListaPersonas({
  personas,
  marcadas,
  onChange,
}: {
  personas: Persona[]
  marcadas: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <ul className="max-h-48 divide-y divide-border overflow-auto rounded-md border border-border">
      {personas.map((p) => (
        <li key={p.id}>
          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent/40">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={marcadas.includes(p.id)}
              onChange={() =>
                onChange(marcadas.includes(p.id) ? marcadas.filter((x) => x !== p.id) : [...marcadas, p.id])
              }
            />
            <span className="min-w-0">
              <span className="block truncate">{p.nombre}</span>
              <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

/** Tarjetas "Reportes por correo" y "Notificaciones" de Configuracion (solo admin). */
export function CorreosYAvisos() {
  const { usuario } = useAuth()
  const { config } = useConfig()
  const [personas, setPersonas] = useState<Persona[] | null>(null)

  // ── Reportes por correo ──
  const [destReporte, setDestReporte] = useState<string[]>([])
  const [semanal, setSemanal] = useState(false)
  const [diaSemana, setDiaSemana] = useState('1')
  const [mensual, setMensual] = useState(false)
  const [diaMes, setDiaMes] = useState('1')
  const [guardandoReporte, setGuardandoReporte] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // ── Notificaciones ──
  const [destAviso, setDestAviso] = useState<string[]>([])
  const [guardandoAviso, setGuardandoAviso] = useState(false)
  const [suscripto, setSuscripto] = useState(false)
  const [permiso, setPermiso] = useState(estadoPermiso())
  const [cambiandoDispositivo, setCambiandoDispositivo] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [paraQuien, setParaQuien] = useState('todos')
  const [enviandoMensaje, setEnviandoMensaje] = useState(false)

  useEffect(() => {
    let vivo = true
    void supabase
      .from('usuarios')
      .select('id, nombre, email')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => vivo && setPersonas((data ?? []) as Persona[]))
    void dispositivoSuscripto().then((s) => vivo && setSuscripto(s))
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    setDestReporte(leerIds(config.report_recipients))
    // Si nunca se configuraron los avisos, arrancan igual que los reportes
    setDestAviso(leerIds(config.notify_recipients ?? config.report_recipients))
    setSemanal(config.report_weekly_enabled === 'true')
    setDiaSemana(config.report_weekly_weekday || '1')
    setMensual(config.report_monthly_enabled === 'true')
    setDiaMes(config.report_monthly_day || '1')
  }, [config])

  async function guardarConfig(valores: Record<string, string>) {
    const { error } = await supabase
      .from('app_config')
      .upsert(Object.entries(valores).map(([key, value]) => ({ key, value })), { onConflict: 'key' })
    if (error) throw new Error(mensajeError(error, 'No se pudo guardar.'))
    await cargarConfig()
  }

  const valoresReporte = () => ({
    report_recipients: JSON.stringify(destReporte),
    report_weekly_enabled: String(semanal),
    report_weekly_weekday: diaSemana,
    report_monthly_enabled: String(mensual),
    report_monthly_day: String(Math.min(28, Math.max(1, Number(diaMes) || 1))),
  })

  async function guardarReporte() {
    setGuardandoReporte(true)
    try {
      await guardarConfig(valoresReporte())
      toast.success('Reportes por correo guardados')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
    setGuardandoReporte(false)
  }

  async function enviarAhora() {
    setEnviando(true)
    try {
      await guardarConfig(valoresReporte())
      const { data, error } = await supabase.functions.invoke('send-report', { body: { mode: 'manual' } })
      if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error ?? error.message)
      if (data?.error) throw new Error(data.error)
      toast.success(`Reporte enviado a ${data?.sent ?? 0} destinatario(s)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar el reporte')
    }
    setEnviando(false)
  }

  async function guardarAvisos() {
    setGuardandoAviso(true)
    try {
      await guardarConfig({ notify_recipients: JSON.stringify(destAviso) })
      toast.success('Destinatarios de avisos guardados')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
    setGuardandoAviso(false)
  }

  async function alternarDispositivo() {
    if (!usuario) return
    setCambiandoDispositivo(true)
    try {
      if (suscripto) {
        await desactivarPush()
        setSuscripto(false)
        toast.success('Notificaciones desactivadas en este dispositivo')
      } else {
        await activarPush(usuario.id)
        setSuscripto(true)
        toast.success('Notificaciones activadas en este dispositivo')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar')
    }
    setPermiso(estadoPermiso())
    setCambiandoDispositivo(false)
  }

  async function enviarMensaje() {
    if (!mensaje.trim()) return toast.error('Escribi el mensaje.')
    setEnviandoMensaje(true)
    const cuerpo =
      paraQuien === 'todos'
        ? { type: 'broadcast', message: mensaje.trim() }
        : { type: 'manual', userId: paraQuien, message: mensaje.trim() }
    const { data, error } = await supabase.functions.invoke('send-push', { body: cuerpo })
    setEnviandoMensaje(false)
    if (error || data?.error) return toast.error(data?.error ?? 'No se pudo enviar el mensaje')
    toast.success(data?.sent ? `Enviado a ${data.sent} dispositivo(s)` : 'Nadie tiene dispositivos suscriptos todavia')
    setMensaje('')
  }

  if (!personas) return <Cargando />

  const soportado = pushSoportado() && pushConfigurado()

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Tarjeta titulo="Reportes por correo">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Destinatarios</p>
            <ListaPersonas personas={personas} marcadas={destReporte} onChange={setDestReporte} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={semanal} onChange={(e) => setSemanal(e.target.checked)} />
            Envio semanal, los
            <Select className="h-8 w-auto" value={diaSemana} onChange={(e) => setDiaSemana(e.target.value)} disabled={!semanal}>
              {DIAS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={mensual} onChange={(e) => setMensual(e.target.checked)} />
            Envio mensual, el dia
            <Input type="number" min={1} max={28} className="h-8 w-16" value={diaMes} onChange={(e) => setDiaMes(e.target.value)} disabled={!mensual} />
          </label>
          <p className="text-xs text-muted-foreground">
            Los envios automaticos salen a las 8:00 (hora de Paraguay) del dia elegido. El mensual admite dia 1 a 28.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={guardarReporte} disabled={guardandoReporte || enviando}>
              {guardandoReporte ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button variant="outline" onClick={enviarAhora} disabled={enviando || guardandoReporte || destReporte.length === 0}>
              {enviando ? 'Enviando…' : 'Enviar ahora'}
            </Button>
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Notificaciones">
        <div className="space-y-5">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Este dispositivo</p>
            {!soportado ? (
              <p className="text-sm text-muted-foreground">
                Este dispositivo no soporta notificaciones (en iPhone/iPad hay que instalar la app en la pantalla de inicio).
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">
                  {permiso === 'denied'
                    ? 'Bloqueadas en el navegador'
                    : suscripto
                      ? 'Activadas'
                      : 'Desactivadas'}
                </span>
                {permiso !== 'denied' && (
                  <Button variant="outline" size="sm" onClick={alternarDispositivo} disabled={cambiandoDispositivo}>
                    {suscripto ? 'Desactivar' : 'Activar'}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Avisar al cambiar el estado de un pedido (menos a quien hizo el cambio)
            </p>
            <ListaPersonas personas={personas} marcadas={destAviso} onChange={setDestAviso} />
            <Button className="mt-3" onClick={guardarAvisos} disabled={guardandoAviso}>
              {guardandoAviso ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Enviar un mensaje</p>
            <Field>
              <Select value={paraQuien} onChange={(e) => setParaQuien(e.target.value)}>
                <option value="todos">Todos los dispositivos</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Textarea placeholder="Mensaje…" value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
            <Button variant="outline" onClick={enviarMensaje} disabled={enviandoMensaje}>
              {enviandoMensaje ? 'Enviando…' : 'Enviar mensaje'}
            </Button>
          </div>
        </div>
      </Tarjeta>
    </div>
  )
}
