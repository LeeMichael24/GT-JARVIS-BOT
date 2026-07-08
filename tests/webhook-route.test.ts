import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

const pending = vi.hoisted(() => ({ promises: [] as Promise<unknown>[] }))

vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => { pending.promises.push(p) },
}))

const db = vi.hoisted(() => ({
  getServiceClient: vi.fn(() => ({})),
  upsertLead: vi.fn(),
  updateLead: vi.fn(async () => {}),
  saveConversation: vi.fn(async () => {}),
  getConversationHistory: vi.fn(async () => []),
  isMessageProcessed: vi.fn(async () => false),
  getUnprocessedUserMessages: vi.fn(async () => [] as unknown[]),
  getLeadById: vi.fn(async () => null as unknown),
  getDealSummary: vi.fn(async () => null as unknown),
  upsertDealSummary: vi.fn(async () => {}),
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
    qualified: false, schedule_meeting: null, opt_out: false,
    agent_action: null, deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
  })),
}))
vi.mock('@/services/claude/client', () => ai)

const wa = vi.hoisted(() => ({
  sendText: vi.fn(async () => 'wamid.out1'),
  sendInteractiveButtons: vi.fn(async () => 'wamid.out1'),
  sendDocument: vi.fn(async () => 'wamid.doc1'),
  sendImage: vi.fn(async () => 'wamid.img1'),
  sendInternalNotification: vi.fn(async () => {}),
  downloadMedia: vi.fn(async () => ({ buffer: Buffer.from(''), mimeType: 'audio/ogg' })),
  markAsRead: vi.fn(async () => {}),
  sendTypingIndicator: vi.fn(async () => {}),
}))
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
vi.mock('@/services/openai/whisper', () => ({ transcribeAudio: vi.fn(async () => 'transcribed text') }))
vi.mock('@/lib/knowledge-base', () => ({
  getPlaybook: vi.fn(async () => []),
  formatPlaybookForPrompt: vi.fn(() => null),
}))
vi.mock('@/lib/lead-sources', () => ({
  saveLeadSource: vi.fn(async () => ({})),
  getLeadSource: vi.fn(async () => null),
  getActiveAdCampaigns: vi.fn(async () => []),
  matchAdCampaign: vi.fn(async () => null),
  formatSourceContextForPrompt: vi.fn(() => null),
  formatActiveAdsForPrompt: vi.fn(() => null),
}))
vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn(async () => {}),
}))
vi.mock('@/lib/auto-tag', () => ({
  autoTagProject: vi.fn(async () => {}),
  autoTagSource: vi.fn(async () => {}),
}))
vi.mock('@/lib/escalation-rules', () => ({
  getActiveEscalationRules: vi.fn(async () => []),
  matchKeywordRules: vi.fn(() => []),
  formatEscalationRulesForPrompt: vi.fn(() => ''),
}))
const media = vi.hoisted(() => ({
  getAllProjectMediaItems: vi.fn(async (): Promise<unknown[]> => []),
  mediaForProject: vi.fn((): unknown[] => []),
  mediaProjectKeys: vi.fn((): string[] => []),
  pickMediaToSend: vi.fn((): unknown[] => []),
}))
vi.mock('@/lib/project-media', () => media)

