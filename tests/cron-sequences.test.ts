import { describe, it, expect, vi, beforeEach } from 'vitest'

const seqLib = vi.hoisted(() => ({
  getDueSequences: vi.fn(async (): Promise<unknown[]> => []),
  advanceSequence: vi.fn(async () => 'advanced' as const),
  isWithinBusinessHours: vi.fn(() => true),
  SEQUENCE_DEFINITIONS: {
    hot_close: {
      description: 'test',
      steps: [
        { delay_hours: 4, purpose: 'send_details' },
        { delay_hours: 24, purpose: 'create_urgency' },
      ],
    },
  },
}))
vi.mock('@/lib/sequences', () => seqLib)

const db = vi.hoisted(() => ({
  getLeadById: vi.fn(async (): Promise<unknown> => null),
  getDealSummary: vi.fn(async (): Promise<unknown> => null),
  getLatestUserMessageAt: vi.fn(async (): Promise<string | null> => null),
  saveConversation: vi.fn(async () => {}),
  updateLead: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase', () => db)

const ai = vi.hoisted(() => ({
  callClaude: vi.fn(async () => '{"message":"Hola Carlos, ¿seguimos con Portacelli?"}'),
}))
vi.mock('@/services/claude/client', () => ai)

const wa = vi.hoisted(() => ({
  sendText: vi.fn(async () => 'wamid.seq1'),
  sendTemplate: vi.fn(async () => 'wamid.tpl1'),
}))
vi.mock('@/services/whatsapp/client', () => wa)

import { GET } from '@/app/api/cron/sequences/route'

process.env.CRON_SECRET = 'sec123'

const req = (auth?: string) =>
  new Request('http://localhost/api/cron/sequences', { headers: auth ? { authorization: auth } : {} })

const dueSeq = {
  id: 'seq-1', lead_id: 'lead-1', sequence_type: 'hot_close',
  current_step: 0, status: 'active', context: { summary: 'quiere Portacelli' },
  next_fire_at: '', last_fired_at: null, created_at: '',
}

const lead = {
  id: 'lead-1', phone: '50312345678', name: 'Carlos', stage: 'hot',
  bot_active: true, opted_out: false, last_proactive_at: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  seqLib.isWithinBusinessHours.mockReturnValue(true)
  delete process.env.WA_TEMPLATE_FOLLOWUP
})

describe('cron sequences — ventana de 24h de Meta', () => {
  it('401 sin Bearer correcto', async () => {
    expect((await GET(req())).status).toBe(401)
    expect(seqLib.getDueSequences).not.toHaveBeenCalled()
  })

  it('DENTRO de ventana: genera y envía el follow-up', async () => {
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    db.getLeadById.mockResolvedValue(lead)
    // Cliente escribió hace 1 hora — texto libre permitido
    db.getLatestUserMessageAt.mockResolvedValue(new Date(Date.now() - 60 * 60 * 1000).toISOString())

    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.sent).toBe(1)
    expect(ai.callClaude).toHaveBeenCalledTimes(1)
    expect(wa.sendText).toHaveBeenCalledWith('50312345678', expect.stringContaining('Portacelli'), { typingDelay: false })
    expect(seqLib.advanceSequence).toHaveBeenCalledWith('seq-1', 'hot_close', 0)
  })

  it('FUERA de ventana CON plantilla configurada: envía sendTemplate con nombre y proyecto', async () => {
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([{ ...dueSeq, context: { project: 'Portacelli Alta' } }])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())

    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.sent).toBe(1)
    expect(ai.callClaude).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
    expect(wa.sendTemplate).toHaveBeenCalledWith('50312345678', 'seguimiento_interes', 'es', ['Carlos', 'Portacelli Alta'])
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      role: 'assistant', content: expect.stringContaining('Portacelli Alta'),
    }))
    expect(seqLib.advanceSequence).toHaveBeenCalledWith('seq-1', 'hot_close', 0)
  })

  it('lead sin nombre: el saludo de la plantilla usa "de nuevo" (no "Hola Hola")', async () => {
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([{ ...dueSeq, context: { project: 'Foresta' } }])
    db.getLeadById.mockResolvedValue({ ...lead, name: null })
    db.getLatestUserMessageAt.mockResolvedValue(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())

    await GET(req('Bearer sec123'))

    expect(wa.sendTemplate).toHaveBeenCalledWith('50312345678', 'seguimiento_interes', 'es', ['de nuevo', 'Foresta'])
  })

  it('FUERA de ventana: NO llama a GPT ni envía (Meta lo rechazaría) y avanza el paso', async () => {
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    db.getLeadById.mockResolvedValue(lead)
    // Cliente escribió hace 25 horas — texto libre sería rechazado (131047)
    db.getLatestUserMessageAt.mockResolvedValue(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())

    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.sent).toBe(0)
    expect(body.skipped).toBe(1)
    expect(ai.callClaude).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
    // Avanza para no reintentar eternamente un envío imposible
    expect(seqLib.advanceSequence).toHaveBeenCalledWith('seq-1', 'hot_close', 0)
  })

  it('lead sin mensajes registrados: fuera de ventana, no envía', async () => {
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(null)

    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.sent).toBe(0)
    expect(wa.sendText).not.toHaveBeenCalled()
  })

  it('lead con opt-out: se salta sin tocar la ventana', async () => {
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    db.getLeadById.mockResolvedValue({ ...lead, opted_out: true })

    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.skipped).toBe(1)
    expect(db.getLatestUserMessageAt).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
  })
})
