import { describe, it, expect } from 'vitest'
import { matchKeywordRules, formatConditionalRulesForPrompt, formatEscalationRulesForPrompt } from '@/lib/escalation-rules'
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
// con los disparadores nuevos de dinero y documentos legales, incluyendo
// las variantes sin tilde ('numero de cuenta', 'deposito bancario') y sin
// el 'depósito' suelto (que coincidía con preguntas normales de alquiler).
const activeRules: EscalationRule[] = [
  rule('cuenta bancaria'),
  rule('número de cuenta'),
  rule('numero de cuenta'),
  rule('transferencia'),
  rule('depósito bancario'),
  rule('deposito bancario'),
  rule('hacer un depósito'),
  rule('hacer un deposito'),
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

  it('detecta variantes sin tilde de los mismos disparadores', () => {
    expect(matchKeywordRules('cual es el numero de cuenta', activeRules).map(r => r.trigger_value))
      .toContain('numero de cuenta')
    expect(matchKeywordRules('quiero hacer un deposito bancario', activeRules).map(r => r.trigger_value))
      .toEqual(expect.arrayContaining(['deposito bancario']))
  })

  it('NO dispara con una pregunta normal de depósito de alquiler', () => {
    expect(matchKeywordRules('¿cuánto es el depósito de esa casa en renta?', activeRules)).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────
// Reglas topic/condition: van al prompt para que el modelo las evalúe
// ─────────────────────────────────────────────────────────────

describe('formatConditionalRulesForPrompt', () => {
  it('formatea reglas topic y condition para el prompt', () => {
    const out = formatConditionalRulesForPrompt([
      rule('negociacion', { trigger_type: 'topic', description: 'Cualquier negociación activa' }),
      rule('legal', { trigger_type: 'topic', action: 'consult_team' }),
      rule('precio final', {}), // keyword: NO va aquí, ya la cubre matchKeywordRules
    ])
    expect(out).toContain('negociacion')
    expect(out).toContain('Cualquier negociación activa')
    expect(out).toContain('consult_team')
    expect(out).not.toContain('precio final')
  })

  it('incluye reglas condition', () => {
    const out = formatConditionalRulesForPrompt([
      rule('cliente corporativo con presupuesto >$200k', { trigger_type: 'condition' }),
    ])
    expect(out).toContain('cliente corporativo con presupuesto >$200k')
    expect(out).toContain('escalate_ceo')
  })

  it('sin reglas contextuales devuelve cadena vacía', () => {
    expect(formatConditionalRulesForPrompt([rule('precio final')])).toBe('')
    expect(formatConditionalRulesForPrompt([])).toBe('')
  })
})

describe('tono profesional en los prompts de escalamiento', () => {
  it('formatEscalationRulesForPrompt exige tono sobrio (sin emojis ni exclamaciones)', () => {
    const out = formatEscalationRulesForPrompt([rule('cuenta bancaria')])
    expect(out).toContain('TONO')
    expect(out).toContain('sin emojis')
    expect(out).toContain('sin signos de exclamación')
  })

  it('formatConditionalRulesForPrompt exige el mismo tono sobrio', () => {
    const out = formatConditionalRulesForPrompt([rule('negociacion', { trigger_type: 'topic' })])
    expect(out).toContain('sin emojis')
    expect(out).toContain('sin signos de exclamación')
  })
})

describe('expectativa de respuesta en los prompts de escalamiento', () => {
  it('formatEscalationRulesForPrompt pide avisar que el CEO responde en minutos', () => {
    const out = formatEscalationRulesForPrompt([rule('contrato')])
    expect(out).toContain('responde en los próximos minutos')
  })

  it('formatConditionalRulesForPrompt pide la misma expectativa', () => {
    const out = formatConditionalRulesForPrompt([rule('negociacion', { trigger_type: 'topic' })])
    expect(out).toContain('responde en los próximos minutos')
  })
})
