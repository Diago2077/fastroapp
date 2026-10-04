-- ─────────────────────────────────────────────────────────────
-- Permisos propios para Marcas (ver / crear / editar / borrar).
--
-- Hasta ahora la vista Marcas usaba los permisos de productos. Cada persona
-- arranca con lo que ya tenia en productos (no cambia el acceso de nadie); a
-- los usuarios nuevos les toca el mismo default que productos.
-- ─────────────────────────────────────────────────────────────

alter table usuarios
  add column if not exists can_view_brands   boolean not null default true,
  add column if not exists can_create_brands boolean not null default false,
  add column if not exists can_edit_brands   boolean not null default false,
  add column if not exists can_delete_brands boolean not null default false;

-- Copia unica de lo que cada uno tenia en productos
update usuarios set
  can_view_brands   = can_view_products,
  can_create_brands = can_create_products,
  can_edit_brands   = can_edit_products,
  can_delete_brands = can_delete_products;

grant update (can_view_brands, can_create_brands, can_edit_brands, can_delete_brands)
  on table usuarios to authenticated;

drop policy if exists "Crear" on brands;
drop policy if exists "Editar" on brands;
create policy "Crear" on brands for insert to authenticated
  with check (private.puede('can_create_brands'));
-- Borrar es una baja logica (update active = false)
create policy "Editar" on brands for update to authenticated
  using (private.puede('can_edit_brands') or private.puede('can_delete_brands'))
  with check (private.puede('can_edit_brands') or private.puede('can_delete_brands'));

-- Renombrar una marca renombra sus productos aunque quien la edita no tenga
-- permiso sobre productos: la propagacion corre con los derechos del dueño
create or replace function public.brands_renombrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update products set brand = new.name where brand = old.name;
  end if;
  return new;
end;
$$;

revoke execute on function public.brands_renombrar() from public, anon, authenticated;
