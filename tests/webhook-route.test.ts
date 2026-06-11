import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

const pending = vi.hoisted(() => ({ promises: [] as Promise<unknown>[] }))

vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => { pending.promises.push(p) },
}))

const db = vi.hoisted(() => ({
  upsertLead: vi.fn(),
  updateLead: vi.fn(async () => {}),
  saveConversation: vi.fn(async () => {}),
  getConversationHistory: vi.fn(async () => []),
  isMessageProcessed: vi.fn(async () => false),
  getUnprocessedUserMessages: vi.fn(async () => [] as unknown[]),
  getLeadById: vi.fn(async () => null as unknown),
}))
vi.mock('@/lib/supabase', () => db)

// Sin espera de debounce en tests — vi.hoisted corre ANTES que los imports
// (la ruta lee WA_DEBOUNCE_MS al cargar el módulo)
vi.hoisted(() => { process.env.WA_DEBOUNCE_MS = '0' })

const ai = vi.hoisted(() => ({
  callClaude: vi.fn(async () => '{"reply":"¡Hola!"}'),
  parseClaudeResponse: vi.fn(() => ({
    reply: '¡Hola!', stage: 'new', name_captured: null,
    qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
    qualified: false, schedule_meeting: null,
  })),
}))
vi.mock('@/services/claude/client', () => ai)

const wa = vi.hoisted(() => ({ sendText: vi.fn(async () => 'wamid.out1') }))
vi.mock('@/services/whatsapp/client', () => wa)

vi.mock('@/services/claude/prompts', () => ({ buildSystemPrompt: vi.fn(() => 'prompt') }))
vi.mock('@/services/claude/intent', () => ({
  classifyIntent: vi.fn(() => 'general'),
  extractLastBotMessage: vi.fn(() => null),
}))
vi.mock('@/services/projects/gt-api', () => ({
  getAllProjects: vi.fn(async () => []),
  detectProjectFromMessage: vi.fn(() => null),
}))
vi.mock('@/services/google/calendar', () => ({ createCalendarEvent: vi.fn() }))
vi.mock('@/lib/knowledge-base', () => ({
  getPlaybook: vi.fn(async () => []),
  formatPlaybookForPrompt: vi.fn(() => null),
}))

import { POST } from '@/app/api/webhook/whatsapp/route'

const SECRET = 'test_secret'
process.env.WA_APP_SECRET = SECRET

function buildRequest(): Request {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [{
      id: 'wamid.in1', from: '50312345678', type: 'text',
      text: { body: 'Sigo interesado' }, timestamp: '1716556800',
    }] } }] }],
  })
  const sig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')
  return new Request('http://localhost/api/webhook/whatsapp', {
    method: 'POST',
    body,
    headers: { 'x-hub-signature-256': sig },
  })
}

async function flush() {
  await Promise.all(pending.promises)
  pending.promises.length = 0
}

const baseLead = {
  id: 'lead-1', phone: '50312345678', name: 'Carlos', stage: 'warm',
  project_interest: null, qualification_data: null, assigned_to: null,
  first_message_at: '', last_message_at: '', created_at: '',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('webhook con bot pausado (takeover)', () => {
  it('guarda el mensaje entrante pero NO llama al modelo ni responde', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: false })
    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(db.saveConversation).toHaveBeenCalledTimes(1)
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'lead-1', role: 'user', content: 'Sigo interesado', waMessageId: 'wamid.in1',
    }))
    expect(ai.callClaude).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
  })
})

describe('webhook con bot activo', () => {
  it('envía primero y guarda la respuesta con su wa_message_id', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(ai.callClaude).toHaveBeenCalledTimes(1)
    expect(wa.sendText).toHaveBeenCalledWith('50312345678', '¡Hola!')
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'lead-1', role: 'assistant', content: '¡Hola!', waMessageId: 'wamid.out1',
    }))
  })

  it('no responde si NO es el último mensaje de la ráfaga (debounce)', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
      { id: 'c2', lead_id: 'lead-1', role: 'user', content: 'otra cosa', wa_message_id: 'wamid.in2', sent_by: null, created_at: '' },
    ])
    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(ai.callClaude).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
  })

  it('no responde si un humano tomó el chat DURANTE el debounce', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: false })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(ai.callClaude).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
  })
})