const scripts = vi.hoisted(() => ({
  getActiveProjectScripts: vi.fn(async (): Promise<unknown[]> => []),
  matchProjectScript: vi.fn(() => null),
  formatScriptForPrompt: vi.fn(() => ''),
}))
vi.mock('@/lib/project-scripts', () => scripts)

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
    // Señales visuales: visto azul al recibir + "escribiendo..." antes de generar
    expect(wa.markAsRead).toHaveBeenCalledWith('wamid.in1')
    expect(wa.sendTypingIndicator).toHaveBeenCalledWith('wamid.in1')
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
    // No es el último de la ráfaga → tampoco muestra "escribiendo..."
    expect(wa.sendTypingIndicator).not.toHaveBeenCalled()
  })

  it('marca opted_out cuando Daniela detecta opt-out', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: 'Entendido, no te molesto más. ¡Éxitos!', stage: 'cold', name_captured: null,
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false, schedule_meeting: null, opt_out: true,
      agent_action: null, deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
    })
    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { opted_out: true })
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

  it('si GPT devuelve {} una vez, REINTENTA con corrección y responde normal (auto-sanación)', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    // Primer intento: JSON vacío inválido. Segundo (retry): el default '¡Hola!' válido
    ai.parseClaudeResponse.mockImplementationOnce(() => { throw new Error('missing reply field') })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(ai.callClaude).toHaveBeenCalledTimes(2)
    // El prompt del reintento incluye la corrección explícita
    expect(String(ai.callClaude.mock.calls[1][0])).toContain('REINTENTO')
    // Respondió el mensaje REAL, no el fallback
    expect(wa.sendText).toHaveBeenCalledWith('50312345678', '¡Hola!')
  })

  it('si GPT falla DOS veces, envía mensaje de respaldo — el cliente NUNCA queda en visto', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    ai.callClaude
      .mockRejectedValueOnce(new Error('OpenAI timeout'))
      .mockRejectedValueOnce(new Error('OpenAI timeout'))

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    // Se envió un puente humano (cualquiera de las variantes) y quedó en el historial
    const fallbackCall = wa.sendText.mock.calls.find(c => /momento|momentito|te cuento/.test(String(c[1])))
    expect(fallbackCall).toBeDefined()
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'lead-1', role: 'assistant', content: expect.stringMatching(/momento|momentito|te cuento/),
    }))
  })

  it('si GPT devuelve JSON inválido dos veces, también cae al respaldo', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    ai.parseClaudeResponse
      .mockImplementationOnce(() => { throw new Error('missing reply field') })
      .mockImplementationOnce(() => { throw new Error('missing reply field') })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    const fallbackCall = wa.sendText.mock.calls.find(c => /momento|momentito|te cuento/.test(String(c[1])))
    expect(fallbackCall).toBeDefined()
  })

  it('procesa TODOS los mensajes cuando Meta agrupa un batch en un webhook', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: false })
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { messages: [
        { id: 'wamid.b1', from: '50312345678', type: 'text', text: { body: 'Hola' }, timestamp: '1716556800' },
        { id: 'wamid.b2', from: '50312345678', type: 'text', text: { body: 'Info porfa' }, timestamp: '1716556801' },
      ] } }] }],
    })
    const sig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')
    const res = await POST(new Request('http://localhost/api/webhook/whatsapp', {
      method: 'POST', body, headers: { 'x-hub-signature-256': sig },
    }))
    expect(res.status).toBe(200)
    await flush()

    // Ambos mensajes del batch se guardaron (bot pausado: solo guarda, no responde)
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({ waMessageId: 'wamid.b1' }))
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({ waMessageId: 'wamid.b2' }))
  })

  it('envía las burbujas extra DESPUÉS del reply y las guarda en el historial', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Soy Carlos', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: 'Un gusto, Carlos! 🤝', stage: 'new', name_captured: 'Carlos',
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false, schedule_meeting: null, opt_out: false,
      agent_action: null, deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
      extra_messages: ['Para enviarle la información correcta, cuénteme un poco:'],
    })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    const sent = wa.sendText.mock.calls.map(c => String(c[1]))
    expect(sent[0]).toBe('Un gusto, Carlos! 🤝')
    expect(sent[1]).toContain('cuénteme un poco')
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant', content: expect.stringContaining('cuénteme un poco'),
    }))
  })

  it('send_media type link: envía el texto con la URL desde project_media', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'donde queda?', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    const linkItem = { id: 'm1', project_key: 'portacelli', media_type: 'link', url: 'https://earth.google.com/x', caption: 'Ubicación exacta 🌍', sort_order: 1, active: true }
    media.mediaForProject.mockReturnValueOnce([linkItem])
    media.pickMediaToSend.mockReturnValueOnce([linkItem])
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: 'Le comparto la ubicación exacta:', stage: 'warm', name_captured: null,
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false, schedule_meeting: null, opt_out: false,
      agent_action: null, deal_summary: null, brain_observations: [], interactive_buttons: [],
      send_media: { type: 'link', project: 'Portacelli', description: 'ubicación' },
      extra_messages: [],
    })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    const linkSend = wa.sendText.mock.calls.find(c => String(c[1]).includes('earth.google.com'))
    expect(linkSend).toBeDefined()
    expect(String(linkSend![1])).toContain('Ubicación exacta 🌍')
  })
})
