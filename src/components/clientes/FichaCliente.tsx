import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input, Select } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { usePermisos } from '@/hooks/usePermisos'
import { mensajeError } from '@/lib/db'
import { PedidoModal } from '@/components/pedidos/PedidoModal'
import { ESTADO_LABEL, type Cliente, type EstadoPedido } from '@/lib/database.types'
import { formatFecha, formatGs, totalesPedido } from '@/lib/format'
import { TONO_ESTADO } from '@/lib/pedidos'
import { supabase } from '@/lib/supabase'

/**
 * Ficha de un cliente: al abrir uno existente muestra el detalle (solo lectura)
 * y desde ahi se pasa a editarlo; uno nuevo abre directo el formulario. La usan
 * Clientes e Inicio ("Clientes sin pedidos"). `onGuardado` se llama despues de
 * guardar y la ficha se cierra.
 */
export function FichaCliente({
  valor,
  onCerrar,
  onGuardado,
}: {
  valor: Cliente | 'nuevo' | null
  onCerrar: () => void
  onGuardado: () => void
}) {
  const { can } = usePermisos()
  const [editando, setEditando] = useState(false)
  const [pedido, setPedido] = useState<{ id: string | null; duplicarDe?: string } | null>(null)
  /** Sube cuando se toca un pedido, para que el resumen se vuelva a leer. */
  const [version, setVersion] = useState(0)

  useEffect(() => {
    setEditando(valor === 'nuevo')
    setPedido(null)
  }, [valor])

  const existente = valor && valor !== 'nuevo' ? valor : null
  return (
    <>
      <DetalleClienteModal
        cliente={existente && !editando ? existente : null}
        puedeEditar={can('can_edit_clients')}
        version={version}
        onAbrirPedido={(id) => setPedido({ id })}
        onEditar={() => setEditando(true)}
        onCerrar={onCerrar}
      />
      <PedidoModal
        abierto={pedido !== null}
        pedidoId={pedido?.id ?? null}
        duplicarDe={pedido?.duplicarDe ?? null}
        onDuplicar={(id) => setPedido({ id: null, duplicarDe: id })}
        onCerrar={() => setPedido(null)}
        onCambio={() => setVersion((v) => v + 1)}
      />
      <EditarClienteModal
        valor={editando ? valor : null}
        puedeEditar={can('can_edit_clients')}
        onCerrar={() => (existente ? setEditando(false) : onCerrar())}
        onGuardado={onGuardado}
      />
    </>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <div className="break-words text-sm text-foreground">{children}</div>
    </div>
  )
}

interface PedidoResumen {
  id: string
  order_number: string
  season: string | null
  status: EstadoPedido
  created_at: string
  discount_pct: number | null
  order_items: { quantity: number; unit_sale_price: number }[]
}

/**
 * Resumen de los pedidos del cliente: totales (sin cancelados), ultimo pedido y
 * la lista de pedidos; tocar uno lo abre. La RLS limita a un usuario normal a
 * sus propios pedidos, por eso en ese caso el titulo aclara "tuyos".
 * `version` cambia cuando se modifico un pedido y hay que volver a leer.
 */
