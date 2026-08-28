import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import type { ClaudeResponse } from '@/types'

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
  parseClaudeResponse: vi.fn((): Partial<ClaudeResponse> => ({
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

const TEST_SETTINGS = vi.hoisted(() => ({
  emoji_policy: 'minimal', learning_sensitivity: 'high', formality_default: 'tu',
  custom_instructions: '', reflection_enabled: true,
  agent_enabled: true, ceo_name: 'Michael Narváez',
  escalation_budget_usd: 300_000, escalation_units: 3, reply_max_chars: 500,
  llm_temperature: 0.85, reflection_temperature: 0.3,
  business_hours_start: 8, business_hours_end: 18,
  rental_threshold_usd: 30_000, history_window: 15, brain_min_confidence: 0.7,
  auto_promote_enabled: true, auto_promote_threshold: 3,
}))

const agentSettingsMock = vi.hoisted(() => ({
  getAgentSettings: vi.fn(async () => ({ ...TEST_SETTINGS })),
}))

vi.mock('@/lib/agent-settings', () => ({
  getAgentSettings: agentSettingsMock.getAgentSettings,
  DEFAULT_SETTINGS: { ...TEST_SETTINGS },
}))

import { POST } from '@/app/api/webhook/whatsapp/route'
import { getAllProjects } from '@/services/projects/gt-api'
import { createCalendarEvent } from '@/services/google/calendar'

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

describe('webhook con PAUSA GLOBAL (agent_enabled=false)', () => {
  it('guarda el mensaje pero Daniela no responde a NADIE, aunque el lead tenga bot_active', async () => {
    agentSettingsMock.getAgentSettings.mockResolvedValueOnce({ ...TEST_SETTINGS, agent_enabled: false })
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    // El mensaje entrante SÍ se guarda (el equipo lo ve en el inbox)
    expect(db.saveConversation).toHaveBeenCalledTimes(1)
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'lead-1', role: 'user', content: 'Sigo interesado',
    }))
    // Pero no hay modelo ni respuesta
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

  it('entrega duplicada del webhook (carrera): el perdedor NO llama al modelo ni responde doble', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    // El insert del mensaje choca con el índice único → otro worker ya lo procesa
    db.saveConversation.mockResolvedValueOnce({ duplicate: true })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(ai.callClaude).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
  })

  it('si el envío del reply FALLA tras reintentos, NO guarda la respuesta — la ráfaga queda abierta', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    wa.sendText.mockRejectedValueOnce(new Error('WhatsApp API 429'))

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    // Se guardó SOLO el mensaje del usuario — jamás una respuesta que el cliente no recibió
    const assistantSaves = db.saveConversation.mock.calls.filter(
      c => (c[0] as { role?: string }).role === 'assistant'
    )
    expect(assistantSaves).toHaveLength(0)
  })

  it('stage null del modelo (inválido/ausente) conserva el stage actual del lead — nunca regresa a new', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: '¡Hola!', stage: null, name_captured: null,
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false, schedule_meeting: null, opt_out: false,
      agent_action: null, deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
    })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    // baseLead.stage = 'warm' → se conserva
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', expect.objectContaining({ stage: 'warm' }))
  })

  it('el catálogo GT caído NO tumba la respuesta (allSettled aísla cada fuente)', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sigo interesado', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    vi.mocked(getAllProjects).mockRejectedValueOnce(new Error('GT API caída'))

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(wa.sendText).toHaveBeenCalledWith('50312345678', '¡Hola!')
  })

  it('la calificación hace merge: null del modelo NO borra datos ya capturados', async () => {
    const qualifiedLead = {
      ...baseLead, bot_active: true,
      qualification_data: { purpose: 'inversion', budget_ok: true, timeline: null, financing_needed: null, decision_maker: null },
    }
    db.upsertLead.mockResolvedValue(qualifiedLead)
    db.getLeadById.mockResolvedValue(qualifiedLead)
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Lo quiero ya', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: '¡Hola!', stage: 'hot', name_captured: null,
      // El modelo solo capturó timeline en este turno — el resto viene null
      qualification_data: { purpose: null, budget_ok: null, timeline: 'inmediato', financing_needed: null, decision_maker: null },
      qualified: false, schedule_meeting: null, opt_out: false,
      agent_action: null, deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
    })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(db.updateLead).toHaveBeenCalledWith('lead-1', expect.objectContaining({
      stage: 'hot',
      qualification_data: expect.objectContaining({
        purpose: 'inversion',      // conservado del lead
        budget_ok: true,           // conservado del lead
        timeline: 'inmediato',     // nuevo del modelo
      }),
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

describe('webhook agenda una reunión', () => {
  it('notifica al equipo SIEMPRE que se agenda una reunión, aunque agent_action sea "sell"', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Sí, el viernes a las 3pm por videollamada', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    vi.mocked(createCalendarEvent).mockResolvedValueOnce({ eventId: 'evt1', htmlLink: 'https://calendar.google.com/evt1' })
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: 'Perfecto, agendé tu videollamada para el viernes a las 3pm.', stage: 'hot', name_captured: null,
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false,
      schedule_meeting: { requested: true, datetime_iso: '2026-09-04T15:00:00-06:00', meeting_type: 'videollamada', project_name: 'Portacelli', notes: null },
      opt_out: false,
      agent_action: { type: 'sell', reason: null, urgency: 'normal', client_type: 'individual', follow_up_hint: null },
      deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
    })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(createCalendarEvent).toHaveBeenCalledTimes(1)
    expect(wa.sendInternalNotification).toHaveBeenCalledTimes(1)
    const call = wa.sendInternalNotification.mock.calls[0][0]
    expect(call.leadName).toBe('Carlos')
    expect(call.action.type).toBe('escalate_ceo')
    expect(call.action.reason).toContain('videollamada')
  })

  it('NO deja de notificar si sendInternalNotification falla — el evento de Calendar ya se creó', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'El viernes a las 3pm', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    vi.mocked(createCalendarEvent).mockResolvedValueOnce({ eventId: 'evt1', htmlLink: 'https://calendar.google.com/evt1' })
    wa.sendInternalNotification.mockRejectedValueOnce(new Error('WA down'))
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: 'Listo, agendado.', stage: 'hot', name_captured: null,
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false,
      schedule_meeting: { requested: true, datetime_iso: '2026-09-04T15:00:00-06:00', meeting_type: 'llamada', project_name: null, notes: null },
      opt_out: false,
      agent_action: { type: 'sell', reason: null, urgency: 'normal', client_type: 'individual', follow_up_hint: null },
      deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
    })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    // El reply al cliente se manda igual, la notificación fallida no lo bloquea
    expect(wa.sendText).toHaveBeenCalledWith('50312345678', 'Listo, agendado.')
  })

  it('NO manda dos alertas cuando la reunión Y el agent_action son escalate_ceo en el mismo turno', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'Somos una empresa, agendemos el viernes a las 3pm', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    vi.mocked(createCalendarEvent).mockResolvedValueOnce({ eventId: 'evt1', htmlLink: 'https://calendar.google.com/evt1' })
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: 'Perfecto, agendado.', stage: 'hot', name_captured: null,
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false,
      schedule_meeting: { requested: true, datetime_iso: '2026-09-04T15:00:00-06:00', meeting_type: 'videollamada', project_name: null, notes: null },
      opt_out: false,
      agent_action: { type: 'escalate_ceo', reason: 'Cliente corporativo', urgency: 'high', client_type: 'corporate', follow_up_hint: null },
      deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
    })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(wa.sendInternalNotification).toHaveBeenCalledTimes(1)
    const call = (wa.sendInternalNotification.mock.calls[0] as any[])[0]
    expect(call.action.reason).toContain('Cliente corporativo')
    expect(call.action.reason).toContain('agendó reunión')
  })

  it('notifica al equipo aunque falle la creación del evento de Calendar', async () => {
    db.upsertLead.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getLeadById.mockResolvedValue({ ...baseLead, bot_active: true })
    db.getUnprocessedUserMessages.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'El viernes a las 3pm', wa_message_id: 'wamid.in1', sent_by: null, created_at: '' },
    ])
    vi.mocked(createCalendarEvent).mockRejectedValueOnce(new Error('Google API down'))
    ai.parseClaudeResponse.mockReturnValueOnce({
      reply: 'Listo, agendado.', stage: 'hot', name_captured: null,
      qualification_data: { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null },
      qualified: false,
      schedule_meeting: { requested: true, datetime_iso: '2026-09-04T15:00:00-06:00', meeting_type: 'llamada', project_name: null, notes: null },
      opt_out: false,
      agent_action: { type: 'sell', reason: null, urgency: 'normal', client_type: 'individual', follow_up_hint: null },
      deal_summary: null, brain_observations: [], interactive_buttons: [], send_media: null,
    })

    const res = await POST(buildRequest())
    expect(res.status).toBe(200)
    await flush()

    expect(wa.sendInternalNotification).toHaveBeenCalledTimes(1)
    const call = (wa.sendInternalNotification.mock.calls[0] as any[])[0]
    expect(call.action.reason).toContain('NO se pudo crear')
  })
})
