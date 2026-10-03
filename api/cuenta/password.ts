import { clienteAdmin, exigeUsuario } from '../_lib/auth.js'
import { conManejoDeErrores, error, exigeMetodo, leerBody, type ApiHandler } from '../_lib/http.js'

/**
 * Cualquier usuario autenticado (admin o no) cambia SU PROPIA contrasena. A
 * diferencia de api/admin/usuarios.ts -- que gestiona a OTROS y por eso exige
 * rol admin -- aca el id nunca sale del body: siempre es el del actor del
 * token verificado, asi que no hay forma de apuntar a otra cuenta aunque se
 * manipule la request.
 */

const LARGO_MINIMO_PASSWORD = 8

interface Body {
  password?: string
}

const handler: ApiHandler = async (req, res) => {
  if (!exigeMetodo(req, res, 'POST')) return

  const actor = await exigeUsuario(req, res)
  if (!actor) return

  const body = leerBody<Body>(req)
  const password = body.password ?? ''
  if (password.length < LARGO_MINIMO_PASSWORD) {
    return error(res, 400, `La contrasena necesita al menos ${LARGO_MINIMO_PASSWORD} caracteres.`)
  }

  const admin = clienteAdmin()
  const { error: errUpd } = await admin.auth.admin.updateUserById(actor.id, { password })
  if (errUpd) return error(res, 400, 'No se pudo cambiar la contrasena.')

  res.status(200).json({ ok: true })
}

export default conManejoDeErrores(handler)