function ResumenPedidos({
  clienteId,
  soloMios,
  version,
  onAbrirPedido,
}: {
  clienteId: string
  soloMios: boolean
  version: number
  onAbrirPedido: (id: string) => void
}) {
  const [pedidos, setPedidos] = useState<PedidoResumen[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    setError(false)
    void supabase
      .from('orders')
      .select('id, order_number, season, status, created_at, discount_pct, order_items(quantity, unit_sale_price)')
      .eq('client_id', clienteId)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!vivo) return
        if (err) setError(true)
        else setPedidos((data ?? []) as PedidoResumen[])
      })
    return () => {
      vivo = false
    }
  }, [clienteId, version])

  // Al cambiar de cliente no se muestran los pedidos del anterior
  useEffect(() => setPedidos(null), [clienteId])

  const titulo = soloMios ? 'Resumen de tus pedidos' : 'Resumen de pedidos'
  const ok = (pedidos ?? []).filter((p) => p.status !== 'cancelled')
  const ventaDe = (p: PedidoResumen) => totalesPedido(p.order_items, p.discount_pct ?? 0).total
  const unidadesDe = (p: PedidoResumen) => p.order_items.reduce((n, i) => n + i.quantity, 0)
  const ultimo = ok[0]?.created_at

  return (
    <div className="border-t border-border pt-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{titulo}</h3>
      {error ? (
        <p className="text-sm text-muted-foreground">No se pudieron cargar los pedidos.</p>
      ) : pedidos === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : pedidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavia no tiene pedidos.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Dato etiqueta="Pedidos">{ok.length}</Dato>
            <Dato etiqueta="Ventas">
              <span className="tabular">{formatGs(ok.reduce((n, p) => n + ventaDe(p), 0))}</span>
            </Dato>
            <Dato etiqueta="Ultimo pedido">{ultimo ? formatFecha(ultimo) : '—'}</Dato>
          </div>
          <div className="max-h-[13.7rem] overflow-auto rounded-md border border-border">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">N° Pedido</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Temporada</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 text-center font-medium">Unid.</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onAbrirPedido(p.id)}
                    title="Tocar para ver el pedido"
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-accent"
                  >
                    <td className="px-3 py-2 font-medium">{p.order_number}</td>
                    <td className="px-3 py-2">{formatFecha(p.created_at)}</td>
                    <td className="px-3 py-2">{p.season ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Badge tono={TONO_ESTADO[p.status]}>{ESTADO_LABEL[p.status]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-center tabular">{unidadesDe(p)}</td>
                    <td className="px-3 py-2 text-right tabular">{formatGs(ventaDe(p))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DetalleClienteModal({
  cliente,
  puedeEditar,
  version,
  onAbrirPedido,
  onEditar,
  onCerrar,
}: {
  cliente: Cliente | null
  puedeEditar: boolean
  version: number
  onAbrirPedido: (id: string) => void
  onEditar: () => void
  onCerrar: () => void
}) {
  // Se recuerda el ultimo cliente para que el contenido no desaparezca durante la animacion de cierre
  const [ultimo, setUltimo] = useState<Cliente | null>(null)
  useEffect(() => {
    if (cliente) setUltimo(cliente)
  }, [cliente])
  const c = cliente ?? ultimo
  const { can, esAdmin } = usePermisos()
  const vacio = <span className="text-muted-foreground">—</span>

  return (
    <Modal
      abierto={cliente !== null}
      titulo={c?.name ?? ''}
      tituloExtra={
        c && (
          <span className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
            <Badge tono={c.active ? 'success' : 'neutral'}>{c.active ? 'Activo' : 'Inactivo'}</Badge>
            <span>Registrado {formatFecha(c.created_at)}</span>
          </span>
        )
      }
      onCerrar={onCerrar}
      ancho="max-w-5xl"
      footer={
        <>
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
          {puedeEditar && (
            <Button onClick={onEditar}>
              <Pencil /> Editar
            </Button>
          )}
        </>
      }
    >
      {c && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <Dato etiqueta="Codigo">{c.code ?? vacio}</Dato>
          <Dato etiqueta="Tienda">{c.store_name || vacio}</Dato>
          <Dato etiqueta="RUC">{c.ruc || vacio}</Dato>
          <Dato etiqueta="Ciudad">{c.city || vacio}</Dato>
          <Dato etiqueta="Telefono">
            {c.phone ? (
              <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="text-primary hover:underline">
                {c.phone}
              </a>
            ) : (
              vacio
            )}
          </Dato>
          <Dato etiqueta="Email">
            {c.email ? (
              <a href={`mailto:${c.email}`} className="text-primary hover:underline">
                {c.email}
              </a>
            ) : (
              vacio
            )}
          </Dato>
        </div>
      )}
      {c && can('can_view_orders') && (
        <div className="mt-4">
          <ResumenPedidos clienteId={c.id} soloMios={!esAdmin} version={version} onAbrirPedido={onAbrirPedido} />
        </div>
      )}
    </Modal>
  )
}

const VACIO = { code: '', name: '', store_name: '', ruc: '', phone: '', city: '', email: '' }

function EditarClienteModal({
  valor,
  puedeEditar,
  onCerrar,
  onGuardado,
}: {
  valor: Cliente | 'nuevo' | null
  puedeEditar: boolean
  onCerrar: () => void
  onGuardado: () => void
}) {
  const existente = valor && valor !== 'nuevo' ? valor : null
  const [f, setF] = useState(VACIO)
  const [activo, setActivo] = useState(true)
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
    setActivo(existente?.active ?? true)
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
      active: activo,
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
      titulo={existente ? `Editar cliente — ${existente.name}` : 'Nuevo cliente'}
      onCerrar={onCerrar}
      footer={
        <>
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
        <Field label="Email">
          <Input type="email" value={f.email} onChange={set('email')} disabled={!editable} />
        </Field>
        <Field label="Estado">
          <Select value={activo ? 'activo' : 'inactivo'} onChange={(e) => setActivo(e.target.value === 'activo')} disabled={!editable}>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </Select>
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
