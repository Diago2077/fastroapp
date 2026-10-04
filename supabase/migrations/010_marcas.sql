-- ─────────────────────────────────────────────────────────────
-- Marcas: catalogo propio (vista "Marcas").
--
-- `products.brand` sigue siendo el nombre en texto (filtros, exportes y
-- reportes no cambian); este catalogo dice cuales marcas existen. La
-- importacion de productos exige que la marca este registrada aca.
-- Los permisos son los de productos (ver / crear / editar / eliminar).
-- ─────────────────────────────────────────────────────────────

create table if not exists brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Una marca por nombre, sin distinguir mayusculas ni espacios de los bordes
-- (incluye las dadas de baja: reactivarla en vez de crear otra)
create unique index if not exists brands_name_key on brands (lower(btrim(name)));

-- Siembra con las marcas que ya usan los productos
insert into brands (name)
select distinct on (lower(btrim(brand))) btrim(brand)
from products
where brand is not null and btrim(brand) <> ''
order by lower(btrim(brand)), btrim(brand)
on conflict do nothing;

drop trigger if exists brands_updated_at on brands;
create trigger brands_updated_at before update on brands
  for each row execute function public.set_updated_at();

-- Renombrar una marca la renombra tambien en sus productos
create or replace function public.brands_renombrar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update products set brand = new.name where brand = old.name;
  end if;
  return new;
end;
$$;

drop trigger if exists brands_renombrar on brands;
create trigger brands_renombrar after update of name on brands
  for each row execute function public.brands_renombrar();

alter table brands enable row level security;

drop policy if exists "Leer" on brands;
drop policy if exists "Crear" on brands;
drop policy if exists "Editar" on brands;
create policy "Leer" on brands for select to authenticated using (private.esta_activo());
create policy "Crear" on brands for insert to authenticated
  with check (private.puede('can_create_products'));
-- Borrar es una baja logica (update active = false)
create policy "Editar" on brands for update to authenticated
  using (private.puede('can_edit_products') or private.puede('can_delete_products'))
  with check (private.puede('can_edit_products') or private.puede('can_delete_products'));

revoke all on table brands from anon, authenticated;
grant select, insert, update on table brands to authenticated;
