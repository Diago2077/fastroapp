import { Link } from 'react-router-dom'

export default function NoEncontrado() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-4xl font-semibold text-muted-foreground">404</p>
      <p className="text-sm text-muted-foreground">Esta pagina no existe.</p>
      <Link
        to="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
