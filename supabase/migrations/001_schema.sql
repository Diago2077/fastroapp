-- ═══════════════════════════════════════════════════════════════════════════
-- 001_schema.sql — Esquema base
--
--   auth.users ── usuarios (nombre, email, rol, activo)
--
-- Una sola tabla propia: el perfil de la persona, colgado de `auth.users`.
-- El rol es GLOBAL y tiene dos valores, 'admin' y 'usuario': no hay niveles
-- intermedios ni roles por seccion. Si una app construida sobre esta base
-- necesita permisos mas finos, lo natural es agregar una tabla de permisos
-- aparte antes que meter mas valores en `rol`.
--
-- Las tablas propias de cada app se agregan en migraciones nuevas (004_…),
-- siguiendo el patron de policy documentado en 002_rls.sql y en el README.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- updated_at automatico, reutilizable por cualquier tabla nueva
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- usuarios — perfil colgado de auth.users (comparten el id).
--
-- `email` esta duplicado respecto de `auth.users.email` a proposito: asi las
-- pantallas lo leen con un select comun, sin pasar por la API de Auth (que
-- necesita la service_role key). El precio es que hay que mantenerlos
-- sincronizados: por eso cambiar el email pasa siempre por
-- /api/admin/usuarios, que actualiza los dos lados.
--
-- `activo = false` es la baja: la persona sigue existiendo en Auth y puede
-- llegar a iniciar sesion, pero la RLS deja de devolverle filas y la app le
-- muestra "cuenta desactivada". Se prefiere a borrar la cuenta porque no
-- arrastra los datos que haya cargado.
-- ─────────────────────────────────────────────────────────────
create table if not exists usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  email text not null,
  rol text not null default 'usuario' check (rol in ('admin', 'usuario')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- El email identifica la cuenta: dos perfiles con el mismo email dejarian
-- sin resolver a cual corresponde el login.
create unique index if not exists usuarios_email_idx on usuarios (lower(email));

drop trigger if exists usuarios_updated_at on usuarios;
create trigger usuarios_updated_at
  before update on usuarios
  for each row execute function public.set_updated_at();
