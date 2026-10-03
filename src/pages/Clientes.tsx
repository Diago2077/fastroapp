import { FileDown, FileSpreadsheet, Plus, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Field, Input } from '@/components/ui/field'
import { FiltroMulti } from '@/components/ui/filtro-multi'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { Buscador, EncabezadoPagina } from '@/components/ui/pagina'
import { Tabla, type ColumnaTabla } from '@/components/ui/tabla'
import { usePermisos } from '@/hooks/usePermisos'
import { mensajeError, traerTodo } from '@/lib/db'
import type { Cliente } from '@/lib/database.types'
import { descargarPlantilla, exportarExcel, exportarPDF, leerHoja, type Columna } from '@/lib/exportar'
import { normalizar } from '@/lib/format'
import { campo, indexarFila } from '@/lib/importar'
import { supabase } from '@/lib/supabase'

const COLUMNAS_EXPORT: Columna<Cliente>[] = [
  { header: 'Codigo', valor: (c) => c.code ?? '' , ancho: 10 },
  { header: 'Nombre', valor: (c) => c.name, ancho: 32 },
  { header: 'Tienda', valor: (c) => c.store_name ?? '', ancho: 26 },
  { header: 'RUC', valor: (c) => c.ruc ?? '', ancho: 16 },
  { header: 'Telefono', valor: (c) => c.phone ?? '', ancho: 16 },
  { header: 'Ciudad', valor: (c) => c.city ?? '', ancho: 18 },
  { header: 'Email', valor: (c) => c.email ?? '', ancho: 26 },
]

