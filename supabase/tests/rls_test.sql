-- ═══════════════════════════════════════════════════════════════════════════
-- rls_test.sql — La RLS probada contra Postgres de verdad
--
--   npm run db:start   # levanta la base local (necesita Docker Desktop)
--   npm run db:test    # corre este archivo
--
-- Cada aserto se hace pasar por una persona puntual fijando los mismos GUC
-- que fija PostgREST en produccion:
--
--   select set_config('request.jwt.claim.sub', '<uuid>', true);
--   set local role authenticated;   -- o `anon`
--
-- Asi se ejercita exactamente el mecanismo real de `auth.uid()` y de rol de
-- Postgres, no un mock aparte.
--
-- Dos trampas a tener en cuenta al extender esta suite:
--
--   · Un UPDATE bloqueado por el `using` de una policy NO tira error:
--     Postgres simplemente afecta cero filas. Esos casos hacen la escritura,
--     `reset role;` para bypassear la RLS, y verifican que la fila no cambio.
--   · Un UPDATE que falla el `with check` SI tira excepcion, y va con
--     `throws_ok`. Confundir los dos casos deja un test que pasa por la
--     razon equivocada.
--   · Un update sobre una columna sin `grant` (nombre, email) tambien tira
--     excepcion, pero de permisos, antes de llegar siquiera a la policy.
-- ═══════════════════════════════════════════════════════════════════════════

begin;
select plan(27);

-- Deberia venir ya habilitada en el stack local; si no, no rompe nada volver
-- a crearla.
create extension if not exists pgtap with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Datos de prueba
--
--   ana   — admin
--   beto  — usuario comun
--   caro  — otro usuario comun (para probar que beto no la ve)
--   dani  — usuario DESACTIVADO
--   eva   — admin DESACTIVADA (el rol no alcanza: tiene que estar activa)
--
-- `usuarios.id` referencia `auth.users`, asi que hay que sembrar las dos.
-- Solo se insertan `id` y `email` en auth.users: es lo minimo que pide la
-- fk. Si una version futura de GoTrue agrega una columna NOT NULL sin
-- default, este insert es el primero que va a fallar y el mensaje de
-- Postgres dice cual falta agregar.
-- ─────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'beto@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'caro@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'dani@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'eva@test.local');

insert into usuarios (id, nombre, email, rol, activo) values
  ('11111111-1111-1111-1111-111111111111', 'Ana',  'ana@test.local',  'admin',   true),
  ('22222222-2222-2222-2222-222222222222', 'Beto', 'beto@test.local', 'usuario', true),
  ('33333333-3333-3333-3333-333333333333', 'Caro', 'caro@test.local', 'usuario', true),
  ('44444444-4444-4444-4444-444444444444', 'Dani', 'dani@test.local', 'usuario', false),
  ('55555555-5555-5555-5555-555555555555', 'Eva',  'eva@test.local',  'admin',   false);

