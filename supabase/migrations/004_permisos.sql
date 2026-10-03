-- ═══════════════════════════════════════════════════════════════════════════
-- 004_permisos.sql — Permisos finos por modulo (FASTRO)
--
-- Sobre los dos roles de la base (admin / usuario) se suman los permisos que
-- un admin configura por persona desde /usuarios: ver / crear / editar /
-- borrar por modulo, ver costos y exportar a Excel. Un admin activo tiene
-- todos, sin importar lo que digan las columnas.
--
-- Los defaults son los mismos de la app anterior (tabla `profiles`).
-- ═══════════════════════════════════════════════════════════════════════════

alter table usuarios
  add column if not exists can_see_cost         boolean not null default false,
  add column if not exists can_export_excel     boolean not null default false,
  add column if not exists can_view_dashboard   boolean not null default true,
  add column if not exists can_view_orders      boolean not null default true,
  add column if not exists can_create_orders    boolean not null default true,
  add column if not exists can_edit_orders      boolean not null default true,
  add column if not exists can_delete_orders    boolean not null default true,
  add column if not exists can_view_clients     boolean not null default false,
  add column if not exists can_create_clients   boolean not null default false,
  add column if not exists can_edit_clients     boolean not null default false,
  add column if not exists can_delete_clients   boolean not null default false,
  add column if not exists can_view_products    boolean not null default true,
  add column if not exists can_create_products  boolean not null default false,
  add column if not exists can_edit_products    boolean not null default false,
  add column if not exists can_delete_products  boolean not null default false,
  add column if not exists can_view_providers   boolean not null default true,
  add column if not exists can_create_providers boolean not null default true,
  add column if not exists can_edit_providers   boolean not null default true,
  add column if not exists can_delete_providers boolean not null default true,
  add column if not exists can_view_reports     boolean not null default true;

-- Desde el navegador solo un admin puede tocar estas columnas (la policy de
-- update ya exige es_admin); sin el grant por columna, el update falla.
grant update (
  can_see_cost, can_export_excel, can_view_dashboard,
  can_view_orders, can_create_orders, can_edit_orders, can_delete_orders,
  can_view_clients, can_create_clients, can_edit_clients, can_delete_clients,
  can_view_products, can_create_products, can_edit_products, can_delete_products,
  can_view_providers, can_create_providers, can_edit_providers, can_delete_providers,
  can_view_reports
) on table usuarios to authenticated;

-- ─────────────────────────────────────────────────────────────
-- private.puede('can_edit_clients') — ¿quien llama tiene ese permiso?
--
-- Igual que es_admin(): security definer para leer `usuarios` salteando su
-- RLS, y en `private` para que PostgREST no lo exponga como RPC. Una cuenta
-- desactivada no puede nada. El nombre del permiso es siempre una constante
-- escrita en una policy, nunca algo que llegue del cliente.
-- ─────────────────────────────────────────────────────────────
create or replace function private.puede(permiso text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select u.activo and (u.rol = 'admin' or coalesce((to_jsonb(u) ->> permiso)::boolean, false))
      from usuarios u
      where u.id = (select auth.uid())
    ),
    false
  )
$$;

revoke execute on function private.puede(text) from public, anon;
grant execute on function private.puede(text) to authenticated;
