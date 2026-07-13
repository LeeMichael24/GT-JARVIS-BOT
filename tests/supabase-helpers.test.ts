import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock encadenable genérico de supabase-js
const result: { data: unknown; error: unknown } = { data: null, error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
const methods = ['from', 'select', 'insert', 'update', 'eq', 'order', 'limit', 'maybeSingle', 'single'] as const
for (const m of methods) {
  chain[m] = vi.fn(() => Object.assign(Promise.resolve(result), chain))
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => chain),
}))

import { saveConversation, getLatestUserMessageAt, getLeadById } from '@/lib/supabase'

beforeEach(() => {
  vi.clearAllMocks()
  result.data = null
  result.error = null
})

describe('saveConversation con rol human', () => {
  it('inserta sent_by y wa_message_id para mensajes humanos', async () => {
    await saveConversation({
      leadId: 'lead-1',
      role: 'human',
      content: 'Hola, soy del equipo',
      waMessageId: 'wamid.h1',
      sentBy: 'member-1',
    })
    expect(chain.insert).toHaveBeenCalledWith({
      lead_id: 'lead-1',
      role: 'human',
      content: 'Hola, soy del equipo',
      wa_message_id: 'wamid.h1',
      sent_by: 'member-1',
    })
  })

  it('inserta sent_by null por defecto', async () => {
    await saveConversation({ leadId: 'lead-1', role: 'assistant', content: 'Hola' })
    expect(chain.insert).toHaveBeenCalledWith({
      lead_id: 'lead-1',
      role: 'assistant',
      content: 'Hola',
      wa_message_id: null,
      sent_by: null,
    })
  })
})

describe('saveConversation — dedup por wa_message_id', () => {
  it('devuelve duplicate:false en un insert nuevo', async () => {
    const res = await saveConversation({ leadId: 'lead-1', role: 'user', content: 'Hola', waMessageId: 'wamid.1' })
    expect(res).toEqual({ duplicate: false })
  })

  it('devuelve duplicate:true cuando choca el índice único (23505) — entrega duplicada del webhook', async () => {
    result.error = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const res = await saveConversation({ leadId: 'lead-1', role: 'user', content: 'Hola', waMessageId: 'wamid.1' })
    expect(res).toEqual({ duplicate: true })
  })

  it('devuelve duplicate:true también cuando el error solo menciona "unique"', async () => {
    result.error = { code: '', message: 'violates unique constraint idx_conversations_wa_message_id' }
    const res = await saveConversation({ leadId: 'lead-1', role: 'user', content: 'Hola', waMessageId: 'wamid.1' })
    expect(res).toEqual({ duplicate: true })
  })

  it('lanza en errores que NO son duplicado (no se tragan fallos reales)', async () => {
    result.error = { code: '08006', message: 'connection refused' }
    await expect(
      saveConversation({ leadId: 'lead-1', role: 'user', content: 'Hola' })
    ).rejects.toThrow('saveConversation')
  })
})

describe('getLatestUserMessageAt', () => {
  it('devuelve el created_at del último mensaje del cliente', async () => {
    result.data = [{ created_at: '2026-06-10T12:00:00Z' }]
    const ts = await getLatestUserMessageAt('lead-1')
    expect(ts).toBe('2026-06-10T12:00:00Z')
    expect(chain.eq).toHaveBeenCalledWith('role', 'user')
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(1)
  })

  it('devuelve null si el lead nunca escribió', async () => {
    result.data = []
    expect(await getLatestUserMessageAt('lead-1')).toBeNull()
  })
})

describe('getLeadById', () => {
  it('devuelve el lead', async () => {
    result.data = { id: 'lead-1', phone: '503', bot_active: true }
    const lead = await getLeadById('lead-1')
    expect(lead?.id).toBe('lead-1')
  })

  it('devuelve null si el lead no existe', async () => {
    result.data = null
    expect(await getLeadById('lead-x')).toBeNull()
  })
})
