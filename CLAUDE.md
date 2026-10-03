# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Que es esto

FASTRO S.A. — sistema de pedidos a fabricas. Reemplaza a la app vieja
(`D:astro-pedidos`: HTML + JS vanilla en GitHub Pages) y esta construida
sobre la base `app-base` (React 19 + TS + Vite + Tailwind 4 + Supabase +
funciones `/api` de Vercel): login, usuarios, tema y PWA vienen de la base;
el dominio (clientes, productos, pedidos, reportes) esta en la migracion
`005_pedidos.sql` y en `src/pages`. Mas abajo, "Dominio FASTRO" explica
las decisiones propias de esta app.

## Comandos

```bash
npm run dev              # servidor de vite
npm run build            # tsc -b && vite build
npm run lint             # oxlint
npm test                 # vitest run (una vez)
npm run test:watch       # vitest (watch)
npx vitest run src/lib/format.test.ts   # un solo archivo de test

npm run db:start         # Postgres + Auth + Studio local via Docker; aplica supabase/migrations/*.sql
npm run db:test          # corre supabase/tests/*.sql (pgTAP) contra la base local — necesita db:start antes
npx supabase test db supabase/tests/rls_test.sql   # un solo archivo pgTAP
npm run db:reset         # reaplica las migraciones desde cero en la base local
npm run db:stop          # apaga el stack local
```

Los `db:*` necesitan Docker Desktop corriendo. La CLI de Supabase esta
pinneada como devDependency (no se asume instalada global), asi que estos
comandos resuelven siempre la misma version.

## Arquitectura

### Dos niveles, los dos globales

Una sola tabla propia: `usuarios`, colgada de `auth.users` (comparten el
`id`). `rol` es una columna de esa fila y vale `'admin'` o `'usuario'`. No
hay tenants, ni roles por seccion, ni un super-administrador por encima.

- `admin` — gestiona a todas las personas del sistema: alta, edicion de
  nombre/email, contrasena, rol y activo/inactivo. Es el nivel maximo.
- `usuario` — usa la app. De `usuarios` solo lee su propia fila.

Un admin **puede** nombrar a otro admin, a proposito: sin un nivel superior,
si no pudiera no habria forma de tener un segundo administrador sin entrar a
la base. Lo que **no** puede es sacarse a si mismo — la policy de update
tiene un `with check` que, cuando la fila afectada es la del propio actor,
exige que siga saliendo `rol = 'admin' and activo`. Eliminar la propia cuenta
lo corta `/api`. Entre las tres cosas, el sistema no puede quedarse sin
ningun admin por accidente.

`activo = false` es la baja: la cuenta sigue existiendo en Auth y hasta puede
iniciar sesion, pero la RLS deja de devolverle filas y `AppLayout` le muestra
"cuenta desactivada" en vez de una pantalla vacia. Ninguna sesion viva se
entera en el momento — la proxima consulta protegida simplemente no devuelve
nada.

Los dos helpers `security definer` viven en el esquema `private` (no en
`public`) justamente para que PostgREST **no** los exponga como RPC
llamables: existen solo para que los evalue la RLS. Revocarles el `execute` a
`anon`/`public` rompe la evaluacion de la RLS por completo.

- `private.es_admin()` — ¿quien llama es admin **y** esta activo?
- `private.esta_activo()` — el chequeo que van a usar las policies de las
  tablas que agregue cada app: para trabajar alcanza con estar activo; el rol
  solo importa para administrar gente.

Al agregar una tabla, seguir el patron documentado al final de
`002_rls.sql` y sumar cobertura en `supabase/tests/rls_test.sql`.

### Los grants por columna no son un detalle

`usuarios` tiene `grant update (rol, activo) ... to authenticated` y nada
mas: ni insert, ni delete, ni update de `nombre`/`email`. No es redundante
con la RLS, resuelve algo que la RLS no puede expresar bien — que un admin
puede cambiar el rol de alguien desde el navegador, pero no su email, porque
el email vive tambien en `auth.users` y cambiarlo solo en el perfil dejaria a
la persona viendo un email con el que no puede iniciar sesion.

