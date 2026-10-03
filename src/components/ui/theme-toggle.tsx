import { Monitor, Moon, Sun } from 'lucide-react'
import { useTema } from '@/hooks/useTema'
import { siguienteTema, type Tema } from '@/lib/tema'
import { Button } from './button'

const ICONO: Record<Tema, typeof Sun> = {
  sistema: Monitor,
  claro: Sun,
  oscuro: Moon,
}

const TITULO: Record<Tema, string> = {
  sistema: 'Tema: el del sistema',
  claro: 'Tema: claro',
  oscuro: 'Tema: oscuro',
}

/**
 * Un solo boton que cicla sistema → claro → oscuro. Ocupa lo mismo que los
 * demas iconos de la barra; un desplegable con tres opciones seria mas
 * explicito pero tambien mas ruidoso para algo que se toca una vez.
 */
export function ThemeToggle() {
  const { tema, setTema } = useTema()
  const Icono = ICONO[tema]

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTema(siguienteTema(tema))}
      title={TITULO[tema]}
      aria-label={TITULO[tema]}
    >
      <Icono />
    </Button>
  )
}
