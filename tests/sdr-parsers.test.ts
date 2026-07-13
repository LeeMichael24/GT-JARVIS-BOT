import { describe, it, expect } from 'vitest'
import { parseClaudeResponse } from '@/services/claude/client'

describe('parseClaudeResponse — SDR agent fields', () => {
  const base = { reply: 'Hola', stage: 'warm' }

  it('parses agent_action with all fields', () => {
    const raw = JSON.stringify({
      ...base,
      agent_action: {
        type: 'consult_team',
        reason: 'Client wants furnished apartment not in catalog',
        urgency: 'high',
        client_type: 'corporate',
        follow_up_hint: 'Check with team about furnished options',
      },
    })
    const result = parseClaudeResponse(raw)
    expect(result.agent_action).not.toBeNull()
    expect(result.agent_action!.type).toBe('consult_team')
    expect(result.agent_action!.urgency).toBe('high')
    expect(result.agent_action!.client_type).toBe('corporate')
    expect(result.agent_action!.reason).toContain('furnished')
  })

  it('defaults agent_action to null when missing', () => {
    const result = parseClaudeResponse(JSON.stringify(base))
    expect(result.agent_action).toBeNull()
  })

  it('defaults invalid action type to sell', () => {
    const raw = JSON.stringify({
      ...base,
      agent_action: { type: 'invalid_type', reason: 'test' },
    })
    const result = parseClaudeResponse(raw)
    expect(result.agent_action!.type).toBe('sell')
  })

  it('parses deal_summary with signals', () => {
    const raw = JSON.stringify({
      ...base,
      deal_summary: {
        summary: 'Carlos busca inversión $400k',
        signals: { buying_signals: ['asked about ROI'], engagement_level: 'high' },
        next_action: 'Send payment plan',
      },
    })
    const result = parseClaudeResponse(raw)
    expect(result.deal_summary).not.toBeNull()
    expect(result.deal_summary!.summary).toContain('Carlos')
    expect(result.deal_summary!.signals.buying_signals).toContain('asked about ROI')
    expect(result.deal_summary!.next_action).toBe('Send payment plan')
  })

  it('defaults deal_summary to null when missing', () => {
    const result = parseClaudeResponse(JSON.stringify(base))
    expect(result.deal_summary).toBeNull()
  })

  it('parses brain_observations array', () => {
    const raw = JSON.stringify({
      ...base,
      brain_observations: [
        { category: 'pattern', topic: 'closing', content: 'Urgency works well' },
        { category: 'observation', topic: 'objection', content: 'Price concern' },
      ],
    })
    const result = parseClaudeResponse(raw)
    expect(result.brain_observations).toHaveLength(2)
    expect(result.brain_observations[0].category).toBe('pattern')
  })

  it('defaults brain_observations to empty array when missing', () => {
    const result = parseClaudeResponse(JSON.stringify(base))
    expect(result.brain_observations).toEqual([])
  })

  it('filters invalid brain observations', () => {
    const raw = JSON.stringify({
      ...base,
      brain_observations: [
        { category: 'pattern', topic: 'test', content: 'valid' },
        { invalid: true },
        'not an object',
      ],
    })
    const result = parseClaudeResponse(raw)
    expect(result.brain_observations).toHaveLength(1)
  })

  it('parses interactive_buttons and caps at 3', () => {
    const raw = JSON.stringify({
      ...base,
      interactive_buttons: [
        { id: 'b1', title: 'Option 1' },
        { id: 'b2', title: 'Option 2' },
        { id: 'b3', title: 'Option 3' },
        { id: 'b4', title: 'Option 4' },
      ],
    })
    const result = parseClaudeResponse(raw)
    expect(result.interactive_buttons).toHaveLength(3)
  })

  it('truncates button titles to 20 chars', () => {
    const raw = JSON.stringify({
      ...base,
      interactive_buttons: [
        { id: 'b1', title: 'This is a very long button title that exceeds limit' },
      ],
    })
    const result = parseClaudeResponse(raw)
    expect(result.interactive_buttons[0].title.length).toBeLessThanOrEqual(20)
  })

  it('defaults interactive_buttons to empty array', () => {
    const result = parseClaudeResponse(JSON.stringify(base))
    expect(result.interactive_buttons).toEqual([])
  })

  it('generates button ids when missing', () => {
    const raw = JSON.stringify({
      ...base,
      interactive_buttons: [{ title: 'Click me' }],
    })
    const result = parseClaudeResponse(raw)
    expect(result.interactive_buttons[0].id).toBe('btn_1')
  })
})

describe('parseClaudeResponse — validación de qualification_data', () => {
  const base = { reply: 'Hola', stage: 'warm' }

  it('qualification_data completamente válido pasa sin cambios', () => {
    const raw = JSON.stringify({
      ...base,
      qualification_data: {
        purpose: 'inversion',
        budget_ok: true,
        timeline: '3_meses',
        financing_needed: false,
        decision_maker: true,
      },
    })
    const q = parseClaudeResponse(raw).qualification_data
    expect(q).toEqual({
      purpose: 'inversion',
      budget_ok: true,
      timeline: '3_meses',
      financing_needed: false,
      decision_maker: true,
    })
  })

  it('un campo alucinado → null, los hermanos válidos se conservan', () => {
    const raw = JSON.stringify({
      ...base,
      qualification_data: {
        purpose: 'casa', // no existe en la whitelist
        budget_ok: true,
        timeline: 'inmediato',
        financing_needed: null,
        decision_maker: true,
      },
    })
    const q = parseClaudeResponse(raw).qualification_data
    expect(q.purpose).toBeNull()
    expect(q.budget_ok).toBe(true)
    expect(q.timeline).toBe('inmediato')
    expect(q.financing_needed).toBeNull()
    expect(q.decision_maker).toBe(true)
  })

  it('timeline inválido → null sin afectar purpose válido', () => {
    const raw = JSON.stringify({
      ...base,
      qualification_data: { purpose: 'ambos', timeline: 'ya_mismo' },
    })
    const q = parseClaudeResponse(raw).qualification_data
    expect(q.purpose).toBe('ambos')
    expect(q.timeline).toBeNull()
  })

  it('booleanos deben ser booleanos reales: strings y números → null', () => {
    const raw = JSON.stringify({
      ...base,
      qualification_data: {
        purpose: 'vivienda_propia',
        budget_ok: 'true', // string, no booleano
        financing_needed: 1, // número, no booleano
        decision_maker: false,
      },
    })
    const q = parseClaudeResponse(raw).qualification_data
    expect(q.budget_ok).toBeNull()
    expect(q.financing_needed).toBeNull()
    expect(q.decision_maker).toBe(false)
    expect(q.purpose).toBe('vivienda_propia')
  })

  it('qualification_data no-objeto u omitido → todos los campos null', () => {
    const vacio = {
      purpose: null,
      budget_ok: null,
      timeline: null,
      financing_needed: null,
      decision_maker: null,
    }
    expect(parseClaudeResponse(JSON.stringify(base)).qualification_data).toEqual(vacio)
    expect(parseClaudeResponse(JSON.stringify({
      ...base, qualification_data: 'no soy un objeto',
    })).qualification_data).toEqual(vacio)
  })
})