Si en el futuro hay que permitir editar otra columna desde el cliente, hay
que acordarse de agregarla a ese grant: la policy sola no alcanza.

### `/api` existe solo para lo que necesita la service_role key

Las funciones serverless de Vercel bajo `api/` existen unicamente para
operaciones que tocan `auth.users`: crear una cuenta, borrarla, cambiar
contrasena o el email de login. Todo lo demas — listar usuarios, cambiar el
rol, activar/desactivar — va directo del cliente a PostgREST, protegido por
la RLS. Antes de agregar un endpoint, conviene preguntarse si no alcanza con
una policy.

Los endpoints nunca confian en el rol que manda el cliente: derivan la
identidad del actor del lado del servidor con `usuarioAutenticado()` (que
verifica el JWT contra Supabase, en `api/_lib/auth.ts`) y leen su rol de la
base. `exigeAdmin()` es la puerta de entrada de todo `api/admin/usuarios.ts`.

`crear` hace dos escrituras que tienen que pasar o fallar juntas (la cuenta
de Auth y el perfil): si la segunda falla, borra la primera. Sin eso queda
una cuenta de Auth huerfana que ademas bloquea ese email para siempre.

### La carrera de auth/perfil al montar (`src/hooks/useAuth.tsx`)

Al montar, `supabase.auth.getSession()` y el evento `INITIAL_SESSION` de
`onAuthStateChange` se disparan casi al mismo tiempo para el mismo usuario.
Un token monotonico (`cargaActual`, un ref) descarta el resultado de
cualquier carga de perfil que ya no sea la mas nueva, para que una carga
lenta y vieja no pueda pisar el `usuario` de una carga mas nueva con
`loading=false` y un fogonazo de "no hay sesion". Si se toca este archivo,
hay que preservar esa guarda — el bug que evita solo se reproduce entrando
por URL directa o con F5 (nunca navegando con los links, porque ahi el
provider ya esta montado), asi que es facil "arreglarlo" de una forma que lo
reintroduce en silencio.

`useAuth` tambien solo reacciona cuando el id de usuario cambia de verdad en
`onAuthStateChange`, no ante cualquier nombre de evento: Supabase revalida la
sesion al recuperar el foco de la pestana y puede disparar `SIGNED_IN` para
el mismo usuario de siempre. Ponerle `loading=true` a eso desmontaria el
`<Outlet>` de `AppLayout` y se perderia un formulario a medio llenar.

`rol` se expone como `null` si la cuenta esta desactivada, aunque la columna
siga diciendo `'admin'`: la RLS ya no le devuelve nada, y mostrarle las
pantallas de administracion seria mentirle.

### El nombre de la app esta en un solo lugar

`app.config.json` (nombre, descripcion, color) + el `name`/`version` de
`package.json` son la unica fuente de la identidad de la app. De ahi salen,
sin repetirse en ningun lado:

- `vite.config.ts` → el `define` de `__APP_NOMBRE__`/`__APP_ID__`/etc., que
  consume `src/lib/app.ts` (ningun componente escribe el nombre a mano).
- el plugin `marcaApp()` del mismo archivo → reemplaza los `%MARCA_*%` de
  `index.html` (titulo, metas, theme-color y la clave de localStorage del
  script que aplica el tema antes del primer pintado), sirve
  `/manifest.webmanifest` en dev y lo escribe a `dist/` en el build, y genera
  `dist/sw.js` desde `scripts/sw-template.js`.

El manifest **no** vive en `public/` a proposito: si estuviera ahi habria que
editarlo a mano en cada app nueva. El service worker tampoco, y ademas por
una segunda razon — Vite lo copiaria tal cual, sin la version inyectada, y el
nombre del cache no coincidiria con lo publicado.

Las claves de localStorage se arman con `claveLocal()` de `src/lib/app.ts`,
que les pone el `name` de `package.json` de prefijo: dos apps hechas sobre
esta base no se pisan aunque corran en el mismo dominio.

