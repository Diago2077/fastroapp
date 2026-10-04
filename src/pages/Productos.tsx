import { FileDown, FileSpreadsheet, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ImportarProductosModal } from '@/components/productos/ImportarProductosModal'
import { ProductoForm } from '@/components/productos/ProductoForm'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { ConfirmModal, Modal } from '@/components/ui/modal'
import { Buscador, EncabezadoPagina } from '@/components/ui/pagina'
import { ListaFiltro, PanelFiltros } from '@/components/ui/panel-filtros'
import { Tabla, type ColumnaTabla } from '@/components/ui/tabla'
import { usePermisos } from '@/hooks/usePermisos'
import { compararTallas, ordenarTallas } from '@/lib/config'
import { mensajeError, traerTodo } from '@/lib/db'
import type { Producto, Proveedor, Variante } from '@/lib/database.types'
import { exportarExcel, exportarPDF, type Columna } from '@/lib/exportar'
import { formatGs, normalizar } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type VarianteLista = Pick<Variante, 'id' | 'color' | 'size' | 'sale_price'>

interface ProductoLista extends Producto {
  providers: { name: string } | null
  product_variants: VarianteLista[]
}

/** El listado tiene una fila por cada precio de venta distinto del producto. */
interface FilaPrecio {
  clave: string
  producto: ProductoLista
  precio: number | null
  tallas: string[]
}

function filasPorPrecio(productos: ProductoLista[]): FilaPrecio[] {
  return productos.flatMap((p): FilaPrecio[] => {
    if (p.product_variants.length === 0) return [{ clave: p.id, producto: p, precio: null, tallas: [] }]
    const porPrecio = new Map<number, Set<string>>()
    for (const v of p.product_variants) {
      if (!porPrecio.has(v.sale_price)) porPrecio.set(v.sale_price, new Set())
      porPrecio.get(v.sale_price)!.add(v.size)
    }
    return [...porPrecio.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([precio, tallas]) => ({
        clave: `${p.id}:${precio}`,
        producto: p,
        precio,
        tallas: ordenarTallas([...tallas]),
      }))
  })
}

const COLUMNAS_EXPORT: Columna<FilaPrecio>[] = [
  { header: 'Codigo', valor: (f) => f.producto.code, ancho: 14 },
  { header: 'Descripcion', valor: (f) => f.producto.description, ancho: 36 },
  { header: 'Marca', valor: (f) => f.producto.brand ?? '', ancho: 16 },
  { header: 'Tallas', valor: (f) => f.tallas.join(' · '), ancho: 24 },
  { header: 'Precio Venta', valor: (f) => (f.precio === null ? '' : formatGs(f.precio)), ancho: 16 },
]

