import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const seqLib = vi.hoisted(() => ({
  getDueSequences: vi.fn(async (): Promise<unknown[]> => []),
  reclamarSecuencia: vi.fn(async (): Promise<boolean> => true),
  advanceSequence: vi.fn(async () => 'advanced' as const),
  isWithinBusinessHours: vi.fn(() => true),
  tieneEscalacionCeoReciente: vi.fn(async (): Promise<boolean> => false),
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
// pickHoraActiva/getNextFireAt quedan como la implementación real (función
// pura, ya probada en tests/sequences.test.ts) — solo se mockea lo que toca BD.
vi.mock('@/lib/sequences', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/sequences')>()
  return { ...actual, ...seqLib }
})

const db = vi.hoisted(() => ({
  getLeadById: vi.fn(async (): Promise<unknown> => null),
  getDealSummary: vi.fn(async (): Promise<unknown> => null),
  getLatestUserMessageAt: vi.fn(async (): Promise<string | null> => null),
  getConversationHistory: vi.fn(async (): Promise<unknown[]> => []),
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

const catalogo = vi.hoisted(() => ({
  getAllProjects: vi.fn(async (): Promise<unknown[]> => []),
}))
vi.mock('@/services/projects/gt-api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/projects/gt-api')>()
  return { ...actual, ...catalogo }
})

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
  seqLib.tieneEscalacionCeoReciente.mockResolvedValue(false)
  catalogo.getAllProjects.mockResolvedValue([])
  db.getConversationHistory.mockResolvedValue([])
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
    // Sin historial de usuario en este caso (mock por defecto vacío) → sin
    // señal para aprender la hora, se conserva el plazo fijo (null)
    expect(seqLib.advanceSequence).toHaveBeenCalledWith('seq-1', 'hot_close', 0, null)
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

  it('DENTRO de ventana: manda el historial real de la conversación a callClaude (no vacío)', async () => {
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(new Date(Date.now() - 60 * 60 * 1000).toISOString())
    const historial = [
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'quiero comprar una casa en Portacelli', wa_message_id: null, sent_by: null, created_at: '' },
      { id: 'c2', lead_id: 'lead-1', role: 'assistant', content: '¡Claro! ¿Buscas algo para vivir o invertir?', wa_message_id: null, sent_by: null, created_at: '' },
    ]
    db.getConversationHistory.mockResolvedValue(historial)

    await GET(req('Bearer sec123'))

    // Antes: se llamaba con [] y el modelo generaba un seguimiento sin
    // relación con lo que el cliente realmente pidió. El historial real
    // debe llegar como segundo argumento de callClaude.
    expect(ai.callClaude).toHaveBeenCalledWith(expect.any(String), historial, expect.any(Object))
    expect(db.getConversationHistory).toHaveBeenCalledWith('lead-1', expect.any(Number))
  })

  it('DENTRO de ventana: con suficiente historial, agenda el siguiente paso a la hora en que el lead suele escribir', async () => {
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(new Date(Date.now() - 60 * 60 * 1000).toISOString())
    // 4 de 5 mensajes del cliente a las 19:00 UTC = 13:00 El Salvador
    db.getConversationHistory.mockResolvedValue([
      { id: 'c1', lead_id: 'lead-1', role: 'user', content: 'a', wa_message_id: null, sent_by: null, created_at: '2026-06-01T19:10:00Z' },
      { id: 'c2', lead_id: 'lead-1', role: 'user', content: 'b', wa_message_id: null, sent_by: null, created_at: '2026-06-02T19:05:00Z' },
      { id: 'c3', lead_id: 'lead-1', role: 'user', content: 'c', wa_message_id: null, sent_by: null, created_at: '2026-06-03T19:20:00Z' },
      { id: 'c4', lead_id: 'lead-1', role: 'user', content: 'd', wa_message_id: null, sent_by: null, created_at: '2026-06-04T19:00:00Z' },
      { id: 'c5', lead_id: 'lead-1', role: 'user', content: 'e', wa_message_id: null, sent_by: null, created_at: '2026-06-05T09:00:00Z' },
    ])

    await GET(req('Bearer sec123'))

    expect(seqLib.advanceSequence).toHaveBeenCalledWith('seq-1', 'hot_close', 0, 13)
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

// 13-sep-2026: el cron no dejaba registro desde el 2-sep (se cortaba antes del
// final) y en Hobby el reloj cada 15 min vive en Supabase mientras Vercel sigue
// con su corrida diaria: dos relojes pueden tomar la misma secuencia a la vez.
describe('cron sequences — dos relojes y límite de tiempo', () => {
  const fueraDeVentana = () => new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reclama la secuencia antes de enviar', async () => {
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(fueraDeVentana())

    await GET(req('Bearer sec123'))

    expect(seqLib.reclamarSecuencia.mock.calls[0]).toEqual([dueSeq])
    expect(seqLib.reclamarSecuencia.mock.invocationCallOrder[0])
      .toBeLessThan(wa.sendTemplate.mock.invocationCallOrder[0])
  })

  it('si otra corrida ya la reclamó, no envía nada', async () => {
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([dueSeq])
    seqLib.reclamarSecuencia.mockResolvedValueOnce(false)
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(fueraDeVentana())

    const body = await (await GET(req('Bearer sec123'))).json()

    expect(body.sent).toBe(0)
    expect(body.skipped).toBe(1)
    expect(wa.sendTemplate).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
    expect(seqLib.advanceSequence).not.toHaveBeenCalled()
  })

  it('corta antes del límite de Vercel y deja el resto para la próxima vuelta', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T15:00:00Z'))
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([dueSeq, { ...dueSeq, id: 'seq-2', lead_id: 'lead-2' }])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(fueraDeVentana())
    // El primer envío se come todo el presupuesto (240 s de los 300 que da Vercel)
    wa.sendTemplate.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 241_000)
      return 'wamid.lento'
    })

    const body = await (await GET(req('Bearer sec123'))).json()

    expect(wa.sendTemplate).toHaveBeenCalledTimes(1)
    expect(body.sent).toBe(1)
    expect(body.deferred_time_budget).toBe(1)
  })
})

