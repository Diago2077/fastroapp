# FASTRO S.A. — Sistema de Pedidos

Sistema de pedidos a fabricas (clientes, productos con variantes color × talla,
pedidos, reportes, usuarios con permisos finos). Construido sobre `app-base`;
ver [CLAUDE.md](CLAUDE.md) para las decisiones del dominio.

> Lo que sigue es la documentacion original de la base, que sigue valiendo
> para correr, probar y desplegar.


Punto de partida para aplicaciones web: trae resuelto todo lo que una app
necesita **antes** de tener funcionalidad propia — login, gestion de
usuarios, dos niveles de permiso, interfaz, tema claro/oscuro y PWA — y nada
mas que eso. No es una app: es el esqueleto sobre el que se construye una.

Sale de extraer la base de un sistema real, sacandole todo el dominio y
dejando solo la interfaz y las cuentas.

**Stack:** React + TypeScript + Vite · Tailwind v4 · React Router · Supabase
(Postgres + Auth) · Vercel Serverless Functions.

## Como esta armado

Una sola tabla propia, `usuarios`, colgada de `auth.users`. El rol es
**global** y tiene dos valores:

| Nivel | Que puede hacer |
| --- | --- |
| `admin` | Todo. Da de alta personas, edita sus datos, cambia contrasenas, asigna el rol y activa o desactiva cuentas. Es el nivel maximo: no hay nadie por encima. |
| `usuario` | Usa la app. De `usuarios` solo ve su propia fila. |

Un admin **puede** nombrar a otro admin: con dos niveles y sin un
super-administrador por encima, si no pudiera no habria forma de tener un
segundo admin sin entrar a la base a mano. Lo unico que no puede es **sacarse
a si mismo**: ni bajarse a `usuario`, ni desactivarse, ni eliminar su propia
cuenta. Esa es la red que evita que el sistema quede sin ningun
administrador.

Desactivar (`activo = false`) es la baja: la cuenta sigue existiendo, pero la
RLS deja de devolverle datos y la app le muestra "cuenta desactivada". Se
prefiere a eliminar porque no arrastra lo que esa persona haya cargado.

Nada de esto depende del frontend: lo garantiza Row Level Security en
Postgres (`supabase/migrations/002_rls.sql`), verificado con tests que corren
contra la base de verdad.

## Puesta en marcha

### 1. Supabase

Dos caminos, no hace falta elegir uno para siempre:

- **Local con Docker** (recomendado para desarrollar): `npm run db:start`
  levanta Postgres + Auth + Studio en la maquina y corre
  `supabase/migrations/*.sql` solo. Es lo que usa `npm run db:test` y lo que
  conviene para probar una migracion antes de aplicarla en serio. Necesita
  Docker Desktop corriendo. `npm run db:stop` la apaga; `npm run db:reset` la
  reconstruye desde cero si algo quedo en un estado raro.

- **Proyecto en la nube**: crear un proyecto en supabase.com y correr, en
  orden, `supabase/migrations/*.sql` en el **SQL Editor**. Es lo que necesita
  el deploy real, tarde o temprano.

En ambos casos, `003_admin.sql` es la unica migracion que no se corre de una:
hay que crear antes el primer administrador en **Authentication → Users → Add
user** (marcando *Auto Confirm User*) y recien ahi correrla, cambiando el
email por el que se uso. Del segundo usuario en adelante ya se dan de alta
desde la app. En local, el Studio vive en `http://127.0.0.1:54323` despues de
`npm run db:start`.

### 2. Variables de entorno

Copiar `.env.example` a `.env` y completar con los valores de **Project
Settings → API** (o, en local, con lo que imprime `npm run db:start` al
terminar).

Las `VITE_*` viajan al navegador y estan pensadas para eso. Las otras dos son
**solo del servidor**: si a alguna se le pone el prefijo `VITE_`, la
`service_role` key termina publicada dentro del bundle y cualquiera puede
leer y escribir toda la base.

### 3. Correr

```bash
npm install
npm run dev
```

## Empezar una app nueva desde esta base

1. **Copiar la carpeta** y editar dos archivos:

   - `app.config.json` — nombre, descripcion y color de la app.
   - `package.json` — el `name` (prefijo del cache del service worker y de
     las claves de localStorage) y el `version`.

   Con eso cambia el titulo de la pestana, las metas, el manifest de la PWA,
   el nombre en la cabecera y en el login, y el cache del service worker.
   **No hay ningun otro archivo donde el nombre de la app este escrito a
   mano**: el plugin `marcaApp` de `vite.config.ts` lo inyecta en
   `index.html` y genera el manifest, y `src/lib/app.ts` lo expone al codigo
   de React.

2. **Rebrandear.** El color primario de la interfaz sale de `--primary` y
   `--ring` en `src/index.css` (paleta en oklch: cambiando el matiz se
   rebrandea toda la app). Los iconos salen de `app.config.json` +
   `scripts/generate-icons.mjs` — editar `colorPrimario` y el `GLYPH`, correr
   `npm install --no-save sharp` y `npm run iconos`.

   > `colorPrimario` (hex) y `--primary` (oklch) son dos valores distintos
   > del mismo color: el primero lo usan el navegador y el sistema operativo
   > (barra de direcciones, splash de la PWA, iconos), el segundo la
   > interfaz. Hay que dejarlos parecidos a mano.

