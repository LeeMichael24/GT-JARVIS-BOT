import { describe, it, expect } from 'vitest'
import { matchKeywordRules } from '@/lib/escalation-rules'
import type { EscalationRule } from '@/types'

function rule(trigger_value: string, overrides: Partial<EscalationRule> = {}): EscalationRule {
  return {
    id: 'r-' + trigger_value,
    trigger_type: 'keyword',
    trigger_value,
    description: null,
    action: 'escalate_ceo',
    active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

// Refleja el rule set activo DESPUÉS de la migración 013: sin 'descuento',
// con los disparadores nuevos de dinero y documentos legales.
const activeRules: EscalationRule[] = [
  rule('cuenta bancaria'),
  rule('número de cuenta'),
  rule('transferencia'),
  rule('depósito'),
  rule('promesa de venta'),
  rule('promesa de compraventa'),
  rule('documento de reserva'),
  rule('notario'),
  rule('precio final'),
  rule('escritura'),
  rule('contrato'),
  rule('firma'),
]

describe('matchKeywordRules — disparadores duros de traspaso', () => {
  it('detecta mención de cuenta bancaria o transferencia de dinero', () => {
    const matched = matchKeywordRules('¿A qué cuenta bancaria hago la transferencia?', activeRules)
    const values = matched.map(r => r.trigger_value)
    expect(values).toContain('cuenta bancaria')
    expect(values).toContain('transferencia')
  })

  it('detecta documentos legales de cierre', () => {
    const matched = matchKeywordRules('¿Cuándo firmamos la promesa de compraventa con el notario?', activeRules)
    const values = matched.map(r => r.trigger_value)
    expect(values).toContain('promesa de compraventa')
    expect(values).toContain('notario')
  })

  it('NO dispara con el copy normal de urgencia de Daniela ("se están reservando rápido")', () => {
    expect(matchKeywordRules('Las unidades se están reservando súper rápido esta semana', activeRules)).toEqual([])
  })

  it('"descuento" ya no es un disparador del rule set activo', () => {
    expect(matchKeywordRules('¿Tienen algún descuento por pronto pago?', activeRules)).toEqual([])
  })

  it('sigue detectando los disparadores existentes (precio final, contrato, firma, escritura)', () => {
    const matched = matchKeywordRules('Ya quiero el precio final y firmar el contrato', activeRules)
    const values = matched.map(r => r.trigger_value)
    expect(values).toContain('precio final')
    expect(values).toContain('contrato')
  })
})
