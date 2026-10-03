-- ═══════════════════════════════════════════════════════════════════════════
-- 005_pedidos.sql — Dominio de FASTRO: clientes, proveedores, productos,
-- pedidos y configuracion.
--
--   clients ─┐
--   providers ─ products ─ product_variants ─ product_variant_costs (costo)
--   orders ─ order_items ─ order_item_costs (costo)
--   app_config
--
-- Los nombres de tablas y columnas son los de la app anterior, para que la
-- migracion de datos sea directa. Dos diferencias de fondo:
--
--  · El COSTO vive en tablas aparte (`*_costs`) con RLS por el permiso
--    `can_see_cost`: quien no lo tiene no recibe el costo ni por la API.
--  · Las policies hacen cumplir los permisos `can_*` en la base; la UI solo
--    esconde botones.
--
-- Que ve cada quien: todo usuario ACTIVO lee los catalogos (clientes,
-- productos, proveedores, config) porque el formulario de pedido los
-- necesita aunque no tenga el permiso de "ver" ese modulo (eso solo decide
-- si le aparece la pantalla). Los pedidos son por dueño: cada uno ve los
-- suyos y el admin todos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────────────────────────
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  code        integer,
  name        text not null,
  store_name  text,
  ruc         text,
  phone       text,
  city        text,
  email       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists clients_code_key on clients (code) where code is not null;

create table if not exists providers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists app_config (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  description text not null,
  brand       text,
  provider_id uuid references providers (id) on delete set null,
  season      text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists products_provider_idx on products (provider_id);

-- Cada combinacion color x talla con su precio de venta.
create table if not exists product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products (id) on delete cascade,
  color       text not null,
  size        text not null,
  sale_price  numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (product_id, color, size)
);

create table if not exists product_variant_costs (
  variant_id  uuid primary key references product_variants (id) on delete cascade,
  cost_price  numeric(12,2) not null default 0
);

-- Numeracion FAS-0001. En `private` para que PostgREST no la exponga.
create sequence if not exists order_number_seq start 1;

create or replace function private.next_order_number()
returns text
language plpgsql security definer set search_path = public as $$
begin
  return 'FAS-' || lpad(nextval('public.order_number_seq')::text, 4, '0');
end;
$$;
revoke execute on function private.next_order_number() from public, anon;
grant execute on function private.next_order_number() to authenticated;

create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  order_number  text unique not null default private.next_order_number(),
  client_id     uuid references clients (id) on delete set null,
  user_id       uuid references usuarios (id) on delete set null,
  provider_id   uuid references providers (id) on delete set null,
  status        text not null default 'open' check (status in ('open', 'closed', 'sent', 'cancelled')),
  season        text,
  shipping_date date,
  discount_pct  numeric(5,2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  observation   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists orders_user_idx on orders (user_id);
create index if not exists orders_client_idx on orders (client_id);
create index if not exists orders_provider_idx on orders (provider_id);
create index if not exists orders_created_idx on orders (created_at desc);

-- Items: precio de venta "congelado" al momento de pedir.
create table if not exists order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders (id) on delete cascade,
  product_variant_id  uuid references product_variants (id) on delete set null,
  quantity            integer not null check (quantity > 0),
  unit_sale_price     numeric(12,2) not null,
  created_at          timestamptz not null default now()
);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_variant_idx on order_items (product_variant_id);

-- Costo "congelado" del item. Lo escribe un trigger (no el cliente).
create table if not exists order_item_costs (
  order_item_id   uuid primary key references order_items (id) on delete cascade,
  unit_cost_price numeric(12,2) not null default 0
);

insert into app_config (key, value) values
  ('current_season', 'Verano 2026'),
  ('company_name', 'FASTRO S.A.')
on conflict (key) do nothing;

