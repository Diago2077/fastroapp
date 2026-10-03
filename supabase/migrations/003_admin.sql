-- ═══════════════════════════════════════════════════════════════════════════
-- 003_admin.sql — Alta del primer administrador
--
-- Este archivo se corre UNA sola vez, y DESPUES de haber creado el usuario a
-- mano en el dashboard de Supabase:
--
--   Authentication → Users → Add user → Create new user
--   (marcar "Auto Confirm User", si no, no va a poder entrar)
--
-- Cambiar el email y el nombre de abajo por los que se usaron ahi.
--
-- El primer admin no se crea desde la app a proposito: no hay cuentas
-- todavia, asi que no habria con quien iniciar sesion para crearlo. Del
-- segundo en adelante ya se dan de alta desde /usuarios.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.usuarios (id, nombre, email, rol)
select u.id, 'Administrador', u.email, 'admin'
from auth.users u
where u.email = 'cambiar@ejemplo.com'
on conflict (id) do update
  set rol = 'admin', activo = true;

-- Verificacion: tiene que devolver exactamente una fila
select id, email, rol from public.usuarios where rol = 'admin';
