import { describe, it, expect } from 'vitest'
import { formatLeadDigest, type LeadDigestRow } from '@/lib/analytics'

function fila(over: Partial<LeadDigestRow> = {}): LeadDigestRow {
  return {
    id: 'l1', name: 'Marcelo Díaz', phone: '50377772222',
    stage: 'hot', score: 'A', project: 'Portacelli Alta',
    summary: 'Interesado en inversión, espera contacto con el CEO.',
    nextAction: 'Que Michael lo contacte esta semana.',
    botActive: true, daysIdle: 0,
    ...over,
  }
}

describe('formatLeadDigest — el reporte baja al cliente, no se queda en totales', () => {
  it('sin leads no imprime nada (el reporte agregado sale igual)', () => {
    expect(formatLeadDigest([])).toBe('')
  })

  it('cada lead trae quién es, dónde quedó y qué sigue', () => {
    const out = formatLeadDigest([fila()])
    expect(out).toContain('Cliente por cliente:')
    expect(out).toContain('Marcelo Díaz')
    expect(out).toContain('Portacelli Alta')
    expect(out).toContain('caliente, A')
    expect(out).toContain('espera contacto con el CEO')
    expect(out).toContain('Siguiente: Que Michael lo contacte')
  })

  it('sin nombre cae al teléfono', () => {
    expect(formatLeadDigest([fila({ name: null })])).toContain('50377772222')
  })

  it('avisa cuando el lead lo lleva un humano', () => {
    expect(formatLeadDigest([fila({ botActive: false })])).toContain('lo lleva un humano')
  })

  it('marca el silencio a partir de 3 días', () => {
    expect(formatLeadDigest([fila({ daysIdle: 5 })])).toContain('5 días sin escribir')
    expect(formatLeadDigest([fila({ daysIdle: 2 })])).not.toContain('días sin escribir')
  })

  it('un lead sin resumen todavía no rompe la línea', () => {
    const out = formatLeadDigest([fila({ summary: null, nextAction: null })])
    expect(out).toContain('Marcelo Díaz')
    expect(out).not.toContain('Siguiente:')
  })

  it('trunca antes de pasarse del límite de WhatsApp y dice cuántos faltan', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => fila({ id: `l${i}`, name: `Cliente ${i}` }))
    const out = formatLeadDigest(muchos, 600)
    expect(out.length).toBeLessThanOrEqual(700)
    expect(out).toContain('más en el panel')
  })

  it('traduce los stages al español', () => {
    expect(formatLeadDigest([fila({ stage: 'warm' })])).toContain('tibio')
    expect(formatLeadDigest([fila({ stage: 'cold' })])).toContain('frío')
    expect(formatLeadDigest([fila({ stage: 'new' })])).toContain('nuevo')
  })
})