3. **Agregar las tablas propias** en una migracion nueva (`004_…`), con su
   RLS. El patron esta al final de `002_rls.sql`, listo para copiar. En
   resumen:

   ```sql
   alter table mi_tabla enable row level security;

   create policy "Acceso" on mi_tabla for all to authenticated
     using (private.esta_activo())
     with check (private.esta_activo());

   revoke all on table mi_tabla from anon;
   grant select, insert, update, delete on table mi_tabla to authenticated;
   ```

   Si la operacion tiene que quedar reservada al administrador, se usa
   `private.es_admin()` en vez de `private.esta_activo()`. Si cada persona
   solo ve lo suyo, se agrega `usuario_id = (select auth.uid())`.

   Sumar tambien su bloque de prueba en `supabase/tests/rls_test.sql`. Una
   policy sin test es una policy que nadie nota cuando se rompe.

4. **Agregar los tipos** en `src/lib/database.types.ts` y un hook por entidad
   en `src/hooks/`, siguiendo el patron de `useUsuarios`.

5. **Enganchar las pantallas**: la ruta en `src/App.tsx` (dentro de
   `<RequiereAdmin>` si es solo para administradores), el link en el `NAV` de
   `AppLayout` y la tarjeta en `MODULOS` de `Inicio`.

### Que va en `/api` y que no

Las funciones serverless existen **solo** para lo que necesita la
`service_role` key: crear cuentas de Auth, borrarlas, cambiar contrasenas o
el email de login. Todo lo demas va directo del cliente a PostgREST,
protegido por la RLS — incluido cambiar el rol de alguien y activar o
desactivar su cuenta, que son las dos unicas columnas con `grant update` para
el navegador.

`nombre` y `email` quedan deliberadamente **fuera** de ese grant: el email
tiene que cambiar tambien en `auth.users` para que el login siga funcionando,
y eso solo puede hacerlo el servidor. Un update del cliente que los incluya
falla con `permission denied`, no pasa en silencio.

Los endpoints nunca confian en el rol que mande el cliente: lo leen de la
base a partir del JWT que verifican del lado del servidor
(`api/_lib/auth.ts`). Antes de agregar un endpoint conviene preguntarse si no
alcanza con una policy.

## Tests de RLS (pgTAP)

`supabase/tests/rls_test.sql` prueba los permisos contra Postgres de verdad,
no contra una simulacion: siembra cinco personas (un admin, dos usuarios
comunes, un usuario desactivado y un admin desactivado) y, para cada
operacion, se "loguea" como cada una fijando `request.jwt.claim.sub` y el rol
de Postgres —lo mismo que hace PostgREST en produccion— antes de correr la
consulta bajo prueba.

Sin esto, la garantia de "un usuario no ve ni toca datos de otro" vivia solo
en que alguien mirara las policies con cuidado. Con esto queda verificada en
cada corrida: si una migracion futura afloja una policy sin querer, el test
que se rompe dice exactamente cual.

```bash
npm run db:start   # levanta Postgres local (necesita Docker Desktop)
npm run db:test    # corre supabase/tests/*.sql
npm run db:stop    # la apaga
```

`npm run db:reset` vuelve a aplicar las migraciones desde cero si la base
local quedo en un estado que no coincide con los archivos — util despues de
editar una migracion ya aplicada, cosa que en local es normal y en un
proyecto real no deberia hacerse nunca.

Sin Docker no hay como correr esto: es la principal limitacion frente a pegar
los `.sql` a mano en el SQL Editor.

## Deploy

Vercel autodetecta Vite. Hay que cargar las cuatro variables de entorno en
**Settings → Environment Variables** (las dos del servidor sin prefijo).

El `vercel.json` reescribe todo hacia `index.html` **menos** `/api/*`, para
que recargar con F5 en una ruta profunda no de 404 y las funciones sigan
andando.

## PWA y versionado

La app es instalable (manifest + service worker) y cachea de forma segura:
los assets de Vite (`/assets/*`) llevan hash de contenido y se sirven
cache-first; todo lo demas (HTML, `/api/*`, Supabase) es siempre red primero,
para que los datos nunca queden desactualizados.

El nombre del cache incluye el `name` y la `version` de `package.json`, asi
que **hacer una release es un solo paso**: subir el `"version"` (o `npm
version patch`) y desplegar.

## Tema claro/oscuro

`src/lib/tema.ts` guarda la preferencia (`claro` / `oscuro` / `sistema`) en
`localStorage` y aplica la clase `.dark` sobre `<html>`. No usa contexto de
React: el interruptor aparece en pantallas que nunca estan montadas a la vez
y con `useSyncExternalStore` todas ven el mismo valor sin provider.

`index.html` trae un script inline que aplica el tema **antes** del primer
pintado, para que entrar en modo oscuro no muestre un fogonazo blanco. Su
clave de localStorage la inyecta el mismo plugin que calcula la del codigo,
asi que no se pueden desincronizar.

## Comandos

```bash
npm run dev          # servidor de vite
npm run build        # tsc -b && vite build
npm run lint         # oxlint
npm test             # vitest run
npm run iconos       # regenera logo e iconos (necesita `npm i --no-save sharp`)

npm run db:start     # Postgres + Auth + Studio local (necesita Docker)
npm run db:test      # tests pgTAP contra la base local
npm run db:reset     # reaplica las migraciones desde cero
npm run db:stop      # apaga el stack local
```

## Notas

- Los tipos de `src/lib/database.types.ts` estan escritos a mano. Si el
  esquema crece, conviene generar los reales (`npm run tipos`, poniendo antes
  el `project-id` en `package.json`) y agregar un chequeo que compare los
  nombres de las columnas contra el archivo generado: asi una migracion que
  renombra una columna rompe el build en vez de fallar en produccion.
- `npm run lint` y `npm test` corren en segundos y conviene dejarlos verdes.
- La CLI de Supabase esta pinneada como devDependency en vez de asumida
  instalada globalmente, para que `npm run db:*` haga lo mismo en cualquier
  maquina.