-- ─────────────────────────────────────────────────────────────
-- Lectura
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select is(
  (select count(*)::int from usuarios),
  5,
  'El admin ve a todas las personas del sistema'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(
  (select count(*)::int from usuarios),
  1,
  'Un usuario comun ve una sola fila'
);

select is(
  (select nombre from usuarios),
  'Beto',
  'Y esa fila es la suya'
);

select is(
  (select count(*)::int from usuarios where id = '33333333-3333-3333-3333-333333333333'),
  0,
  'Un usuario comun no ve a otro usuario comun'
);

select is(
  (select count(*)::int from usuarios where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'Un usuario comun tampoco ve al admin'
);

-- Ve su propia fila aunque este desactivado: es lo que le permite a la app
-- decirle "tu cuenta fue desactivada" en vez de dejarlo en una pantalla
-- vacia sin explicacion.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

select is(
  (select count(*)::int from usuarios),
  1,
  'Un usuario desactivado sigue viendo su propia fila (para poder avisarle)'
);

-- Un admin desactivado deja de ser admin: `private.es_admin()` exige activo.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);

select is(
  (select count(*)::int from usuarios),
  1,
  'Un admin desactivado pierde la vista de todos'
);

select ok(
  not private.es_admin(),
  'private.es_admin() es false para un admin desactivado'
);

-- ─────────────────────────────────────────────────────────────
-- Sin sesion
-- ─────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;

select throws_ok(
  'select count(*) from usuarios',
  '42501',
  null,
  'anon no tiene ni permiso de select sobre usuarios'
);

reset role;

-- ─────────────────────────────────────────────────────────────
-- Escritura: un usuario comun no gestiona a nadie
--
-- Su update no falla: la policy no matchea ninguna fila y Postgres afecta
-- cero. Por eso se escribe, se vuelve a superusuario y se mira la fila.
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;

update usuarios set rol = 'admin' where id = '22222222-2222-2222-2222-222222222222';
reset role;
select is(
  (select rol from usuarios where id = '22222222-2222-2222-2222-222222222222'),
  'usuario',
  'Un usuario comun no puede ascenderse a admin'
);

set local role authenticated;
update usuarios set activo = false where id = '33333333-3333-3333-3333-333333333333';
reset role;
select ok(
  (select activo from usuarios where id = '33333333-3333-3333-3333-333333333333'),
  'Un usuario comun no puede desactivar a otro'
);

-- ─────────────────────────────────────────────────────────────
-- Escritura: el admin si gestiona
-- ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

update usuarios set rol = 'admin' where id = '33333333-3333-3333-3333-333333333333';
reset role;
select is(
  (select rol from usuarios where id = '33333333-3333-3333-3333-333333333333'),
  'admin',
  'El admin puede nombrar a otro admin'
);

set local role authenticated;
update usuarios set rol = 'usuario' where id = '33333333-3333-3333-3333-333333333333';
reset role;
select is(
  (select rol from usuarios where id = '33333333-3333-3333-3333-333333333333'),
  'usuario',
  'Y puede volver a bajarlo a usuario'
);

set local role authenticated;
update usuarios set activo = false where id = '22222222-2222-2222-2222-222222222222';
reset role;
select ok(
  not (select activo from usuarios where id = '22222222-2222-2222-2222-222222222222'),
  'El admin puede desactivar una cuenta'
);

set local role authenticated;
update usuarios set activo = true where id = '22222222-2222-2222-2222-222222222222';
reset role;
select ok(
  (select activo from usuarios where id = '22222222-2222-2222-2222-222222222222'),
  'Y puede volver a activarla'
);

-- ─────────────────────────────────────────────────────────────
-- El admin no puede sacarse a si mismo
--
-- Estos dos SI tiran excepcion: el `using` los deja pasar (es admin) y el
-- que falla es el `with check`, que mira la fila resultante.
-- ─────────────────────────────────────────────────────────────
set local role authenticated;

select throws_ok(
  $$update usuarios set rol = 'usuario' where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'El admin no puede bajarse el rol a si mismo'
);

select throws_ok(
  $$update usuarios set activo = false where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'El admin no puede desactivarse a si mismo'
);

select is(
  (select rol from usuarios where id = '11111111-1111-1111-1111-111111111111'),
  'admin',
  'Y despues de los dos intentos sigue siendo admin'
);

-- ─────────────────────────────────────────────────────────────
-- Columnas sin grant: nombre y email
--
-- No las bloquea una policy sino el `grant update (rol, activo)`: el error
-- es de permisos y salta antes de evaluar la RLS. Cambiar el email tiene que
-- pasar por /api, que lo actualiza tambien en auth.users; si se pudiera
-- hacer solo aca, la persona quedaria con un email con el que no puede
-- iniciar sesion.
-- ─────────────────────────────────────────────────────────────
select throws_ok(
  $$update usuarios set nombre = 'Otro' where id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  null,
  'Ni el admin puede cambiar el nombre desde el cliente'
);

select throws_ok(
  $$update usuarios set email = 'otro@test.local' where id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  null,
  'Ni el admin puede cambiar el email desde el cliente'
);

-- ─────────────────────────────────────────────────────────────
-- Alta y baja: tampoco desde el cliente
--
-- Crear implica crear la cuenta en auth.users y borrar implica borrarla:
-- las dos cosas pasan por /api con la service_role key.
-- ─────────────────────────────────────────────────────────────
select throws_ok(
  $$insert into usuarios (id, nombre, email) values ('66666666-6666-6666-6666-666666666666', 'Fede', 'fede@test.local')$$,
  '42501',
  null,
  'Nadie inserta usuarios desde el cliente'
);

select throws_ok(
  $$delete from usuarios where id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  null,
  'Nadie borra usuarios desde el cliente'
);

-- ─────────────────────────────────────────────────────────────
-- Los helpers de la RLS
-- ─────────────────────────────────────────────────────────────
select ok(private.es_admin(), 'private.es_admin() es true para el admin');
select ok(private.esta_activo(), 'private.esta_activo() es true para el admin');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select ok(not private.es_admin(), 'private.es_admin() es false para un usuario comun');
select ok(private.esta_activo(), 'private.esta_activo() es true para un usuario comun activo');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select ok(not private.esta_activo(), 'private.esta_activo() es false para un desactivado');

reset role;
select * from finish();
rollback;