### Probar la RLS de verdad, no solo a traves de la app

`supabase/tests/rls_test.sql` es una suite pgTAP que siembra cinco personas —
un admin, dos usuarios comunes, un usuario desactivado y un admin
desactivado — y, para cada aserto, se hace pasar por una persona especifica
fijando los GUC de Postgres de los que depende PostgREST antes de correr la
consulta bajo prueba:

```sql
select set_config('request.jwt.claim.sub', '<uuid-de-la-persona>', true);
set local role authenticated;   -- o `anon`
```

Esto hace que los tests corran exactamente el mismo mecanismo de
`auth.uid()` / rol por el que pasa el trafico real en produccion — no un mock
aparte. Al extender la suite hay tres casos que conviene no confundir,
porque el test pasaria igual pero por la razon equivocada:

- Un UPDATE/DELETE bloqueado por el `using` **no** tira error: Postgres
  afecta cero filas. Esos asertos hacen la escritura, `reset role;` para
  bypassear la RLS, y verifican que la fila no cambio.
- Un UPDATE que falla el `with check` (un admin tratando de degradarse a si
  mismo) **si** tira excepcion: van con `throws_ok` y codigo `42501`.
- Un update sobre una columna sin `grant` (`nombre`, `email`) tambien tira
  `42501`, pero de permisos — salta antes de evaluar la policy.

### Tema (`src/lib/tema.ts`, sin contexto de React)

Claro/oscuro/sistema vive en un modulo plano con sus propios suscriptores,
leido via `useSyncExternalStore` (`src/hooks/useTema.ts`), porque el
interruptor aparece en layouts que nunca estan montados a la vez (`Login`,
`AppLayout`) y todos necesitan ver el mismo valor sin un provider comun
arriba. `index.html` trae un script inline que aplica la clase `.dark`
**antes** de que cargue el bundle, para evitar un fogonazo blanco; su clave
de localStorage la inyecta `marcaApp()` con el mismo valor que calcula
`claveLocal('tema')`, asi que no se pueden desincronizar.

### Versionado del service worker

El nombre del cache incluye el `name` + `version` de `package.json`
(`scripts/sw-template.js` tiene los marcadores
`__APP_NOMBRE__`/`__APP_VERSION__`). Subir el `version` de `package.json` es
el proceso de release completo; no hay un segundo archivo que mantener
sincronizado a mano.

### Tipos de la base escritos a mano (`src/lib/database.types.ts`)

Los tipos se escriben a mano en vez de generarse, para mantener uniones
afinadas (`Rol`, no `string`) y los comentarios inline. El costo de eso — que
una migracion que renombra una columna en silencio no rompe el build — esta
anotado en un comentario ahi mismo, junto con el arreglo (generar los tipos
reales con `npm run tipos` y agregar un chequeo que compare solo los nombres
de columna contra ellos) para cuando el esquema crezca.

## Dominio FASTRO

### Monedas
Venta en **guaranies (₲)**, costo de fabrica en **dolares (US$)**. Son dos
magnitudes distintas (costo promedio ~10, venta ~127.000): nunca se restan ni
comparten eje de grafico. La app vieja calculaba un "margen" restando dolares
a guaranies; se quito. Formateo unico en `src/lib/format.ts`
(`formatGs`, `formatUsd`, `formatGsPdf` para PDFs, donde la fuente no tiene ₲).

### Permisos finos (migracion 004) y como los hace cumplir la base
`usuarios` tiene 20 columnas `can_*` (ver/crear/editar/borrar por modulo, ver
costo, exportar Excel); un admin activo tiene todos. `private.puede('can_x')`
las evalua en las policies. Detalles que importan:
- Todo usuario activo **lee** los catalogos (clientes, productos, proveedores,
  config): el formulario de pedido los necesita aunque no tenga "ver" ese
  modulo. `can_view_*` solo decide si aparece la pantalla.
