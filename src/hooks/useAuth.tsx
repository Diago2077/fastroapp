import type { Session, User } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Rol, Usuario } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  /** Fila de `usuarios`: el perfil. `null` mientras carga o si no existe. */
  usuario: Usuario | null
  rol: Rol | null
  /** Conveniencia: `rol === 'admin'`. Es lo que decide que se ve en la UI. */
  esAdmin: boolean
  loading: boolean
  /**
   * Hay sesion valida pero algo impide usar la app:
   * - 'sin-perfil': la fila de `usuarios` no existe (la cuenta se creo en el
   *   dashboard de Supabase y nadie corrio el alta correspondiente).
   * - 'inactivo': la cuenta fue desactivada.
   * Sin esto, la pantalla queda en blanco en vez de explicar por que.
   */
  problemaPerfil: 'sin-perfil' | 'inactivo' | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refrescarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [problemaPerfil, setProblemaPerfil] = useState<AuthState['problemaPerfil']>(null)
  const [loading, setLoading] = useState(true)

  // Evita que una carga de perfil vieja pise a una nueva al cambiar de sesion
  const cargaActual = useRef(0)

  /**
   * Devuelve si esta carga seguia siendo la vigente al terminar (su token no
   * fue superado por otra carga mas nueva). Al montar la app se disparan dos
   * cargas casi simultaneas para el mismo usuario -- el INITIAL_SESSION que
   * emite onAuthStateChange al suscribirse, y el getSession() inicial -- y
   * sin este valor el llamador perdedor apagaba el loading igual, con el
   * perfil todavia en null: el guard de un layout llegaba a ver
   * loading=false + usuario=null y redirigia por creer que no habia sesion,
   * justo antes de que la carga ganadora escribiera los datos reales. Pasaba
   * siempre entrando por URL directa o F5 (remonta el provider) y nunca
   * navegando con los links (el provider ya esta montado).
   */
  const cargarPerfil = useCallback(async (userId: string | undefined): Promise<boolean> => {
    const token = ++cargaActual.current

    if (!userId) {
      setUsuario(null)
      setProblemaPerfil(null)
      return true
    }

    const { data: fila, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (token !== cargaActual.current) return false

    if (error || !fila) {
      setUsuario(null)
      setProblemaPerfil('sin-perfil')
      return true
    }

    const perfil = fila as Usuario
    setUsuario(perfil)
    setProblemaPerfil(perfil.activo ? null : 'inactivo')
    return true
  }, [])

  useEffect(() => {
    let vivo = true
    // Compara el usuario, no el nombre del evento: supabase-js revalida la
    // sesion cada vez que la pestana recupera el foco, y segun la version
    // eso puede disparar 'SIGNED_IN' (no solo 'TOKEN_REFRESHED') aunque sea
    // el mismo usuario de siempre. Si a eso se le hace setLoading(true), el
    // AppLayout desmonta el Outlet y se pierde cualquier formulario a medio
    // llenar. Reaccionar solo a un cambio real de usuario evita el problema
    // sin depender de que lista de eventos haya que ignorar.
    const usuarioIdAnterior = { current: undefined as string | undefined }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!vivo) return
      usuarioIdAnterior.current = data.session?.user?.id
      setSession(data.session)
      const vigente = await cargarPerfil(data.session?.user?.id)
      if (vivo && vigente) setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_evento, nuevaSesion) => {
      if (!vivo) return
      setSession(nuevaSesion)

      const idNuevo = nuevaSesion?.user?.id
      if (idNuevo === usuarioIdAnterior.current) return
      usuarioIdAnterior.current = idNuevo

      setLoading(true)
      const vigente = await cargarPerfil(idNuevo)
      if (vivo && vigente) setLoading(false)
    })

    return () => {
      vivo = false
      subscription.unsubscribe()
    }
  }, [cargarPerfil])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    // No se expone el mensaje crudo de Supabase: filtra si el email existe o no
    if (error) {
      const esCredencial = /invalid login|credentials/i.test(error.message)
      return {
        error: esCredencial
          ? 'Email o contrasena incorrectos.'
          : 'No se pudo iniciar sesion. Intentalo de nuevo.',
      }
    }
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUsuario(null)
    setProblemaPerfil(null)
  }, [])

  const refrescarPerfil = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await cargarPerfil(data.session?.user?.id)
  }, [cargarPerfil])

  const valor = useMemo<AuthState>(() => {
    // Una cuenta desactivada no conserva su rol para la UI: la RLS ya no le
    // devuelve nada, y mostrarle las pantallas de admin seria mentirle.
    const rol = usuario?.activo ? usuario.rol : null
    return {
      session,
      user: session?.user ?? null,
      usuario,
      rol,
      esAdmin: rol === 'admin',
      loading,
      problemaPerfil,
      signIn,
      signOut,
      refrescarPerfil,
    }
  }, [session, usuario, loading, problemaPerfil, signIn, signOut, refrescarPerfil])

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth tiene que usarse dentro de <AuthProvider>')
  return ctx
}
