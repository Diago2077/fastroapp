import { describe, expect, it } from 'vitest'
import { formatFecha, formatFechaHora, normalizar } from './format'

describe('formatFecha', () => {
  it('pasa de ISO a dd/mm/aaaa', () => {
    expect(formatFecha('2026-08-03')).toBe('03/08/2026')
  })

  it('recorta la hora de un timestamp', () => {
    expect(formatFecha('2026-08-03T15:30:00Z')).toBe('03/08/2026')
  })

  it('muestra un guion cuando no hay fecha', () => {
    expect(formatFecha(null)).toBe('—')
  })

  it('deja pasar lo que no tiene forma de fecha', () => {
    expect(formatFecha('manana')).toBe('manana')
  })
})

describe('formatFechaHora', () => {
  it('muestra un guion cuando la fecha no es valida', () => {
    expect(formatFechaHora('no-es-una-fecha')).toBe('—')
    expect(formatFechaHora(undefined)).toBe('—')
  })
})

describe('normalizar', () => {
  it('saca tildes y mayusculas para poder buscar', () => {
    expect(normalizar('Categoría')).toBe('categoria')
  })

  it('tambien convierte la ñ en n', () => {
    // Efecto de descomponer en NFD y sacar todos los diacriticos. Es lo que
    // se busca: escribiendo "nandu" se encuentra "ñandú".
    expect(normalizar('  ÑANDÚ ')).toBe('nandu')
  })
})
