import { clienteAdmin, exigeAdmin } from '../_lib/auth.js'
import { conManejoDeErrores, error, exigeMetodo, leerBody, type ApiHandler } from '../_lib/http.js'

/**
 * Operaciones de usuarios que NO se pueden hacer desde el navegador porque
 * tocan `auth.users` y eso necesita la service_role key: crear una cuenta,
 * borrarla, cambiar su contrasena o su email de login.
 *
 * Lo que si hace el cliente directo contra PostgREST es cambiar el rol y
 * activar/desactivar: son las unicas dos columnas con `grant update` para
 * `authenticated`, y la policy ya exige ser admin (ver
 * supabase/migrations/002_rls.sql). Antes de agregar una accion aca conviene
 * preguntarse si no alcanza con una policy.
 *
 * Todas las acciones exigen rol admin, y el rol del que llama se lee de la
 * base a partir del JWT verificado: nunca de lo que mande el cliente.
 */

const LARGO_MINIMO_PASSWORD = 8

interface Body {
  accion?: 'crear' | 'editar' | 'password' | 'eliminar'
  id?: string
  nombre?: string
  email?: string
  password?: string
  rol?: string
}

const handler: ApiHandler = async (req, res) => {
  if (!exigeMetodo(req, res, 'POST')) return

  const actor = await exigeAdmin(req, res)
  if (!actor) return

  const body = leerBody<Body>(req)
  const admin = clienteAdmin()

  switch (body.accion) {
    // ─────────────────────────────────────────────────────────
    // Crea la cuenta en Auth y su perfil. Son dos escrituras que tienen que
    // pasar o fallar juntas: si la segunda falla, se borra la de Auth, si no
    // queda una cuenta huerfana que ademas bloquea ese email para siempre.
    case 'crear': {
      const nombre = body.nombre?.trim()
      const email = body.email?.trim().toLowerCase()
      const password = body.password ?? ''
      const rol = body.rol === 'admin' ? 'admin' : 'usuario'

      if (!nombre) return error(res, 400, 'Falta el nombre.')
      if (!email) return error(res, 400, 'Falta el email.')
      if (password.length < LARGO_MINIMO_PASSWORD) {
        return error(res, 400, `La contrasena necesita al menos ${LARGO_MINIMO_PASSWORD} caracteres.`)
      }

      const { data: existente } = await admin
        .from('usuarios')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (existente) return error(res, 409, 'Ya existe un usuario con ese email.')

      const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (errCrear || !creado.user) {
        const yaExiste = /already|registered|exists/i.test(errCrear?.message ?? '')
        return error(
          res,
          yaExiste ? 409 : 400,
          yaExiste ? 'Ya existe un usuario con ese email.' : 'No se pudo crear el usuario.',
        )
      }

      const { error: errPerfil } = await admin
        .from('usuarios')
        .insert({ id: creado.user.id, nombre, email, rol })
      if (errPerfil) {
        await admin.auth.admin.deleteUser(creado.user.id)
        return error(res, 400, 'No se pudo crear el perfil del usuario.')
      }

      res.status(200).json({ ok: true, id: creado.user.id })
      return
    }

    // ─────────────────────────────────────────────────────────
    // Nombre y email. El email vive en dos lados -- `usuarios` y
    // `auth.users` -- y hay que cambiarlo en los dos: si solo se cambiara el
    // perfil, la persona veria un email con el que en realidad no puede
    // iniciar sesion.
    case 'editar': {
      if (!body.id) return error(res, 400, 'Falta el usuario.')
      const nombre = body.nombre?.trim()
      const email = body.email?.trim().toLowerCase()
      if (!nombre) return error(res, 400, 'Falta el nombre.')
      if (!email) return error(res, 400, 'Falta el email.')

      const { data: objetivo } = await admin
        .from('usuarios')
        .select('email')
        .eq('id', body.id)
        .maybeSingle()
      if (!objetivo) return error(res, 404, 'Usuario no encontrado.')

      if (email !== objetivo.email) {
        const { error: errEmail } = await admin.auth.admin.updateUserById(body.id, {
          email,
          email_confirm: true,
        })
        if (errEmail) {
          const yaExiste = /already|registered|exists/i.test(errEmail.message)
          return error(
            res,
            yaExiste ? 409 : 400,
            yaExiste ? 'Ya existe un usuario con ese email.' : 'No se pudo cambiar el email.',
          )
        }
      }

      const { error: errPerfil } = await admin
        .from('usuarios')
        .update({ nombre, email })
        .eq('id', body.id)
      if (errPerfil) return error(res, 400, 'No se pudo guardar el usuario.')

      res.status(200).json({ ok: true })
      return
    }

    // ─────────────────────────────────────────────────────────
    // Contrasena de OTRA persona. La propia se cambia por
    // /api/cuenta/password, que no exige ser admin.
    case 'password': {
      if (!body.id) return error(res, 400, 'Falta el usuario.')
      const password = body.password ?? ''
      if (password.length < LARGO_MINIMO_PASSWORD) {
        return error(res, 400, `La contrasena necesita al menos ${LARGO_MINIMO_PASSWORD} caracteres.`)
      }

      const { error: errUpd } = await admin.auth.admin.updateUserById(body.id, { password })
      if (errUpd) return error(res, 400, 'No se pudo cambiar la contrasena.')

      res.status(200).json({ ok: true })
      return
    }

    // ─────────────────────────────────────────────────────────
    // Borra la cuenta entera. Nadie puede borrar la propia: es lo que evita
    // que el ultimo admin deje al sistema sin administradores (la RLS ya le
    // impide bajarse de rol o desactivarse).
    case 'eliminar': {
      if (!body.id) return error(res, 400, 'Falta el usuario.')
      if (body.id === actor.id) return error(res, 400, 'No podes eliminar tu propia cuenta.')

      // Borrar de auth.users arrastra la fila de `usuarios` por el
      // `on delete cascade` de la foreign key.
      const { error: errBorrar } = await admin.auth.admin.deleteUser(body.id)
      if (errBorrar) return error(res, 400, 'No se pudo eliminar la cuenta.')

      res.status(200).json({ ok: true })
      return
    }

    default:
      return error(res, 400, 'Accion desconocida.')
  }
}

export default conManejoDeErrores(handler)