export default function Clientes() {
  const { can } = usePermisos()
  const [filas, setFilas] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [ciudades, setCiudades] = useState<string[]>([])
  const [edicion, setEdicion] = useState<Cliente | 'nuevo' | null>(null)
  const [aEliminar, setAEliminar] = useState<Cliente | null>(null)
  const [importando, setImportando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setFilas(
        await traerTodo<Cliente>(() =>
          supabase
            .from('clients')
            .select('*')
            .eq('active', true)
            .order('code', { ascending: false, nullsFirst: false })
            .order('id'),
        ),
      )
      setError(null)
    } catch {
      setError('No se pudieron cargar los clientes.')
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const opcionesCiudad = useMemo(
    () =>
      [...new Set(filas.map((c) => c.city?.trim()).filter((c): c is string => Boolean(c)))]
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((c) => ({ value: c, label: c })),
    [filas],
  )

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda)
    return filas.filter((c) => {
      if (ciudades.length && !ciudades.includes(c.city?.trim() ?? '')) return false
      if (!q) return true
      return [String(c.code ?? ''), c.name, c.store_name ?? '', c.ruc ?? ''].some((t) => normalizar(t).includes(q))
    })
  }, [filas, busqueda, ciudades])

  const columnas: ColumnaTabla<Cliente>[] = [
    { id: 'code', header: 'Codigo', render: (c) => c.code ?? '—', orden: (c) => c.code },
    { id: 'name', header: 'Nombre', render: (c) => <span className="font-medium">{c.name}</span>, orden: (c) => c.name },
    { id: 'store', header: 'Tienda', render: (c) => c.store_name ?? '—', orden: (c) => c.store_name },
    { id: 'city', header: 'Ciudad', render: (c) => c.city ?? '—', orden: (c) => c.city },
  ]

  // Exporta lo que se esta viendo (filtrado), igual que Productos
  const exportar = (formato: 'pdf' | 'excel') =>
    formato === 'pdf'
      ? exportarPDF({ titulo: 'Clientes', columnas: COLUMNAS_EXPORT, filas: filtradas, archivo: 'clientes.pdf' })
      : exportarExcel({ hoja: 'Clientes', columnas: COLUMNAS_EXPORT, filas: filtradas, archivo: 'clientes.xlsx' })

  return (
    <div>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion={`${filas.length} clientes activos`}
        acciones={
          <>
            {can('can_create_clients') && (
              <Button variant="outline" size="sm" onClick={() => setImportando(true)}>
                <Upload /> Importar
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => exportar('pdf')}>
              <FileDown /> PDF
            </Button>
            {can('can_export_excel') && (
              <Button variant="outline" size="sm" onClick={() => exportar('excel')}>
                <FileSpreadsheet /> Excel
              </Button>
            )}
            {can('can_create_clients') && (
              <Button onClick={() => setEdicion('nuevo')}>
                <Plus /> Nuevo
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Buscar por codigo, nombre, tienda o RUC…" />
        <FiltroMulti label="Ciudad" opciones={opcionesCiudad} valor={ciudades} onChange={setCiudades} />
      </div>

      {cargando ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : filtradas.length === 0 ? (
        <Vacio titulo={filas.length === 0 ? 'Sin clientes' : 'Sin resultados'} />
      ) : (
        <Tabla columnas={columnas} filas={filtradas} clave={(c) => c.id} onClickFila={setEdicion} />
      )}

      <ClienteModal
        valor={edicion}
        puedeEditar={can('can_edit_clients')}
        puedeEliminar={can('can_delete_clients')}
        onCerrar={() => setEdicion(null)}
        onGuardado={() => {
          setEdicion(null)
          void cargar()
        }}
        onEliminar={(c) => {
          setEdicion(null)
          setAEliminar(c)
        }}
      />

      <ConfirmModal
        abierto={aEliminar !== null}
        titulo="Eliminar cliente"
        mensaje={
          <>
            Se va a dar de baja a <strong>{aEliminar?.name}</strong>. Sus pedidos anteriores se conservan.
          </>
        }
        onCancelar={() => setAEliminar(null)}
        onConfirmar={async () => {
          if (!aEliminar) return
          const { error: err } = await supabase.from('clients').update({ active: false }).eq('id', aEliminar.id)
          if (err) toast.error(mensajeError(err, 'No se pudo eliminar el cliente.'))
          else {
            toast.success('Cliente eliminado')
            void cargar()
          }
          setAEliminar(null)
        }}
      />

      <ImportarClientesModal
        abierto={importando}
        onCerrar={() => setImportando(false)}
        onImportado={() => {
          setImportando(false)
          void cargar()
        }}
      />
    </div>
  )
}

const VACIO = { code: '', name: '', store_name: '', ruc: '', phone: '', city: '', email: '' }

function ClienteModal({
  valor,
  puedeEditar,
  puedeEliminar,
  onCerrar,
  onGuardado,
  onEliminar,
}: {
  valor: Cliente | 'nuevo' | null
  puedeEditar: boolean
  puedeEliminar: boolean
  onCerrar: () => void
  onGuardado: () => void
  onEliminar: (c: Cliente) => void
}) {
  const existente = valor && valor !== 'nuevo' ? valor : null
  const [f, setF] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editable = valor === 'nuevo' || puedeEditar

  useEffect(() => {
    if (valor === null) return
    setF(
      existente
        ? {
            code: String(existente.code ?? ''),
            name: existente.name,
            store_name: existente.store_name ?? '',
            ruc: existente.ruc ?? '',
            phone: existente.phone ?? '',
            city: existente.city ?? '',
            email: existente.email ?? '',
          }
        : VACIO,
    )
    setError(null)
  }, [valor, existente])

  const set = (k: keyof typeof VACIO) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }))

  async function guardar() {
    const code = Number(f.code)
    if (!Number.isInteger(code) || code < 1) return setError('El codigo tiene que ser un numero entero mayor a 0.')
    if (!f.name.trim()) return setError('Ingresa el nombre.')
    setGuardando(true)
    const datos = {
      code,
      name: f.name.trim(),
      store_name: f.store_name.trim() || null,
      ruc: f.ruc.trim() || null,
      phone: f.phone.trim() || null,
      city: f.city.trim() || null,
      email: f.email.trim() || null,
    }
    const { error: err } = existente
      ? await supabase.from('clients').update(datos).eq('id', existente.id)
      : await supabase.from('clients').insert(datos)
    setGuardando(false)
    if (err) {
      return setError(err.code === '23505' ? `El codigo ${code} ya esta en uso.` : mensajeError(err, 'No se pudo guardar el cliente.'))
    }
    toast.success(existente ? 'Cliente actualizado' : 'Cliente creado')
    onGuardado()
  }

  return (
    <Modal
      abierto={valor !== null}
      titulo={existente ? `Cliente — ${existente.name}` : 'Nuevo cliente'}
      onCerrar={onCerrar}
      footer={
        <>
          {existente && puedeEliminar && (
            <Button variant="outline" className="mr-auto" onClick={() => onEliminar(existente)}>
              <Trash2 className="text-destructive" /> Eliminar
            </Button>
          )}
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cerrar
          </Button>
          {editable && (
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Codigo *">
          <Input type="number" min={1} value={f.code} onChange={set('code')} disabled={!editable} autoFocus />
        </Field>
        <Field label="Nombre *">
          <Input value={f.name} onChange={set('name')} disabled={!editable} />
        </Field>
        <Field label="Tienda">
          <Input value={f.store_name} onChange={set('store_name')} disabled={!editable} />
        </Field>
        <Field label="RUC">
          <Input value={f.ruc} onChange={set('ruc')} disabled={!editable} />
        </Field>
        <Field label="Telefono">
          <Input value={f.phone} onChange={set('phone')} disabled={!editable} />
        </Field>
        <Field label="Ciudad">
          <Input value={f.city} onChange={set('city')} disabled={!editable} />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <Input type="email" value={f.email} onChange={set('email')} disabled={!editable} />
        </Field>
      </div>
      {error && (
        <div className="mt-4">
          <ErrorBox mensaje={error} />
        </div>
      )}
    </Modal>
  )
}

interface FilaImport {
  code: number
  name: string
  store_name: string | null
  ruc: string | null
  phone: string | null
  city: string | null
  email: string | null
}

function ImportarClientesModal({
  abierto,
  onCerrar,
  onImportado,
}: {
  abierto: boolean
  onCerrar: () => void
  onImportado: () => void
}) {
  const [filas, setFilas] = useState<FilaImport[]>([])
  const [omitidas, setOmitidas] = useState(0)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!abierto) return
    setFilas([])
    setOmitidas(0)
    setError(null)
  }, [abierto])

  async function leer(archivo: File) {
    setLeyendo(true)
    setError(null)
    try {
      const crudas = await leerHoja(archivo)
      const validas: FilaImport[] = []
      const vistos = new Set<number>()
      let descartadas = 0
      for (const cruda of crudas) {
        const r = indexarFila(cruda)
        const code = Number(campo(r, ['codigo', 'cod', 'nro', 'numero', 'id']))
        const name = campo(r, ['nombre', 'cliente', 'razon social'])
        if (!Number.isInteger(code) || code < 1 || !name || vistos.has(code)) {
          descartadas++
          continue
        }
        vistos.add(code)
        validas.push({
          code,
          name,
          store_name: campo(r, ['tienda', 'local', 'negocio']) || null,
          ruc: campo(r, ['ruc', 'cedula', 'ci', 'documento']) || null,
          phone: campo(r, ['telefono', 'celular', 'tel', 'movil']) || null,
          city: campo(r, ['ciudad', 'localidad']) || null,
          email: campo(r, ['correo', 'email', 'mail']) || null,
        })
      }
      setFilas(validas)
      setOmitidas(descartadas)
      if (validas.length === 0) setError('No se encontro ninguna fila valida (hace falta Codigo y Nombre).')
    } catch {
      setError('No se pudo leer el archivo.')
    }
    setLeyendo(false)
  }

  async function importar() {
    setGuardando(true)
    setError(null)
    try {
      // Se cruza contra TODOS los clientes (activos o no): un codigo dado de
      // baja se reactiva en vez de chocar con el indice unico.
      const existentes = await traerTodo<{ id: string; code: number | null }>(() =>
        supabase.from('clients').select('id, code').not('code', 'is', null).order('id'),
      )
      const idPorCodigo = new Map(existentes.map((e) => [e.code, e.id]))
      const nuevos = filas.filter((f) => !idPorCodigo.has(f.code)).map((f) => ({ ...f, active: true }))
      const actualizar = filas.filter((f) => idPorCodigo.has(f.code)).map((f) => ({ ...f, id: idPorCodigo.get(f.code)!, active: true }))

      if (actualizar.length) {
        const { error: err } = await supabase.from('clients').upsert(actualizar, { onConflict: 'id' })
        if (err) throw err
      }
      if (nuevos.length) {
        const { error: err } = await supabase.from('clients').insert(nuevos)
        if (err) throw err
      }
      toast.success(`Importados: ${nuevos.length} nuevos, ${actualizar.length} actualizados`)
      onImportado()
    } catch (e) {
      setError(mensajeError(e as { message: string; code?: string }, 'No se pudo importar el archivo.'))
    }
    setGuardando(false)
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Importar clientes"
      descripcion="Excel o CSV con columnas Codigo y Nombre (obligatorias), Tienda, RUC, Telefono, Ciudad y Email."
      onCerrar={onCerrar}
      ancho="max-w-2xl"
      footer={
        <>
          <Button
            variant="outline"
            className="mr-auto"
            onClick={() =>
              descargarPlantilla(
                'plantilla-clientes.xlsx',
                ['Codigo', 'Nombre', 'Tienda', 'RUC', 'Telefono', 'Ciudad', 'Email'],
                [[101, 'Juan Perez', 'Tienda Centro', '1234567-8', '0981 123 456', 'Asuncion', 'juan@ejemplo.com']],
              )
            }
          >
            Descargar plantilla
          </Button>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={guardando || filas.length === 0}>
            {guardando ? 'Importando…' : `Importar ${filas.length || ''}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f) void leer(f)
          }}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 text-sm text-muted-foreground hover:bg-accent/40"
        >
          <Upload className="size-5" />
          {leyendo ? 'Leyendo…' : 'Toca para elegir un archivo o arrastralo aca'}
        </button>

        {filas.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              {filas.length} clientes listos para importar
              {omitidas > 0 && ` · ${omitidas} filas omitidas (sin codigo/nombre o codigo repetido)`}. Los codigos que
              ya existen se actualizan. Vista previa de las primeras 50:
            </p>
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-1.5">Codigo</th>
                    <th className="px-3 py-1.5">Nombre</th>
                    <th className="px-3 py-1.5">Tienda</th>
                    <th className="px-3 py-1.5">Ciudad</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, 50).map((f) => (
                    <tr key={f.code} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5">{f.code}</td>
                      <td className="px-3 py-1.5">{f.name}</td>
                      <td className="px-3 py-1.5">{f.store_name ?? ''}</td>
                      <td className="px-3 py-1.5">{f.city ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
