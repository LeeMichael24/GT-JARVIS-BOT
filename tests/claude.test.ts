import { describe, it, expect } from 'vitest'
import { parseClaudeResponse } from '@/services/claude/client'

const validResponse = {
  reply: 'Hola Carlos, me alegra que te interese Portacelli. ¿Cuándo piensas comprar?',
  stage: 'warm' as const,
  name_captured: 'Carlos',
  qualification_data: {
    purpose: 'vivienda_propia' as const,
    budget_ok: null,
    timeline: null,
    financing_needed: null,
    decision_maker: null,
  },
  qualified: false,
}

describe('parseClaudeResponse', () => {
  it('parses a valid JSON string', () => {
    const result = parseClaudeResponse(JSON.stringify(validResponse))
    expect(result.reply).toBe(validResponse.reply)
    expect(result.stage).toBe('warm')
    expect(result.name_captured).toBe('Carlos')
    expect(result.qualified).toBe(false)
  })

  it('strips markdown code fences before parsing', () => {
    const wrapped = '```json\n' + JSON.stringify(validResponse) + '\n```'
    const result = parseClaudeResponse(wrapped)
    expect(result.reply).toBe(validResponse.reply)
  })

  it('strips plain code fences before parsing', () => {
    const wrapped = '```\n' + JSON.stringify(validResponse) + '\n```'
    const result = parseClaudeResponse(wrapped)
    expect(result.reply).toBe(validResponse.reply)
  })

  it('uses defaults for missing optional fields', () => {
    const minimal = JSON.stringify({ reply: 'Hola' })
    const result = parseClaudeResponse(minimal)
    expect(result.stage).toBe('new')
    expect(result.name_captured).toBeNull()
    expect(result.qualified).toBe(false)
    expect(result.qualification_data.purpose).toBeNull()
  })

  it('throws when reply field is missing', () => {
    const noReply = JSON.stringify({ stage: 'new' })
    expect(() => parseClaudeResponse(noReply)).toThrow('Invalid Claude response')
  })

  it('throws on completely invalid JSON', () => {
    expect(() => parseClaudeResponse('not json at all')).toThrow()
  })
})
