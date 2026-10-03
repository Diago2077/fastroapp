-- ═══════════════════════════════════════════════════════════════════════════
-- pedidos_test.sql — Permisos, costos y reglas de estado del dominio FASTRO
--
--   npm run db:start && npm run db:test
--
-- Personas (todas activas salvo indicacion):
--   ana   — admin
--   beto  — usuario con los permisos por defecto (crea/edita pedidos, NO ve costo)
--   caro  — usuario con can_see_cost y permisos de productos
--   dani  — usuario SIN permisos de pedidos
--
-- Mismas trampas que rls_test.sql: un UPDATE/DELETE bloqueado por `using` no
-- tira error (afecta cero filas); uno bloqueado por un trigger o por falta de
-- grant si tira excepcion.
-- ═══════════════════════════════════════════════════════════════════════════

begin;
select plan(24);

create extension if not exists pgtap with schema extensions;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'beto@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'caro@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'dani@test.local');

insert into usuarios (id, nombre, email, rol) values
  ('11111111-1111-1111-1111-111111111111', 'Ana',  'ana@test.local',  'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Beto', 'beto@test.local', 'usuario'),
  ('33333333-3333-3333-3333-333333333333', 'Caro', 'caro@test.local', 'usuario'),
  ('44444444-4444-4444-4444-444444444444', 'Dani', 'dani@test.local', 'usuario');

update usuarios set can_see_cost = true, can_create_products = true, can_edit_products = true
  where id = '33333333-3333-3333-3333-333333333333';
update usuarios set can_create_orders = false, can_edit_orders = false, can_delete_orders = false
  where id = '44444444-4444-4444-4444-444444444444';

-- Catalogo sembrado como superusuario (bypassea RLS)
insert into clients (id, code, name) values ('c0000000-0000-0000-0000-000000000001', 1, 'Cliente Uno');
insert into providers (id, name) values ('d0000000-0000-0000-0000-000000000001', 'Fabrica Uno');
insert into products (id, code, description, provider_id)
  values ('e0000000-0000-0000-0000-000000000001', 'P1', 'Remera', 'd0000000-0000-0000-0000-000000000001');
insert into product_variants (id, product_id, color, size, sale_price)
  values ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Rojo', 'M', 100000),
         ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'Rojo', 'L', 120000);
insert into product_variant_costs (variant_id, cost_price) values
  ('f0000000-0000-0000-0000-000000000001', 30),
  ('f0000000-0000-0000-0000-000000000002', 40);

-- ─────────────────────────────────────────────────────────────
-- Catalogos y costos
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;

select is((select count(*)::int from clients), 1, 'Un usuario activo lee los catalogos aunque no pueda ver clientes');
select is((select count(*)::int from product_variant_costs), 0, 'Sin can_see_cost no se ve ningun costo de producto');

select throws_ok(
  $$insert into clients (name) values ('Intruso')$$,
  '42501', null,
  'Sin can_create_clients no se crean clientes'
);

select throws_ok(
  $$insert into app_config (key, value) values ('x', 'y')$$,
  '42501', null,
  'Solo el admin escribe la configuracion'
);

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select is((select count(*)::int from product_variant_costs), 2, 'Con can_see_cost se ven los costos de producto');

-- ─────────────────────────────────────────────────────────────
-- Guardar pedido por RPC
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

create temp table _pedido (id uuid);
grant all on _pedido to authenticated;

insert into _pedido
select public.save_order_with_items(
  null, 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
  'Verano 2026', 10, null, 'open', null,
  '[{"variant_id":"f0000000-0000-0000-0000-000000000001","quantity":2}]'::jsonb
);

select is((select count(*)::int from orders), 1, 'Beto crea un pedido por RPC');
select is((select user_id from orders), '22222222-2222-2222-2222-222222222222'::uuid, 'El dueño del pedido es quien lo guardo');
select alike((select order_number from orders), 'FAS-%', 'El numero de pedido sale de la secuencia');
select is(
  (select unit_sale_price from order_items),
  100000::numeric,
  'El precio de venta del item lo pone la base, desde la variante'
);
select is((select count(*)::int from order_item_costs), 0, 'Beto no ve el costo congelado del item');

reset role;
select is(
  (select unit_cost_price from order_item_costs),
  30::numeric,
  'El costo del item se congelo igual (trigger) aunque Beto no tenga can_see_cost'
);

-- Cambiar el precio de la variante no reprecia un pedido existente
update product_variants set sale_price = 999 where id = 'f0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select public.save_order_with_items(
  (select id from _pedido), 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
  'Verano 2026', 10, null, 'open', null,
  '[{"variant_id":"f0000000-0000-0000-0000-000000000001","quantity":5},
    {"variant_id":"f0000000-0000-0000-0000-000000000002","quantity":1}]'::jsonb
);

select is(
  (select unit_sale_price from order_items where product_variant_id = 'f0000000-0000-0000-0000-000000000001'),
  100000::numeric,
  'Editar el pedido conserva el precio congelado de lo que ya estaba'
);
select is(
  (select quantity from order_items where product_variant_id = 'f0000000-0000-0000-0000-000000000001'),
  5,
  'Y actualiza la cantidad'
);
select is(
  (select unit_sale_price from order_items where product_variant_id = 'f0000000-0000-0000-0000-000000000002'),
  120000::numeric,
  'Lo agregado en la edicion toma el precio vigente'
);

-- ─────────────────────────────────────────────────────────────
-- Visibilidad por dueño
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select is((select count(*)::int from orders), 0, 'Otro usuario no ve el pedido de Beto');
select is((select count(*)::int from order_items), 0, 'Ni sus items');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is((select count(*)::int from orders), 1, 'El admin ve todos los pedidos');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_ok(
  $$select public.save_order_with_items(null, null, null, null, 0, null, 'open', null,
      '[{"variant_id":"f0000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb)$$,
  '42501', null,
  'Sin can_create_orders no se puede crear un pedido'
);

-- ─────────────────────────────────────────────────────────────
-- Reglas de estado
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok(
  $$update orders set status = 'sent'$$,
  '42501', null,
  'Un usuario comun no puede pasar un pedido abierto directo a enviado'
);

update orders set status = 'closed';
select is((select status from orders), 'closed', 'Un usuario comun si puede cerrar su pedido');

select throws_ok(
  $$update orders set status = 'sent'$$,
  '42501', null,
  'Pero no puede pasarlo de cerrado a enviado'
);

select throws_ok(
  $$update orders set observation = 'cambio'$$,
  '42501', null,
  'Ni tocar un pedido que ya no esta abierto'
);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
update orders set status = 'sent';
select is((select status from orders), 'sent', 'El admin si pasa el pedido a enviado');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
delete from orders;
reset role;
select is((select count(*)::int from orders), 1, 'Un pedido enviado no lo borra su dueño (cero filas afectadas)');

select * from finish();
rollback;
