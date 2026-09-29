import { describe, it, expect, vi, beforeEach } from 'vitest'

const openaiSpy = vi.hoisted(() => ({
  create: vi.fn(async (): Promise<unknown> => ({
    choices: [{ message: { content: '{"reply":"ok"}' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12_000, completion_tokens: 800, prompt_tokens_details: { cached_tokens: 0 } },
  })),
}))
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiSpy.create } }
  },
}))

const budget = vi.hoisted(() => ({
  registrarUso: vi.fn(async () => {}),
}))
vi.mock('@/lib/llm-budget', () => budget)

import { callClaude } from '@/services/claude/client'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.OPENAI_API_KEY = 'sk-test'
})

describe('callClaude — registra lo que cuesta cada llamada (tope de gasto diario)', () => {
  it('con medidor: le entrega modelo y uso, y NO escribe por su cuenta', async () => {
    const medidor = { add: vi.fn(), guardar: vi.fn() }
    await callClaude('system', [], { model: 'gpt-4.1', medidor })
    expect(medidor.add).toHaveBeenCalledWith('gpt-4.1', { prompt_tokens: 12_000, completion_tokens: 800, prompt_tokens_details: { cached_tokens: 0 } })
    expect(budget.registrarUso).not.toHaveBeenCalled()
  })

  it('sin medidor (seguimientos, reflexión): registra la llamada suelta', async () => {
    await callClaude('system', [], { model: 'o4-mini' })
    expect(budget.registrarUso).toHaveBeenCalledWith('o4-mini', expect.objectContaining({ prompt_tokens: 12_000 }))
  })

  it('usa el modelo por defecto cuando no se pide otro', async () => {
    await callClaude('system', [])
    expect(budget.registrarUso).toHaveBeenCalledWith('gpt-4o', expect.anything())
  })

  it('si registrar falla, la respuesta igual sale (medir nunca tumba a Daniela)', async () => {
    budget.registrarUso.mockRejectedValueOnce(new Error('bd caída'))
    await expect(callClaude('system', [])).resolves.toBe('{"reply":"ok"}')
  })

  it('respuesta sin campo usage: no rompe', async () => {
    openaiSpy.create.mockResolvedValueOnce({ choices: [{ message: { content: '{"reply":"ok"}' }, finish_reason: 'stop' }] })
    await expect(callClaude('system', [])).resolves.toBe('{"reply":"ok"}')
  })
})