-- updated_at automatico (set_updated_at viene de 001_schema.sql)
do $$
declare t text;
begin
  foreach t in array array['clients', 'providers', 'products', 'orders', 'app_config'] loop
    execute format('drop trigger if exists %I_updated_at on %I', t, t);
    execute format(
      'create trigger %I_updated_at before update on %I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Triggers de pedidos
-- ─────────────────────────────────────────────────────────────

-- Reglas de estado y edicion, para que no dependan de la UI.
--   · Sin sesion (service_role / migraciones): sin restricciones.
--   · Admin: todo.
--   · Resto: solo toca sus pedidos (lo dice la RLS) y
--       - un pedido que no esta 'open' no se modifica (para pasarlo de
--         cerrado a enviado, reabrirlo, cancelarlo o reactivarlo hay que
--         ser admin);
--       - de 'open' solo puede pasarlo a 'closed';
--       - cambiar cliente, proveedor, temporada, descuento, envio u
--         observacion exige can_edit_orders.
create or replace function private.reglas_pedido()
returns trigger
language plpgsql set search_path = public as $$
begin
  if (select auth.uid()) is null or private.es_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'open' then
      raise exception 'Un pedido nuevo siempre arranca abierto' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status <> 'open' then
    raise exception 'Solo un administrador puede modificar un pedido %', old.status
      using errcode = '42501';
  end if;

  if new.status not in ('open', 'closed') then
    raise exception 'Solo un administrador puede cambiar el pedido a %', new.status
      using errcode = '42501';
  end if;

  if (new.client_id, new.provider_id, new.season, new.discount_pct, new.shipping_date, new.observation)
     is distinct from
     (old.client_id, old.provider_id, old.season, old.discount_pct, old.shipping_date, old.observation)
     and not private.puede('can_edit_orders') then
    raise exception 'No tenes permiso para editar pedidos' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_reglas on orders;
create trigger orders_reglas
  before insert or update on orders
  for each row execute function private.reglas_pedido();

-- El costo del item se copia de la tabla de costos al insertarlo. Es
-- security definer porque quien arma el pedido puede no tener can_see_cost
-- y aun asi el pedido tiene que guardar el costo del momento.
create or replace function private.congelar_costo()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into order_item_costs (order_item_id, unit_cost_price)
  select new.id, c.cost_price
  from product_variant_costs c
  where c.variant_id = new.product_variant_id
  on conflict (order_item_id) do nothing;
  return new;
end;
$$;

drop trigger if exists order_items_costo on order_items;
create trigger order_items_costo
  after insert on order_items
  for each row execute function private.congelar_costo();

-- ─────────────────────────────────────────────────────────────
-- RPC: guardar pedido + items en una sola transaccion.
--
-- SECURITY INVOKER: corre con el auth.uid() y la RLS de quien llama.
-- Los precios NO los manda el cliente: el de venta se toma de
-- product_variants al agregar la variante, y el costo lo congela el trigger.
-- Una variante que ya estaba en el pedido conserva su precio congelado y
-- solo cambia la cantidad (editar un pedido viejo no lo reprecia).
--
--   p_items: [{ "variant_id": uuid, "quantity": int }, ...]
-- ─────────────────────────────────────────────────────────────
create or replace function public.save_order_with_items(
  p_order_id      uuid,
  p_client_id     uuid,
  p_provider_id   uuid,
  p_season        text,
  p_discount_pct  numeric,
  p_shipping_date date,
  p_status        text,
  p_observation   text,
  p_items         jsonb
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos un item';
  end if;

  if p_order_id is null then
    if not private.puede('can_create_orders') then
      raise exception 'No tenes permiso para crear pedidos' using errcode = '42501';
    end if;
    insert into orders (client_id, provider_id, season, discount_pct, shipping_date, status, observation, user_id)
    values (p_client_id, p_provider_id, p_season, coalesce(p_discount_pct, 0), p_shipping_date,
            coalesce(p_status, 'open'), p_observation, auth.uid())
    returning id into v_order_id;
  else
    update orders set
      client_id     = p_client_id,
      provider_id   = p_provider_id,
      season        = p_season,
      discount_pct  = coalesce(p_discount_pct, 0),
      shipping_date = p_shipping_date,
      status        = coalesce(p_status, status),
      observation   = p_observation
    where id = p_order_id
    returning id into v_order_id;

    if v_order_id is null then
      raise exception 'Pedido no encontrado o sin permiso para editarlo';
    end if;
  end if;

  -- Cantidades pedidas por variante (si una variante viene repetida, se suman)
  create temporary table _items on commit drop as
    select (item ->> 'variant_id')::uuid as variant_id, sum((item ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as item
    group by 1;

  if exists (select 1 from _items where quantity <= 0 or variant_id is null) then
    raise exception 'Cantidad invalida en un item';
  end if;
  if exists (select 1 from _items i left join product_variants v on v.id = i.variant_id where v.id is null) then
    raise exception 'Una variante del pedido ya no existe';
  end if;

  delete from order_items
  where order_id = v_order_id
    and product_variant_id is not null
    and product_variant_id not in (select variant_id from _items);

  update order_items oi set quantity = i.quantity
  from _items i
  where oi.order_id = v_order_id and oi.product_variant_id = i.variant_id and oi.quantity <> i.quantity;

  insert into order_items (order_id, product_variant_id, quantity, unit_sale_price)
  select v_order_id, i.variant_id, i.quantity, v.sale_price
  from _items i
  join product_variants v on v.id = i.variant_id
  where not exists (
    select 1 from order_items oi where oi.order_id = v_order_id and oi.product_variant_id = i.variant_id
  );

  drop table _items;
  return v_order_id;
end;
$$;

revoke execute on function public.save_order_with_items(uuid, uuid, uuid, text, numeric, date, text, text, jsonb) from public, anon;
grant  execute on function public.save_order_with_items(uuid, uuid, uuid, text, numeric, date, text, text, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table clients               enable row level security;
alter table providers             enable row level security;
alter table app_config            enable row level security;
alter table products              enable row level security;
alter table product_variants      enable row level security;
alter table product_variant_costs enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table order_item_costs      enable row level security;

-- Catalogos: leen todos los activos; escriben segun permiso.
-- Borrar es una baja logica (update active = false), por eso el update
-- tambien lo habilita can_delete_*.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('clients', 'clients'),
    ('providers', 'providers'),
    ('products', 'products')
  ) as x(tabla, modulo) loop
    execute format('drop policy if exists "Leer" on %I', r.tabla);
    execute format('drop policy if exists "Crear" on %I', r.tabla);
    execute format('drop policy if exists "Editar" on %I', r.tabla);
    execute format('create policy "Leer" on %I for select to authenticated using (private.esta_activo())', r.tabla);
    execute format(
      'create policy "Crear" on %I for insert to authenticated with check (private.puede(%L))',
      r.tabla, 'can_create_' || r.modulo
    );
    execute format(
      'create policy "Editar" on %I for update to authenticated using (private.puede(%L) or private.puede(%L)) with check (private.puede(%L) or private.puede(%L))',
      r.tabla, 'can_edit_' || r.modulo, 'can_delete_' || r.modulo, 'can_edit_' || r.modulo, 'can_delete_' || r.modulo
    );
  end loop;
end $$;

drop policy if exists "Leer" on app_config;
drop policy if exists "Solo admin escribe" on app_config;
create policy "Leer" on app_config for select to authenticated using (private.esta_activo());
create policy "Solo admin escribe" on app_config for all to authenticated
  using (private.es_admin()) with check (private.es_admin());

drop policy if exists "Leer" on product_variants;
drop policy if exists "Gestionar" on product_variants;
create policy "Leer" on product_variants for select to authenticated using (private.esta_activo());
create policy "Gestionar" on product_variants for all to authenticated
  using (private.puede('can_create_products') or private.puede('can_edit_products'))
  with check (private.puede('can_create_products') or private.puede('can_edit_products'));

-- Costos de producto: solo con can_see_cost, y solo al crear/editar productos.
drop policy if exists "Costo visible" on product_variant_costs;
drop policy if exists "Costo gestionable" on product_variant_costs;
create policy "Costo visible" on product_variant_costs for select to authenticated
  using (private.puede('can_see_cost'));
create policy "Costo gestionable" on product_variant_costs for all to authenticated
  using (private.puede('can_see_cost') and (private.puede('can_create_products') or private.puede('can_edit_products')))
  with check (private.puede('can_see_cost') and (private.puede('can_create_products') or private.puede('can_edit_products')));

-- Pedidos: por dueño. Las reglas finas (estado, can_edit_orders) estan en el
-- trigger `orders_reglas`.
drop policy if exists "Ver pedidos" on orders;
drop policy if exists "Crear pedidos" on orders;
drop policy if exists "Actualizar pedidos" on orders;
drop policy if exists "Borrar pedidos" on orders;
create policy "Ver pedidos" on orders for select to authenticated
  using (private.esta_activo() and (private.es_admin() or user_id = (select auth.uid())));
create policy "Crear pedidos" on orders for insert to authenticated
  with check (private.puede('can_create_orders') and (private.es_admin() or user_id = (select auth.uid())));
create policy "Actualizar pedidos" on orders for update to authenticated
  using (private.esta_activo() and (private.es_admin() or user_id = (select auth.uid())))
  with check (private.esta_activo() and (private.es_admin() or user_id = (select auth.uid())));
create policy "Borrar pedidos" on orders for delete to authenticated
  using (
    private.puede('can_delete_orders')
    and (private.es_admin() or (user_id = (select auth.uid()) and status <> 'sent'))
  );

-- Items: visibles si el pedido lo es (el select de orders ya filtra por RLS);
-- editables solo mientras el pedido esta abierto (o si es admin).
drop policy if exists "Ver items" on order_items;
drop policy if exists "Gestionar items" on order_items;
create policy "Ver items" on order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_items.order_id));
create policy "Gestionar items" on order_items for all to authenticated
  using (
    (private.puede('can_create_orders') or private.puede('can_edit_orders'))
    and exists (
      select 1 from orders o
      where o.id = order_items.order_id and (private.es_admin() or o.status = 'open')
    )
  )
  with check (
    (private.puede('can_create_orders') or private.puede('can_edit_orders'))
    and exists (
      select 1 from orders o
      where o.id = order_items.order_id and (private.es_admin() or o.status = 'open')
    )
  );

drop policy if exists "Costo de item visible" on order_item_costs;
create policy "Costo de item visible" on order_item_costs for select to authenticated
  using (
    private.puede('can_see_cost')
    and exists (select 1 from order_items i where i.id = order_item_costs.order_item_id)
  );

-- ─────────────────────────────────────────────────────────────
-- Permisos de tabla (nada publico; el cliente nunca escribe costos de
-- pedido: los pone el trigger)
-- ─────────────────────────────────────────────────────────────
revoke all on table clients, providers, app_config, products, product_variants,
  product_variant_costs, orders, order_items, order_item_costs from anon, authenticated;

grant select, insert, update on table clients, providers, products to authenticated;
grant select, insert, update, delete on table product_variants, product_variant_costs to authenticated;
grant select, insert, update, delete on table app_config to authenticated;
grant select, insert, update, delete on table orders, order_items to authenticated;
grant select on table order_item_costs to authenticated;
