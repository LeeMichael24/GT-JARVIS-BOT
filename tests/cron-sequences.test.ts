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

  it('FUERA de ventana SIN plantilla: NO envía, NO avanza el paso (queda pendiente) y lo cuenta como bloqueado', async () => {
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    db.getLeadById.mockResolvedValue(lead)
    // Cliente escribió hace 25 horas — texto libre sería rechazado (131047)
    db.getLatestUserMessageAt.mockResolvedValue(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.sent).toBe(0)
    expect(body.blocked_missing_template).toBe(1)
    expect(ai.callClaude).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
    expect(wa.sendTemplate).not.toHaveBeenCalled()
    // El paso NO se avanza: queda pendiente para dispararse cuando exista la plantilla
    expect(seqLib.advanceSequence).not.toHaveBeenCalled()
    // Alerta ruidosa indicando la variable que falta
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('WA_TEMPLATE_FOLLOWUP'))
    errSpy.mockRestore()
  })

  it('SIN plantilla: alerta UNA sola vez por corrida aunque haya varios leads bloqueados', async () => {
    seqLib.getDueSequences.mockResolvedValue([
      dueSeq,
      { ...dueSeq, id: 'seq-2', lead_id: 'lead-2' },
    ])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.blocked_missing_template).toBe(2)
    expect(seqLib.advanceSequence).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  it('FUERA de ventana: si Meta rechaza la plantilla, NO avanza el paso y lo cuenta como fallido', async () => {
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())
    wa.sendTemplate.mockRejectedValueOnce(new Error('(#131047) Message failed to send'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.sent).toBe(0)
    expect(body.failed).toBe(1)
    expect(body.errors).toBe(0)
    expect(db.saveConversation).not.toHaveBeenCalled()
    // El paso queda pendiente y se reintenta en la próxima corrida
    expect(seqLib.advanceSequence).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('el fallo de un lead NO bloquea al siguiente: el segundo se envía y avanza', async () => {
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([
      dueSeq,
      { ...dueSeq, id: 'seq-2', lead_id: 'lead-2', context: { project: 'Foresta' } },
    ])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())
    wa.sendTemplate
      .mockRejectedValueOnce(new Error('(#131047) Message failed to send'))
      .mockResolvedValueOnce('wamid.tpl2')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.failed).toBe(1)
    expect(body.sent).toBe(1)
    expect(wa.sendTemplate).toHaveBeenCalledTimes(2)
    // Solo avanza la secuencia del lead que sí recibió el mensaje
    expect(seqLib.advanceSequence).toHaveBeenCalledTimes(1)
    expect(seqLib.advanceSequence).toHaveBeenCalledWith('seq-2', 'hot_close', 0)
    errSpy.mockRestore()
  })

  it('lead sin mensajes registrados: fuera de ventana, no envía y queda bloqueado sin plantilla', async () => {
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(null)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.sent).toBe(0)
    expect(body.blocked_missing_template).toBe(1)
    expect(wa.sendText).not.toHaveBeenCalled()
    expect(seqLib.advanceSequence).not.toHaveBeenCalled()
    errSpy.mockRestore()
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
