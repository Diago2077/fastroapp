import type { PermisoKey, Permisos } from '@/lib/database.types'

const FILAS: { modulo: string; ver?: PermisoKey; crear?: PermisoKey; editar?: PermisoKey; borrar?: PermisoKey }[] = [
  { modulo: 'Pedidos', ver: 'can_view_orders', crear: 'can_create_orders', editar: 'can_edit_orders', borrar: 'can_delete_orders' },
  { modulo: 'Clientes', ver: 'can_view_clients', crear: 'can_create_clients', editar: 'can_edit_clients', borrar: 'can_delete_clients' },
  { modulo: 'Productos', ver: 'can_view_products', crear: 'can_create_products', editar: 'can_edit_products', borrar: 'can_delete_products' },
  { modulo: 'Marcas', ver: 'can_view_brands', crear: 'can_create_brands', editar: 'can_edit_brands', borrar: 'can_delete_brands' },
  { modulo: 'Proveedores', ver: 'can_view_providers', crear: 'can_create_providers', editar: 'can_edit_providers', borrar: 'can_delete_providers' },
  { modulo: 'Reportes', ver: 'can_view_reports' },
]

/**
 * Permisos por modulo (ver / crear / editar / borrar) y los dos permisos
 * sueltos: ver costos y exportar a Excel. No se muestra para un admin, que
 * los tiene todos.
 */
export function MatrizPermisos({
  valor,
  onChange,
}: {
  valor: Permisos
  onChange: (valor: Permisos) => void
}) {
  const alternar = (k: PermisoKey) => onChange({ ...valor, [k]: !valor[k] })

  const celda = (k?: PermisoKey) =>
    k ? (
      <input
        type="checkbox"
        checked={valor[k]}
        onChange={() => alternar(k)}
        className="size-4 accent-[var(--primary)]"
        aria-label={k}
      />
    ) : (
      <span className="text-muted-foreground">—</span>
    )

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Modulo</th>
              <th className="px-3 py-2 text-center font-medium">Ver</th>
              <th className="px-3 py-2 text-center font-medium">Crear</th>
              <th className="px-3 py-2 text-center font-medium">Editar</th>
              <th className="px-3 py-2 text-center font-medium">Borrar</th>
            </tr>
          </thead>
          <tbody>
            {FILAS.map((f) => (
              <tr key={f.modulo} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{f.modulo}</td>
                <td className="px-3 py-2 text-center">{celda(f.ver)}</td>
                <td className="px-3 py-2 text-center">{celda(f.crear)}</td>
                <td className="px-3 py-2 text-center">{celda(f.editar)}</td>
                <td className="px-3 py-2 text-center">{celda(f.borrar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={valor.can_see_cost} onChange={() => alternar('can_see_cost')} className="size-4 accent-[var(--primary)]" />
        Puede ver precios de costo
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={valor.can_export_excel} onChange={() => alternar('can_export_excel')} className="size-4 accent-[var(--primary)]" />
        Puede exportar a Excel
      </label>
    </div>
  )
}
