import { FileDown, FileSpreadsheet, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Field, Input } from '@/components/ui/field'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { Buscador, EncabezadoPagina } from '@/components/ui/pagina'
import { PanelFiltros } from '@/components/ui/panel-filtros'
import { Tabla, type ColumnaTabla } from '@/components/ui/tabla'
import { usePermisos } from '@/hooks/usePermisos'
import { mensajeError, traerTodo } from '@/lib/db'
import type { Marca } from '@/lib/database.types'
import { exportarExcel, exportarPDF, type Columna } from '@/lib/exportar'
import { formatFecha, normalizar } from '@/lib/format'
import { supabase } from '@/lib/supabase'

const COLUMNAS_EXPORT: Columna<Marca>[] = [
  { header: 'Nombre', valor: (m) => m.name, ancho: 40 },
  { header: 'Fecha de registro', valor: (m) => formatFecha(m.created_at) },
]

/**
 * Catalogo de marcas. La importacion de productos solo acepta marcas
 * registradas aca.
 */
export default function Marcas() {
  const { can } = usePermisos()
  const [filas, setFilas] = useState<Marca[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [edicion, setEdicion] = useState<Marca | 'nueva' | null>(null)
  const [aEliminar, setAEliminar] = useState<Marca | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setFilas(
        await traerTodo<Marca>(() => supabase.from('brands').select('*').eq('active', true).order('name').order('id')),
      )
      setError(null)
    } catch {
      setError('No se pudieron cargar las marcas.')
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda)
    return q ? filas.filter((m) => normalizar(m.name).includes(q)) : filas
  }, [filas, busqueda])

  const columnas: ColumnaTabla<Marca>[] = [
    { id: 'name', header: 'Nombre', render: (m) => <span className="font-medium">{m.name}</span>, orden: (m) => m.name },
    { id: 'created', header: 'Fecha de registro', render: (m) => formatFecha(m.created_at), orden: (m) => m.created_at },
  ]

  return (
    <div>
      <EncabezadoPagina
        titulo="Marcas"
        descripcion="Las marcas de los productos. Para importar productos, la marca tiene que estar registrada aca."
        buscador={
          <Buscador
            valor={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar marca…"
            accion={
              <PanelFiltros
                soloIcono
                activos={0}
                acciones={
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Exportar lo que se ve</p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={filtradas.length === 0}
                        onClick={() => exportarPDF({ titulo: 'Marcas', columnas: COLUMNAS_EXPORT, filas: filtradas, archivo: 'marcas.pdf' })}
                      >
                        <FileDown /> PDF
                      </Button>
                      {can('can_export_excel') && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={filtradas.length === 0}
                          onClick={() => exportarExcel({ hoja: 'Marcas', columnas: COLUMNAS_EXPORT, filas: filtradas, archivo: 'marcas.xlsx' })}
                        >
                          <FileSpreadsheet /> Excel
                        </Button>
                      )}
                    </div>
                  </div>
                }
              />
            }
          />
        }
        acciones={
          <>
            {can('can_create_brands') && (
              <Button onClick={() => setEdicion('nueva')}>
                <Plus /> Nuevo
              </Button>
            )}
          </>
        }
      />

      {cargando ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : filtradas.length === 0 ? (
        <Vacio titulo={filas.length === 0 ? 'Sin marcas' : 'Sin resultados'} />
      ) : (
        <Tabla ajustarAPantalla columnas={columnas} filas={filtradas} clave={(m) => m.id} onClickFila={setEdicion} ordenInicial={{ id: 'name', desc: false }} />
      )}

      <MarcaModal
        valor={edicion}
        puedeEditar={can('can_edit_brands')}
        puedeEliminar={can('can_delete_brands')}
        onCerrar={() => setEdicion(null)}
        onGuardado={() => {
          setEdicion(null)
          void cargar()
        }}
        onEliminar={(m) => {
          setEdicion(null)
          setAEliminar(m)
        }}
      />

      <ConfirmModal
        abierto={aEliminar !== null}
        titulo="Eliminar marca"
        mensaje={
          <>
            Se va a dar de baja a <strong>{aEliminar?.name}</strong>. Los productos que ya la usan no se tocan, pero no se
            va a poder usar en productos nuevos ni en importaciones.
          </>
        }
        onCancelar={() => setAEliminar(null)}
        onConfirmar={async () => {
          if (!aEliminar) return
          const { error: err } = await supabase.from('brands').update({ active: false }).eq('id', aEliminar.id)
          if (err) toast.error(mensajeError(err, 'No se pudo eliminar la marca.'))
          else {
            toast.success('Marca eliminada')
            void cargar()
          }
          setAEliminar(null)
        }}
      />
    </div>
  )
}

function MarcaModal({
  valor,
  puedeEditar,
  puedeEliminar,
  onCerrar,
  onGuardado,
  onEliminar,
}: {
  valor: Marca | 'nueva' | null
  puedeEditar: boolean
  puedeEliminar: boolean
  onCerrar: () => void
  onGuardado: () => void
  onEliminar: (m: Marca) => void
}) {
  const existente = valor && valor !== 'nueva' ? valor : null
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editable = valor === 'nueva' || puedeEditar

  useEffect(() => {
    if (valor === null) return
    setNombre(existente?.name ?? '')
    setError(null)
  }, [valor, existente])

  async function guardar() {
    if (!nombre.trim()) return setError('Ingresa el nombre.')
    setGuardando(true)
    const datos = { name: nombre.trim() }
    const { error: err } = existente
      ? await supabase.from('brands').update(datos).eq('id', existente.id)
      : await supabase.from('brands').insert(datos)
    setGuardando(false)
    if (err) {
      return setError(
        err.code === '23505'
          ? 'Ya existe una marca con ese nombre (puede estar dada de baja).'
          : mensajeError(err, 'No se pudo guardar la marca.'),
      )
    }
    toast.success(existente ? 'Marca actualizada' : 'Marca creada')
    onGuardado()
  }

  return (
    <Modal
      abierto={valor !== null}
      titulo={existente ? 'Marca' : 'Nueva marca'}
      onCerrar={onCerrar}
      ancho="max-w-sm"
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
      <div className="space-y-4">
        <Field
          label="Nombre *"
          warning={existente && editable ? 'Si la renombras, tambien cambia en todos sus productos.' : undefined}
        >
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={!editable} autoFocus />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
