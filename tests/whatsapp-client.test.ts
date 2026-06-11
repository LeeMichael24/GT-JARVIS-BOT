import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateTypingDelay, sendText } from '@/services/whatsapp/client'

describe('calculateTypingDelay', () => {
  it('returns minimum 1500ms for very short messages', () => {
    expect(calculateTypingDelay('Hola')).toBe(1500)
    expect(calculateTypingDelay('')).toBe(1500)
  })

  it('returns maximum 4000ms for very long messages', () => {
    expect(calculateTypingDelay('a'.repeat(500))).toBe(4000)
  })

  it('scales proportionally for medium-length messages (80 chars = 2400ms)', () => {
    expect(calculateTypingDelay('a'.repeat(80))).toBe(2400)
  })

  it('returns exactly 1500 for messages up to 50 chars', () => {
    expect(calculateTypingDelay('a'.repeat(50))).toBe(1500)
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
