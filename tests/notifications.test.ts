import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatNotification, sendInternalNotification } from '@/services/whatsapp/client'
import type { AgentAction } from '@/types'

describe('formatNotification', () => {
  const baseParams = {
    leadName: 'Carlos',
    leadPhone: '50378901234',
    action: {
      type: 'consult_team' as const,
      reason: 'Client wants furnished apartment, not in catalog',
      urgency: 'normal' as const,
      client_type: 'individual' as const,
      follow_up_hint: null,
    } satisfies AgentAction,
    botReply: 'Déjame verificar con mi equipo.',
    dealSummary: 'Carlos busca inversión $400k',
  }

  it('formats consultation notification', () => {
    const msg = formatNotification(baseParams)
    expect(msg).toContain('Daniela necesita tu apoyo')
    expect(msg).toContain('Carlos')
    expect(msg).toContain('50378901234')
    expect(msg).toContain('furnished apartment')
  })

  it('formats escalation notification with urgency markers', () => {
    const msg = formatNotification({
      ...baseParams,
      action: { ...baseParams.action, type: 'escalate_ceo', urgency: 'critical', client_type: 'corporate' },
    })
    expect(msg).toContain('LEAD HOT')
    expect(msg).toContain('CORPORATIVO')
  })

  it('includes deal summary when available', () => {
    const msg = formatNotification(baseParams)
    expect(msg).toContain('inversión $400k')
  })

  it('works without deal summary', () => {
    const msg = formatNotification({ ...baseParams, dealSummary: null })
    expect(msg).toContain('Carlos')
    expect(msg).not.toContain('Deal:')
  })
})

describe('sendInternalNotification — plantilla primero (la ventana de 24h retiene el texto libre)', () => {
  const params = {
    leadName: 'Carlos',
    leadPhone: '50378901234',
    action: {
      type: 'escalate_ceo' as const, reason: 'Listo para cerrar',
      urgency: 'critical' as const, client_type: 'individual' as const, follow_up_hint: null,
    },
    botReply: 'Te conecto con el CEO.',
    dealSummary: null,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.WA_ACCESS_TOKEN = 'token'
    process.env.WA_PHONE_NUMBER_ID = '12345'
    process.env.CEO_PHONE_NUMBER = '50370000000'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.WA_TEMPLATE_CEO_ALERT
  })

  it('con plantilla configurada, la alerta sale PRIMERO como plantilla (entrega garantizada)', async () => {
    // Meta responde 200 al texto libre fuera de ventana y RETIENE la entrega
    // hasta que el destinatario escribe ("alerta congelada"). La Utility HSM
    // entrega siempre, así que va primero.
    process.env.WA_TEMPLATE_CEO_ALERT = 'alerta_lead_hot'
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>
      bodies.push(body)
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.x' }] }), text: async () => '' }
    }))

    await sendInternalNotification(params)

    expect(bodies[0]!.type).toBe('template')
    const tplCall = bodies[0] as { template: { name: string, components: { parameters: { text: string }[] }[] } }
    expect(tplCall.template.name).toBe('alerta_lead_hot')
    const texts = tplCall.template.components[0].parameters.map(p => p.text)
    expect(texts).toEqual(['Carlos', '+50378901234', 'Listo para cerrar'])
  })

  it('tras la plantilla intenta el texto libre con el detalle (mejor esfuerzo)', async () => {
    process.env.WA_TEMPLATE_CEO_ALERT = 'alerta_lead_hot'
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>)
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.x' }] }), text: async () => '' }
    }))

    await sendInternalNotification(params)

    expect(bodies.map(b => b.type)).toEqual(['template', 'text'])
    expect((bodies[1] as { text: { body: string } }).text.body).toContain('LEAD HOT')
  })

  it('si el texto de detalle falla NO lanza: la plantilla ya entregó', async () => {
    process.env.WA_TEMPLATE_CEO_ALERT = 'alerta_lead_hot'
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>
      if (body.type === 'text') {
        return { ok: false, status: 400, json: async (): Promise<object> => ({}), text: async (): Promise<string> => '{"error":{"code":131047}}' }
      }
      return { ok: true, json: async (): Promise<object> => ({ messages: [{ id: 'wamid.tpl' }] }), text: async (): Promise<string> => '' }
    }))

    await expect(sendInternalNotification(params)).resolves.toBeUndefined()
  })

  it('si la plantilla es rechazada (no existe en el WABA), cae al texto libre', async () => {
    // Caso actual con el número de prueba: alerta_lead_hot vive en otro WABA.
    process.env.WA_TEMPLATE_CEO_ALERT = 'alerta_lead_hot'
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>
      bodies.push(body)
      if (body.type === 'template') {
        return { ok: false, status: 404, json: async (): Promise<object> => ({}), text: async (): Promise<string> => '{"error":{"code":132001}}' }
      }
      return { ok: true, json: async (): Promise<object> => ({ messages: [{ id: 'wamid.txt' }] }), text: async (): Promise<string> => '' }
    }))

    await sendInternalNotification(params)

    expect(bodies.some(b => b.type === 'text')).toBe(true)
  }, 15000)

  it('manda el teléfono en solo-dígitos aunque CEO_PHONE_NUMBER traiga "+" y espacios', async () => {
    // La consola de Meta documenta "to": "50362087916" — sin "+". Con el "+"
    // la API responde 200 pero el mensaje no llega: falla en silencio.
    process.env.CEO_PHONE_NUMBER = '+503 6208-7916'
    const enviados: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      enviados.push(JSON.parse(init.body) as Record<string, unknown>)
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.ok' }] }), text: async () => '' }
    }))

    await sendInternalNotification(params)

    expect(enviados[0]!.to).toBe('50362087916')
  })

  it('normaliza también el toPhone explícito de un asesor', async () => {
    const enviados: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      enviados.push(JSON.parse(init.body) as Record<string, unknown>)
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.ok' }] }), text: async () => '' }
    }))

    await sendInternalNotification({ ...params, toPhone: '+503 7725 0355' })

    expect(enviados[0]!.to).toBe('50377250355')
  })

  it('si el texto libre falla y NO hay plantilla, propaga el error (visible en logs)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 400, json: async () => ({}), text: async () => '{"error":{"code":131047}}',
    })))
    await expect(sendInternalNotification(params)).rejects.toThrow()
  })
})