- Borrar clientes/productos/proveedores es baja logica (`active = false`), por
  eso el update tambien lo habilita `can_delete_*`.
- **Supabase da `ALL` a `authenticated` por defecto en tablas nuevas.** Hay que
  `revoke all ... from anon, authenticated` antes de los `grant`, si no los
  grants por columna no restringen nada (el template lo tenia mal; lo detecto
  `rls_test.sql`).

### Costos: tablas aparte
`product_variant_costs` y `order_item_costs` tienen RLS por `can_see_cost`:
sin el permiso la API no devuelve costos (el embed sale `null`/vacio). Un
trigger (`private.congelar_costo`, security definer) copia el costo al item al
crearlo, aunque quien arma el pedido no pueda verlo.

### Pedidos
- `save_order_with_items` (RPC, security invoker) recibe solo `variant_id` y
  `quantity`: el precio de venta lo toma la base de `product_variants` y una
  variante que ya estaba conserva su precio congelado.
- Reglas de estado en el trigger `orders_reglas`, no en la UI: un usuario comun
  solo pasa abierto → cerrado; cerrado → enviado, reabrir, cancelar y
  reactivar son del admin; un pedido no abierto solo lo toca un admin;
  cambiar datos exige `can_edit_orders`. Sin sesion (service_role) no hay
  restricciones: asi migra la carga de datos.
- Un pedido no abierto es de solo lectura en la UI para todos (el admin debe
  cambiarle el estado primero).
- Borrador de pedido nuevo en localStorage, con clave por usuario.

### Orden de tallas
`app_config.size_order` (JSON). `src/lib/config.ts` lo expone como
`compararTallas`; las tallas sin configurar van al final en orden natural.

### Notificaciones push y reportes por correo: EN PAUSA
Decision del dueno: las notificaciones se haran en el futuro y los reportes por
correo no se haran por ahora. No hay nada de esto en la interfaz ni se dispara
desde la app, y el cron `send-report-daily` esta desactivado en la base.

Queda guardado para retomarlo:
- Backend: `supabase/functions/send-push` y `send-report` (siguen desplegadas en el
  proyecto, sin secrets cargados, asi que no hacen nada), y las migraciones
  `007_push.sql` (tabla `push_subscriptions`) y `008_reportes_cron.sql` (con
  placeholders; no aplicar a ciegas). Los handlers `push`/`notificationclick`
  siguen en `scripts/sw-template.js`.
- Frontend: se saco del arbol y vive en el commit `3928924` (`src/lib/push.ts`,
  `src/components/layout/AvisoNotificaciones.tsx`,
  `src/components/configuracion/CorreosYAvisos.tsx`, el aviso en
  `CambioEstadoModal` y el montaje en `AppLayout`/`Configuracion`).
  `git show 3928924 -- <ruta>` lo recupera.
- Al retomarlo: los secrets son `VAPID_*`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` y
  `CRON_SECRET`; la clave publica VAPID va tambien como `VITE_VAPID_PUBLIC_KEY`.
  Las claves de `app_config` `notify_*` y `report_*` ya estan migradas.

### Supabase local
`enable_signup = true` en `supabase/config.toml` es solo para el stack local
(con `false` el CLI apaga el login por email entero). En el proyecto real hay
que desactivar "Allow new users to sign up" desde el dashboard.

## Al construir una app sobre esta base

Ver el paso a paso en el README. Lo que conviene no perder de vista:

- La UI **nunca** es el control de acceso. `RequiereAdmin` y el `soloAdmin`
  del `NAV` existen para no mostrarle a alguien una pantalla que le va a
  aparecer vacia; lo que protege los datos es la policy.
- Toda tabla nueva arranca con `enable row level security` y su policy en la
  misma migracion. Una tabla con RLS habilitada y sin policy no devuelve
  nada, que es el modo correcto de fallar.
- Los modulos se enganchan en tres lugares: la ruta (`src/App.tsx`), el link
  (`NAV` en `AppLayout`) y la tarjeta (`MODULOS` en `Inicio`).