// 29-sep-2026: el lead 31204ec5 hablaba de Portacelli y recibió dos seguimientos
// "sobre Local Comercial excelente para negocio" (interés guardado por error).
describe('cron sequences — el tema del recontacto sale de la conversación', () => {
  const fueraDeVentana = () => new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  const dentroDeVentana = () => new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const proyectos = [
    { slug: 'portacelli-raices-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-5a3907', name: 'Portacelli Raices - Fase 1 Habitacional', type: 'Residencial', entityType: 'project' },
    { slug: 'portacelli-alta-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-58448f', name: 'Portacelli Alta - Fase 1 Habitacional', type: 'Apartamentos', entityType: 'project' },
    { slug: 'local-comercial-excelente-para-negocio-en-alquiler-san-salvador-ef8f5b', name: 'Local Comercial excelente para negocio', type: 'Local Comercial', entityType: 'residency' },
  ]
  const msg = (role: string, content: string) => ({ id: 'x', lead_id: 'lead-1', role, content, wa_message_id: null, sent_by: null, created_at: '' })
  const seqSafetyNet = { ...dueSeq, context: { origin: 'safety_net_daily' } }
  const leadMalMarcado = { ...lead, project_interest: 'Local Comercial excelente para negocio' }

  it('plantilla: usa el proyecto de la conversación y NO el project_interest guardado', async () => {
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([seqSafetyNet])
    db.getLeadById.mockResolvedValue(leadMalMarcado)
    db.getLatestUserMessageAt.mockResolvedValue(fueraDeVentana())
    catalogo.getAllProjects.mockResolvedValue(proyectos)
    db.getConversationHistory.mockResolvedValue([
      msg('user', 'Para inversion y vivienda'),
      msg('assistant', 'Portacelli Raices es una opción top, casas de 282m² desde $516,240.'),
      msg('user', 'Quiero comprar 5 casas de una vez'),
    ])

    await GET(req('Bearer sec123'))

    expect(wa.sendTemplate).toHaveBeenCalledWith('50312345678', 'seguimiento_interes', 'es', ['Carlos', 'Portacelli Raices'])
  })

  it('plantilla: sin proyecto claro en la charla → texto genérico, jamás el interés guardado', async () => {
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([seqSafetyNet])
    db.getLeadById.mockResolvedValue(leadMalMarcado)
    db.getLatestUserMessageAt.mockResolvedValue(fueraDeVentana())
    catalogo.getAllProjects.mockResolvedValue(proyectos)
    db.getConversationHistory.mockResolvedValue([msg('user', 'Para ambas')])

    await GET(req('Bearer sec123'))

    expect(wa.sendTemplate).toHaveBeenCalledWith('50312345678', 'seguimiento_interes', 'es', ['Carlos', 'tu consulta con Grupo Terranova'])
    expect(db.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.not.stringContaining('Local Comercial'),
    }))
  })

  it('plantilla: si el catálogo no responde, cae al texto genérico (no rompe el envío)', async () => {
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([seqSafetyNet])
    db.getLeadById.mockResolvedValue(leadMalMarcado)
    db.getLatestUserMessageAt.mockResolvedValue(fueraDeVentana())
    catalogo.getAllProjects.mockRejectedValue(new Error('GT API error: 500'))

    await GET(req('Bearer sec123'))

    expect(wa.sendTemplate).toHaveBeenCalledWith('50312345678', 'seguimiento_interes', 'es', ['Carlos', 'tu consulta con Grupo Terranova'])
  })

  it('dentro de ventana: el prompt no lleva el interés guardado si la charla no lo respalda', async () => {
    seqLib.getDueSequences.mockResolvedValue([seqSafetyNet])
    db.getLeadById.mockResolvedValue(leadMalMarcado)
    db.getLatestUserMessageAt.mockResolvedValue(dentroDeVentana())
    catalogo.getAllProjects.mockResolvedValue(proyectos)
    db.getConversationHistory.mockResolvedValue([msg('user', 'Para ambas')])

    await GET(req('Bearer sec123'))

    const prompt = (ai.callClaude.mock.calls as unknown as string[][])[0][0]
    expect(prompt).not.toContain('Local Comercial')
  })

  it('lead escalado al CEO: no se le manda seguimiento automático y la secuencia no avanza', async () => {
    process.env.WA_TEMPLATE_FOLLOWUP = 'seguimiento_interes'
    seqLib.getDueSequences.mockResolvedValue([seqSafetyNet])
    db.getLeadById.mockResolvedValue(lead)
    db.getLatestUserMessageAt.mockResolvedValue(fueraDeVentana())
    seqLib.tieneEscalacionCeoReciente.mockResolvedValue(true)

    const body = await (await GET(req('Bearer sec123'))).json()

    expect(body.sent).toBe(0)
    expect(body.skipped).toBe(1)
    expect(wa.sendTemplate).not.toHaveBeenCalled()
    expect(wa.sendText).not.toHaveBeenCalled()
    expect(ai.callClaude).not.toHaveBeenCalled()
    expect(seqLib.reclamarSecuencia).not.toHaveBeenCalled()
    expect(seqLib.advanceSequence).not.toHaveBeenCalled()
  })
})
