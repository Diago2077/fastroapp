import { ArrowDown, ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Cargando } from '@/components/ui/estado'
import { Field, Input } from '@/components/ui/field'
import { EncabezadoPagina, Tarjeta } from '@/components/ui/pagina'
import { cargarConfig, compararTallas, ordenTallas, setConfigLocal, useConfig } from '@/lib/config'
import { mensajeError, traerTodo } from '@/lib/db'
import { supabase } from '@/lib/supabase'

/**
 * Configuracion general (solo admin; la RLS de `app_config` tambien lo exige).
 * Los correos de reporte y las notificaciones push quedan para una segunda
 * etapa (ver CLAUDE.md).
 */
export default function Configuracion() {
  const { config, cargada } = useConfig()
  const [empresa, setEmpresa] = useState('')
  const [temporada, setTemporada] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [tallas, setTallas] = useState<string[] | null>(null)
  const [guardandoTallas, setGuardandoTallas] = useState(false)

  useEffect(() => {
    if (!cargada) return
    setEmpresa(config.company_name ?? '')
    setTemporada(config.current_season ?? '')
  }, [cargada, config.company_name, config.current_season])

  // Tallas que existen en el catalogo: primero las ordenadas, despues las nuevas
  useEffect(() => {
    if (!cargada) return
    let vivo = true
    traerTodo<{ size: string }>(() => supabase.from('product_variants').select('size').order('id'))
      .then((filas) => {
        if (!vivo) return
        const existentes = [...new Set(filas.map((f) => f.size))]
        const guardado = ordenTallas().filter((t) => existentes.includes(t))
        const nuevas = existentes.filter((t) => !guardado.includes(t)).sort(compararTallas)
        setTallas([...guardado, ...nuevas])
      })
      .catch(() => vivo && setTallas([]))
    return () => {
      vivo = false
    }
  }, [cargada])

  async function guardarGeneral() {
    if (!temporada.trim()) return toast.error('La temporada actual es obligatoria.')
    setGuardando(true)
    const valores = { company_name: empresa.trim() || 'FASTRO S.A.', current_season: temporada.trim() }
    const { error } = await supabase
      .from('app_config')
      .upsert(Object.entries(valores).map(([key, value]) => ({ key, value })), { onConflict: 'key' })
    setGuardando(false)
    if (error) return toast.error(mensajeError(error, 'No se pudo guardar la configuracion.'))
    setConfigLocal(valores)
    toast.success('Configuracion guardada')
  }

  function mover(i: number, delta: -1 | 1) {
    setTallas((ts) => {
      if (!ts) return ts
      const j = i + delta
      if (j < 0 || j >= ts.length) return ts
      const copia = [...ts]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })
  }

  async function guardarTallas() {
    if (!tallas) return
    setGuardandoTallas(true)
    const { error } = await supabase
      .from('app_config')
      .upsert({ key: 'size_order', value: JSON.stringify(tallas) }, { onConflict: 'key' })
    setGuardandoTallas(false)
    if (error) return toast.error(mensajeError(error, 'No se pudo guardar el orden de tallas.'))
    await cargarConfig()
    toast.success('Orden de tallas guardado')
  }

  if (!cargada) return <Cargando />

  return (
    <div>
      <EncabezadoPagina titulo="Configuracion" descripcion="Ajustes generales del sistema." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="General">
          <div className="space-y-4">
            <Field label="Nombre de la empresa">
              <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
            </Field>
            <Field
              label="Temporada actual *"
              hint="Es la temporada por defecto de los pedidos y productos nuevos, y la que miran el dashboard y los reportes por vendedor y proveedor."
            >
              <Input value={temporada} onChange={(e) => setTemporada(e.target.value)} placeholder="Verano 2026" />
            </Field>
            <Button onClick={guardarGeneral} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Orden de tallas">
          <p className="mb-3 text-xs text-muted-foreground">
            Es el orden en que se muestran las tallas en pedidos, productos y reportes. Las tallas nuevas aparecen al
            final.
          </p>
          {tallas === null ? (
            <Cargando />
          ) : tallas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavia no hay tallas cargadas en los productos.</p>
          ) : (
            <>
              <ul className="mb-4 max-h-80 divide-y divide-border overflow-auto rounded-md border border-border">
                {tallas.map((t, i) => (
                  <li key={t} className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <span>
                      <span className="mr-3 inline-block w-6 text-xs text-muted-foreground">{i + 1}</span>
                      {t}
                    </span>
                    <span className="flex gap-1">
                      <Button variant="ghost" size="icon" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Bajar" disabled={i === tallas.length - 1} onClick={() => mover(i, 1)}>
                        <ArrowDown />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              <Button onClick={guardarTallas} disabled={guardandoTallas}>
                {guardandoTallas ? 'Guardando…' : 'Guardar orden'}
              </Button>
            </>
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