export default function Productos() {
  const { can } = usePermisos()
  const [productos, setProductos] = useState<ProductoLista[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [marcas, setMarcas] = useState<string[]>([])
  const [filtroProveedores, setFiltroProveedores] = useState<string[]>([])
  const [temporadas, setTemporadas] = useState<string[]>([])

  const [detalle, setDetalle] = useState<ProductoLista | null>(null)
  const [form, setForm] = useState<{ id: string | null } | null>(null)
  const [aEliminar, setAEliminar] = useState<ProductoLista | null>(null)
  const [importando, setImportando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [prods, provs] = await Promise.all([
        traerTodo<ProductoLista>(() =>
          supabase
            .from('products')
            .select('*, providers(name), product_variants(id, color, size, sale_price)')
            .eq('active', true)
            // Mas nuevos primero; los cargados juntos (importacion) comparten fecha, ahi manda el codigo
            .order('created_at', { ascending: false })
            .order('code')
            .order('id'),
        ),
        traerTodo<Proveedor>(() => supabase.from('providers').select('*').eq('active', true).order('name').order('id')),
      ])
      setProductos(prods)
      setProveedores(provs)
      setError(null)
    } catch {
      setError('No se pudieron cargar los productos.')
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const opciones = useMemo(() => {
    const unicos = (valores: (string | null)[]) =>
      [...new Set(valores.filter((v): v is string => Boolean(v?.trim())))]
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((v) => ({ value: v, label: v }))
    return {
      marcas: unicos(productos.map((p) => p.brand)),
      temporadas: unicos(productos.map((p) => p.season)),
      proveedores: proveedores.map((p) => ({ value: p.id, label: p.name })),
    }
  }, [productos, proveedores])

  const filas = useMemo(() => {
    const q = normalizar(busqueda)
    const filtrados = productos.filter((p) => {
      if (marcas.length && !marcas.includes(p.brand ?? '')) return false
      if (filtroProveedores.length && !filtroProveedores.includes(p.provider_id ?? '')) return false
      if (temporadas.length && !temporadas.includes(p.season ?? '')) return false
      return !q || normalizar(p.code).includes(q) || normalizar(p.description).includes(q)
    })
    return filasPorPrecio(filtrados)
  }, [productos, busqueda, marcas, filtroProveedores, temporadas])

  const columnas: ColumnaTabla<FilaPrecio>[] = [
    { id: 'code', header: 'Codigo', render: (f) => <span className="font-medium">{f.producto.code}</span>, orden: (f) => f.producto.code },
    { id: 'desc', header: 'Descripcion', render: (f) => f.producto.description, orden: (f) => f.producto.description },
    { id: 'brand', header: 'Marca', render: (f) => f.producto.brand ?? '—', orden: (f) => f.producto.brand },
    { id: 'sizes', header: 'Tallas', render: (f) => f.tallas.join(' · ') || '—' },
    {
      id: 'price',
      header: 'Precio Venta',
      align: 'right',
      render: (f) => (f.precio === null ? '—' : formatGs(f.precio)),
      orden: (f) => f.precio,
    },
  ]

  return (
    <div>
      <EncabezadoPagina
        titulo="Productos"
        descripcion={`${productos.length} productos activos`}
        buscador={
          <Buscador
          valor={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por codigo o descripcion…"
          accion={
            <PanelFiltros
              soloIcono
              activos={[marcas, filtroProveedores, temporadas].filter((v) => v.length > 0).length}
              onLimpiar={() => {
                setMarcas([])
                setFiltroProveedores([])
                setTemporadas([])
              }}
              acciones={(cerrar) => (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Importar y exportar</p>
                  <div className="flex flex-wrap gap-2">
                    {can('can_create_products') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          cerrar()
                          setImportando(true)
                        }}
                      >
                        <Upload /> Importar
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filas.length === 0}
                      onClick={() => exportarPDF({ titulo: 'Productos', columnas: COLUMNAS_EXPORT, filas, archivo: 'productos.pdf' })}
                    >
                      <FileDown /> PDF
                    </Button>
                    {can('can_export_excel') && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={filas.length === 0}
                        onClick={() => exportarExcel({ hoja: 'Productos', columnas: COLUMNAS_EXPORT, filas, archivo: 'productos.xlsx' })}
                      >
                        <FileSpreadsheet /> Excel
                      </Button>
                    )}
                  </div>
                </div>
              )}
            >
              <ListaFiltro label="Marca" todas="Todas las marcas" plural="marcas" opciones={opciones.marcas} valor={marcas} onChange={setMarcas} />
              <ListaFiltro label="Proveedor" todas="Todos los proveedores" plural="proveedores" opciones={opciones.proveedores} valor={filtroProveedores} onChange={setFiltroProveedores} />
              <ListaFiltro label="Temporada" todas="Todas las temporadas" plural="temporadas" opciones={opciones.temporadas} valor={temporadas} onChange={setTemporadas} />
            </PanelFiltros>
          }
        />
        }
        acciones={
          <>
            {can('can_create_products') && (
              <Button onClick={() => setForm({ id: null })}>
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
      ) : filas.length === 0 ? (
        <Vacio titulo={productos.length === 0 ? 'Sin productos' : 'Sin resultados'} />
      ) : (
        <Tabla ajustarAPantalla columnas={columnas} filas={filas} clave={(f) => f.clave} onClickFila={(f) => setDetalle(f.producto)} />
      )}

      <DetalleProducto
        producto={detalle}
        puedeEditar={can('can_edit_products')}
        puedeEliminar={can('can_delete_products')}
        onCerrar={() => setDetalle(null)}
        onEditar={(p) => {
          setDetalle(null)
          setForm({ id: p.id })
        }}
        onEliminar={(p) => {
          setDetalle(null)
          setAEliminar(p)
        }}
      />

      <ProductoForm
        abierto={form !== null}
        productoId={form?.id ?? null}
        proveedores={proveedores}
        puedeVerCosto={can('can_see_cost')}
        onCerrar={() => setForm(null)}
        onGuardado={() => {
          setForm(null)
          void cargar()
        }}
      />

      <ImportarProductosModal
        abierto={importando}
        puedeVerCosto={can('can_see_cost')}
        onCerrar={() => setImportando(false)}
        onImportado={() => {
          setImportando(false)
          void cargar()
        }}
      />

      <ConfirmModal
        abierto={aEliminar !== null}
        titulo="Eliminar producto"
        mensaje={
          <>
            Se va a dar de baja <strong>{aEliminar?.code}</strong> — {aEliminar?.description}. Los pedidos que ya lo
            incluyen se conservan.
          </>
        }
        onCancelar={() => setAEliminar(null)}
        onConfirmar={async () => {
          if (!aEliminar) return
          const { error: err } = await supabase.from('products').update({ active: false }).eq('id', aEliminar.id)
          if (err) toast.error(mensajeError(err, 'No se pudo eliminar el producto.'))
          else {
            toast.success('Producto eliminado')
            void cargar()
          }
          setAEliminar(null)
        }}
      />
    </div>
  )
}

/** Vista de solo lectura: nunca muestra costos. */
function DetalleProducto({
  producto,
  puedeEditar,
  puedeEliminar,
  onCerrar,
  onEditar,
  onEliminar,
}: {
  producto: ProductoLista | null
  puedeEditar: boolean
  puedeEliminar: boolean
  onCerrar: () => void
  onEditar: (p: ProductoLista) => void
  onEliminar: (p: ProductoLista) => void
}) {
  if (!producto) return null
  const colores = [...new Set(producto.product_variants.map((v) => v.color))]
  const porPrecio = new Map<number, Set<string>>()
  for (const v of producto.product_variants) {
    if (!porPrecio.has(v.sale_price)) porPrecio.set(v.sale_price, new Set())
    porPrecio.get(v.sale_price)!.add(v.size)
  }

  return (
    <Modal
      abierto
      titulo={`${producto.code} — ${producto.description}`}
      onCerrar={onCerrar}
      footer={
        <>
          {puedeEliminar && (
            <Button variant="outline" className="mr-auto" onClick={() => onEliminar(producto)}>
              <Trash2 className="text-destructive" /> Eliminar
            </Button>
          )}
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
          {puedeEditar && (
            <Button onClick={() => onEditar(producto)}>
              <Pencil /> Editar
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <Dato label="Marca" valor={producto.brand} />
          <Dato label="Proveedor" valor={producto.providers?.name} />
          <Dato label="Temporada" valor={producto.season} />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Colores</p>
          <div className="flex flex-wrap gap-1.5">
            {colores.length ? (
              colores.map((c) => (
                <span key={c} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                  {c}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Tallas y precios de venta</p>
          <ul className="space-y-1">
            {[...porPrecio.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([precio, tallas]) => (
                <li key={precio} className="flex justify-between gap-4">
                  <span>{[...tallas].sort(compararTallas).join(' · ')}</span>
                  <span className="tabular font-medium">{formatGs(precio)}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}

function Dato({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-foreground">{valor || '—'}</p>
    </div>
  )
}
