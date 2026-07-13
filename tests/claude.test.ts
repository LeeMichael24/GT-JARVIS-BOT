import { describe, it, expect, vi } from 'vitest'
import { parseClaudeResponse, callClaude } from '@/services/claude/client'

const openaiSpy = vi.hoisted(() => ({
  create: vi.fn(async () => ({ choices: [{ message: { content: '{"reply":"ok"}' } }] })),
}))

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiSpy.create } }
  },
}))

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
    // stage omitido → null: el orquestador conserva el stage anterior del lead
    expect(result.stage).toBeNull()
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

  it('parsea opt_out true y default false', () => {
    const base = '{"reply":"ok","stage":"warm"'
    expect(parseClaudeResponse(base + ',"opt_out":true}').opt_out).toBe(true)
    expect(parseClaudeResponse(base + '}').opt_out).toBe(false)
  })
})

describe('parseClaudeResponse — validación de stage', () => {
  it('acepta los cuatro stages válidos sin cambios', () => {
    for (const stage of ['new', 'warm', 'hot', 'cold']) {
      const result = parseClaudeResponse(JSON.stringify({ reply: 'ok', stage }))
      expect(result.stage).toBe(stage)
    }
  })

  it('stage alucinado (string fuera de la whitelist) → null', () => {
    expect(parseClaudeResponse('{"reply":"ok","stage":"qualified"}').stage).toBeNull()
    expect(parseClaudeResponse('{"reply":"ok","stage":"caliente"}').stage).toBeNull()
  })

  it('stage con tipo incorrecto (número) → null', () => {
    expect(parseClaudeResponse('{"reply":"ok","stage":42}').stage).toBeNull()
  })

  it('stage omitido o null → null (el orquestador conserva el anterior)', () => {
    expect(parseClaudeResponse('{"reply":"ok"}').stage).toBeNull()
    expect(parseClaudeResponse('{"reply":"ok","stage":null}').stage).toBeNull()
  })

  it('stage inválido no rompe el resto del parseo (nunca lanza)', () => {
    const result = parseClaudeResponse('{"reply":"ok","stage":"fría","qualified":true}')
    expect(result.reply).toBe('ok')
    expect(result.qualified).toBe(true)
    expect(result.stage).toBeNull()
  })
})

describe('callClaude — mensajes humanos en el contexto', () => {
  it('mapea role human a assistant para el API', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    const history = [
      { id: '1', lead_id: 'l', role: 'user' as const, content: 'Hola', wa_message_id: null, sent_by: null, created_at: '' },
      { id: '2', lead_id: 'l', role: 'human' as const, content: 'Le atiende Michael', wa_message_id: null, sent_by: 'm1', created_at: '' },
      { id: '3', lead_id: 'l', role: 'assistant' as const, content: 'Con gusto', wa_message_id: null, sent_by: null, created_at: '' },
    ]
    await callClaude('system', history)
    const call = (openaiSpy.create.mock.calls[0] as unknown as [{ messages: { role: string }[] }])[0]
    const roles = call.messages.map(m => m.role)
    expect(roles).toEqual(['system', 'user', 'assistant', 'assistant'])
  })
})
