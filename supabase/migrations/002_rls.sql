-- ═══════════════════════════════════════════════════════════════════════════
-- 002_rls.sql — Permisos
--
-- Dos niveles, los dos globales:
--   · admin   — gestiona a todas las personas del sistema: da de alta, edita
--     nombre/email, cambia contrasenas, asigna el rol y activa/desactiva
--     cuentas. Es el nivel maximo: no hay nadie por encima.
--   · usuario — usa la app. De `usuarios` solo ve su propia fila.
--
-- Lo unico que un admin NO puede hacer es sacarse a si mismo: ni bajarse a
-- 'usuario' ni desactivarse. Es la red que evita quedarse sin ningun admin
-- (el ultimo tampoco puede borrar su propia cuenta; eso lo corta /api).
-- Entre admins si pueden tocarse: el modelo es plano a proposito.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- Helpers de RLS.
--
-- Van en el esquema `private` y no en `public` porque PostgREST expone en
-- /rest/v1/rpc/ todo lo que este en `public`, y estas funciones existen solo
-- para que las evalue la RLS. Revocarles el execute a anon/public NO es
-- alternativa: sin ese permiso la RLS deja de poder evaluarlas y el control
-- de acceso se cae entero.
--
-- Son `security definer` para leer `usuarios` SALTEANDO su propia RLS: sin
-- esto, una policy sobre `usuarios` que consulte `usuarios` dispara
-- "infinite recursion detected in policy".
--
-- El `(select auth.uid())` envuelto en subconsulta no es cosmetico: asi
-- Postgres lo evalua una vez por consulta y no una vez por fila.
-- ─────────────────────────────────────────────────────────────
create schema if not exists private;
grant usage on schema private to authenticated;

-- ¿Quien llama es admin? Una cuenta desactivada no lo es, aunque su rol siga
-- diciendo 'admin'.
create or replace function private.es_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rol = 'admin' and activo from usuarios where id = (select auth.uid())),
    false
  )
$$;

-- ¿Quien llama tiene una cuenta activa? Es el chequeo que van a usar las
-- policies de las tablas que agregue cada app: alcanza con estar activo para
-- trabajar, el rol solo importa para administrar gente.
create or replace function private.esta_activo()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activo from usuarios where id = (select auth.uid())), false)
$$;

revoke execute on function private.es_admin() from public, anon;
revoke execute on function private.esta_activo() from public, anon;
grant execute on function private.es_admin() to authenticated;
grant execute on function private.esta_activo() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- usuarios
--
-- Cada uno ve su propia fila (la necesita el login, incluso desactivado,
-- para poder mostrarle por que no puede entrar). El admin ve a todos.
-- ─────────────────────────────────────────────────────────────
alter table usuarios enable row level security;

drop policy if exists "Ver usuarios" on usuarios;
create policy "Ver usuarios" on usuarios for select to authenticated
  using (private.es_admin() or id = (select auth.uid()));

-- El `with check` mira la fila DESPUES del update: si es la del propio
-- admin, exige que siga siendo admin y activa. Asi no puede degradarse ni
-- darse de baja a si mismo, que es la unica forma de quedarse sin acceso de
-- administracion por accidente.
drop policy if exists "Admin gestiona usuarios" on usuarios;
create policy "Admin gestiona usuarios" on usuarios for update to authenticated
  using (private.es_admin())
  with check (
    private.es_admin()
    and (id <> (select auth.uid()) or (rol = 'admin' and activo))
  );

-- ─────────────────────────────────────────────────────────────
-- Permisos de tabla.
--
-- Supabase concede por defecto a `anon` sobre las tablas nuevas de public;
-- aca no hay nada publico, asi que se revoca de forma explicita.
--
-- El update se concede COLUMNA POR COLUMNA: desde el navegador solo se
-- pueden tocar `rol` y `activo`. `nombre` y `email` quedan afuera porque el
-- email tiene que cambiar tambien en `auth.users` para que el login siga
-- funcionando, y eso solo puede hacerlo /api/admin/usuarios con la
-- service_role key. Un update del cliente que los incluya falla con
-- "permission denied for table usuarios", no pasa en silencio.
--
-- Tampoco hay insert ni delete para el cliente: crear una cuenta implica
-- crearla en Auth y borrarla implica borrarla de Auth. Las dos cosas pasan
-- por /api, que usa la service_role key y bypassea todo esto.
-- ─────────────────────────────────────────────────────────────
-- Supabase concede por defecto ALL a authenticated en las tablas nuevas de public:
-- sin revocarlo antes, los grants por columna de abajo no restringen nada.
revoke all on table usuarios from anon, authenticated;
grant select on table usuarios to authenticated;
grant update (rol, activo) on table usuarios to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Patron para las tablas de cada app (copiar en la migracion 004_…)
--
--   create table mi_tabla (
--     id uuid default gen_random_uuid() primary key,
--     ...
--   );
--
--   alter table mi_tabla enable row level security;
--
--   -- Todos los usuarios activos trabajan con estos datos:
--   create policy "Acceso" on mi_tabla for all to authenticated
--     using (private.esta_activo())
--     with check (private.esta_activo());
--
--   -- …o, si la operacion es solo del administrador:
--   create policy "Solo admin" on mi_tabla for all to authenticated
--     using (private.es_admin())
--     with check (private.es_admin());
--
--   -- …o, si cada uno ve unicamente lo suyo:
--   create policy "Lo mio" on mi_tabla for all to authenticated
--     using (private.es_admin() or usuario_id = (select auth.uid()))
--     with check (private.es_admin() or usuario_id = (select auth.uid()));
--
--   revoke all on table mi_tabla from anon;
--   grant select, insert, update, delete on table mi_tabla to authenticated;
--
-- Y sumar su bloque en supabase/tests/rls_test.sql: una policy sin test es
-- una policy que nadie nota cuando se rompe.
-- ═══════════════════════════════════════════════════════════════════════════
