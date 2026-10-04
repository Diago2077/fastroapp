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
import type { Proveedor } from '@/lib/database.types'
import { exportarExcel, exportarPDF, type Columna } from '@/lib/exportar'
import { formatFecha, normalizar } from '@/lib/format'
import { supabase } from '@/lib/supabase'

const COLUMNAS_EXPORT: Columna<Proveedor>[] = [
  { header: 'Nombre', valor: (p) => p.name, ancho: 40 },
  { header: 'Fecha de registro', valor: (p) => formatFecha(p.created_at) },
]

export default function Proveedores() {
  const { can } = usePermisos()
  const [filas, setFilas] = useState<Proveedor[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [edicion, setEdicion] = useState<Proveedor | 'nuevo' | null>(null)
  const [aEliminar, setAEliminar] = useState<Proveedor | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setFilas(
        await traerTodo<Proveedor>(() =>
          supabase.from('providers').select('*').eq('active', true).order('name').order('id'),
        ),
      )
      setError(null)
    } catch {
      setError('No se pudieron cargar los proveedores.')
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda)
    return q ? filas.filter((p) => normalizar(p.name).includes(q)) : filas
  }, [filas, busqueda])

  const columnas: ColumnaTabla<Proveedor>[] = [
    { id: 'name', header: 'Nombre', render: (p) => <span className="font-medium">{p.name}</span>, orden: (p) => p.name },
    { id: 'created', header: 'Fecha de registro', render: (p) => formatFecha(p.created_at), orden: (p) => p.created_at },
  ]

  return (
    <div>
      <EncabezadoPagina
        titulo="Proveedores"
        descripcion="Las fabricas a las que se les hacen los pedidos."
        buscador={
          <Buscador
            valor={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar proveedor…"
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
                        onClick={() =>
                          exportarPDF({ titulo: 'Proveedores', columnas: COLUMNAS_EXPORT, filas: filtradas, archivo: 'proveedores.pdf' })
                        }
                      >
                        <FileDown /> PDF
                      </Button>
                      {can('can_export_excel') && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={filtradas.length === 0}
                          onClick={() =>
                            exportarExcel({ hoja: 'Proveedores', columnas: COLUMNAS_EXPORT, filas: filtradas, archivo: 'proveedores.xlsx' })
                          }
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
            {can('can_create_providers') && (
              <Button onClick={() => setEdicion('nuevo')}>
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
        <Vacio titulo={filas.length === 0 ? 'Sin proveedores' : 'Sin resultados'} />
      ) : (
        <Tabla ajustarAPantalla columnas={columnas} filas={filtradas} clave={(p) => p.id} onClickFila={setEdicion} ordenInicial={{ id: 'name', desc: false }} />
      )}

      <ProveedorModal
        valor={edicion}
        puedeEditar={can('can_edit_providers')}
        puedeEliminar={can('can_delete_providers')}
        onCerrar={() => setEdicion(null)}
        onGuardado={() => {
          setEdicion(null)
          void cargar()
        }}
        onEliminar={(p) => {
          setEdicion(null)
          setAEliminar(p)
        }}
      />

      <ConfirmModal
        abierto={aEliminar !== null}
        titulo="Eliminar proveedor"
        mensaje={
          <>
            Se va a dar de baja a <strong>{aEliminar?.name}</strong>. Los pedidos y productos que ya lo usan no se tocan.
          </>
        }
        onCancelar={() => setAEliminar(null)}
        onConfirmar={async () => {
          if (!aEliminar) return
          const { error: err } = await supabase.from('providers').update({ active: false }).eq('id', aEliminar.id)
          if (err) toast.error(mensajeError(err, 'No se pudo eliminar el proveedor.'))
          else {
            toast.success('Proveedor eliminado')
            void cargar()
          }
          setAEliminar(null)
        }}
      />
    </div>
  )
}

function ProveedorModal({
  valor,
  puedeEditar,
  puedeEliminar,
  onCerrar,
  onGuardado,
  onEliminar,
}: {
  valor: Proveedor | 'nuevo' | null
  puedeEditar: boolean
  puedeEliminar: boolean
  onCerrar: () => void
  onGuardado: () => void
  onEliminar: (p: Proveedor) => void
}) {
  const existente = valor && valor !== 'nuevo' ? valor : null
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editable = valor === 'nuevo' || puedeEditar

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
      ? await supabase.from('providers').update(datos).eq('id', existente.id)
      : await supabase.from('providers').insert(datos)
    setGuardando(false)
    if (err) return setError(mensajeError(err, 'No se pudo guardar el proveedor.'))
    toast.success(existente ? 'Proveedor actualizado' : 'Proveedor creado')
    onGuardado()
  }

  return (
    <Modal
      abierto={valor !== null}
      titulo={existente ? 'Proveedor' : 'Nuevo proveedor'}
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
        <Field label="Nombre *">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={!editable} autoFocus />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
