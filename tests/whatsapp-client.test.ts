import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateTypingDelay, sendText, sendTemplate, markAsRead, sendTypingIndicator } from '@/services/whatsapp/client'

describe('calculateTypingDelay', () => {
  it('returns minimum 1200ms for very short messages', () => {
    expect(calculateTypingDelay('Hola')).toBe(1200)
    expect(calculateTypingDelay('')).toBe(1200)
  })

  it('returns maximum 2600ms for very long messages', () => {
    expect(calculateTypingDelay('a'.repeat(500))).toBe(2600)
  })

  it('scales proportionally for medium-length messages (80 chars = 1760ms)', () => {
    expect(calculateTypingDelay('a'.repeat(80))).toBe(1760)
  })

  it('returns exactly 1200 for messages up to ~54 chars', () => {
    expect(calculateTypingDelay('a'.repeat(50))).toBe(1200)
  })
})

describe('sendText — wa_message_id y delay', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.WA_ACCESS_TOKEN = 'token'
    process.env.WA_PHONE_NUMBER_ID = '12345'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('devuelve el id del mensaje que responde Meta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.out99' }] }),
      text: async () => '',
    })))
    const id = await sendText('50312345678', 'Hola', { typingDelay: false })
    expect(id).toBe('wamid.out99')
  })

  it('devuelve null si Meta no incluye id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    })))
    const id = await sendText('50312345678', 'Hola', { typingDelay: false })
    expect(id).toBeNull()
  })

  it('con typingDelay:false no espera el delay artificial', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.x' }] }),
      text: async () => '',
    })))
    const promise = sendText('50312345678', 'mensaje largo de prueba para delay', { typingDelay: false })
    // Sin avanzar timers debe resolver (no hay setTimeout pendiente)
    await expect(promise).resolves.toBe('wamid.x')
  })
})

describe('markAsRead y sendTypingIndicator — visto y "escribiendo..."', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.WA_ACCESS_TOKEN = 'token'
    process.env.WA_PHONE_NUMBER_ID = '12345'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('markAsRead envía status:read con el message_id (visto azul)', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({}), text: async () => '' }
    }))
    await markAsRead('wamid.in7')
    expect(calls[0]).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.in7',
    })
  })

  it('sendTypingIndicator agrega typing_indicator (puntos de escribiendo)', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({}), text: async () => '' }
    }))
    await sendTypingIndicator('wamid.in7')
    expect(calls[0]).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.in7',
      typing_indicator: { type: 'text' },
    })
  })

  it('si Meta responde error, loguea warning pero NO lanza (no mata el flujo)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 400,
      json: async () => ({}), text: async () => '{"error":"bad request"}',
    })))
    await expect(markAsRead('wamid.in7')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('markAsRead failed (400)'), expect.any(String))
  })

  it('usa la versión v23.0 de la Cloud API (typing requiere versión reciente)', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      return { ok: true, json: async () => ({}), text: async () => '' }
    }))
    await sendTypingIndicator('wamid.in7')
    expect(urls[0]).toContain('graph.facebook.com/v23.0/')
  })
})

describe('sendTemplate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.WA_ACCESS_TOKEN = 'token'
    process.env.WA_PHONE_NUMBER_ID = '12345'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envía el payload de plantilla correcto y devuelve el id', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.t1' }] }), text: async () => '' }
    }))
    const id = await sendTemplate('50312345678', 'recontacto_seguimiento', 'es', ['Carlos', 'Portacelli'])
    expect(id).toBe('wamid.t1')
    expect(calls[0]).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '50312345678',
      type: 'template',
      template: {
        name: 'recontacto_seguimiento',
        language: { code: 'es' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: 'Carlos' },
            { type: 'text', text: 'Portacelli' },
          ],
        }],
      },
    })
  })

  it('sin variables omite components', async () => {
    const calls: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.t2' }] }), text: async () => '' }
    }))
    await sendTemplate('503', 'hola_simple', 'es', [])
    expect((calls[0] as { template: { components?: unknown } }).template.components).toBeUndefined()
  })
})
