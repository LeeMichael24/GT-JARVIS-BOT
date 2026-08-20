import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getServiceClient: vi.fn(() => ({ from: vi.fn() })),
}))
vi.mock('@/services/claude/client', () => ({
  callClaude: vi.fn(async () => '{"learnings": []}'),
}))
vi.mock('@/lib/agent-settings', () => ({
  getAgentSettings: vi.fn(async () => ({ reflection_temperature: 0.3 })),
}))

import { buildTrainingPrompt, toTrainingProposals } from '@/lib/training'

describe('buildTrainingPrompt', () => {
  it('incluye el transcript y los temas existentes para no duplicar', () => {
    const prompt = buildTrainingPrompt('CLIENTE: hola\nEQUIPO: buenas', ['precios', 'objecion_lejania'])
    expect(prompt).toContain('CLIENTE: hola')
    expect(prompt).toContain('- precios')
    expect(prompt).toContain('- objecion_lejania')
    expect(prompt).toContain('JSON')
  })

  it('sin temas existentes indica (ninguno)', () => {
    expect(buildTrainingPrompt('x', [])).toContain('(ninguno)')
  })
})

describe('toTrainingProposals', () => {
  it('mapea categorías del análisis a las del cerebro con confianza 0.85', () => {
    const proposals = toTrainingProposals({
      learnings: [
        { category: 'pattern', topic: 'Cierre con visita', content: 'Ofrecer visita tras 2 preguntas de precio' },
        { category: 'objection_response', topic: 'Está caro', content: 'Validar y reencuadrar a cuota' },
        { category: 'knowledge', topic: 'Prima Foresta', content: 'Prima del 20% en Foresta' },
        { category: 'mistake', topic: 'No presionar', content: 'Presionar con urgencia falsa enfría al cliente' },
      ],
    })
    expect(proposals).toHaveLength(4)
    expect(proposals[0].category).toBe('pattern')
    expect(proposals[1].category).toBe('pattern')
    expect(proposals[2].category).toBe('observation')
    expect(proposals[3].category).toBe('correction')
    expect(proposals.every(p => p.confidence === 0.85)).toBe(true)
  })

  it('descarta entradas malformadas y respeta el máximo por chunk', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      category: 'pattern', topic: `t${i}`, content: `c${i}`,
    }))
    const proposals = toTrainingProposals({ learnings: [...many, { category: 'pattern' }, null, 'basura'] })
    expect(proposals.length).toBeLessThanOrEqual(8)
    expect(proposals.every(p => p.topic && p.content)).toBe(true)
  })

  it('JSON inesperado → lista vacía (nunca lanza)', () => {
    expect(toTrainingProposals(null)).toEqual([])
    expect(toTrainingProposals({})).toEqual([])
    expect(toTrainingProposals({ learnings: 'no-array' })).toEqual([])
  })

  it('trunca topic a 80 y content a 450 caracteres', () => {
    const proposals = toTrainingProposals({
      learnings: [{ category: 'pattern', topic: 'x'.repeat(200), content: 'y'.repeat(1000) }],
    })
    expect(proposals[0].topic).toHaveLength(80)
    expect(proposals[0].content).toHaveLength(450)
  })
})
