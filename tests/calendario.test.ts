import { describe, it, expect } from 'vitest'
import { calendarioProximo, horaActualSV } from '@/lib/calendario'

describe('calendarioProximo — fechas que Daniela no tiene que calcular', () => {
  it('lista hoy, mañana y los días siguientes con día de la semana y fecha', () => {
    // lunes 28-sep-2026, 09:00 en El Salvador (15:00 UTC)
    const c = calendarioProximo(new Date('2026-09-28T15:00:00Z'))
    expect(c).toContain('hoy lunes 28 de septiembre')
    expect(c).toContain('mañana martes 29 de septiembre')
    expect(c).toContain('miércoles 30 de septiembre')
    expect(c).toContain('jueves 1 de octubre')
    expect(c).toContain('sábado 3 de octubre')
    expect(c).toContain('domingo 4 de octubre')
  })

  it('usa la zona horaria de El Salvador, no la del servidor: 03:54 UTC del 29 sigue siendo lunes 28', () => {
    const c = calendarioProximo(new Date('2026-09-29T03:54:00Z'))
    expect(c).toContain('hoy lunes 28 de septiembre')
    expect(c).not.toContain('hoy martes')
  })

  it('cruza fin de mes y de año', () => {
    expect(calendarioProximo(new Date('2026-12-30T18:00:00Z'))).toContain('viernes 1 de enero')
  })

  it('cubre 8 días por defecto', () => {
    const c = calendarioProximo(new Date('2026-09-28T15:00:00Z'))
    expect(c.split(';').length).toBe(8)
  })
})

describe('horaActualSV', () => {
  it('da la hora local de El Salvador en 24 h', () => {
    expect(horaActualSV(new Date('2026-09-29T03:54:00Z'))).toBe('21:54')
    expect(horaActualSV(new Date('2026-09-28T15:05:00Z'))).toBe('09:05')
  })
})
