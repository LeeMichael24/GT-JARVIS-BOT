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

describe('sendInternalNotification — fallback a plantilla fuera de ventana', () => {
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

  it('si el texto libre falla y HAY plantilla configurada, envía la plantilla', async () => {
    process.env.WA_TEMPLATE_CEO_ALERT = 'alerta_lead_hot'
    const bodies: Record<string, unknown>[] = []
    let call = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      call++
      const body = JSON.parse(init.body) as Record<string, unknown>
      bodies.push(body)
      // Texto libre (3 intentos con retry) rechazado; plantilla OK
      if (body.type === 'text') {
        return { ok: false, status: 400, json: async () => ({}), text: async () => '{"error":{"code":131047}}' }
      }
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.tpl' }] }), text: async () => '' }
    }))

    await sendInternalNotification(params)

    const tplCall = bodies.find(b => b.type === 'template') as { template: { name: string, components: { parameters: { text: string }[] }[] } }
    expect(tplCall).toBeDefined()
    expect(tplCall.template.name).toBe('alerta_lead_hot')
    const texts = tplCall.template.components[0].parameters.map(p => p.text)
    expect(texts).toEqual(['Carlos', '+50378901234', 'Listo para cerrar'])
  })

  it('si el texto libre falla y NO hay plantilla, propaga el error (visible en logs)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 400, json: async () => ({}), text: async () => '{"error":{"code":131047}}',
    })))
    await expect(sendInternalNotification(params)).rejects.toThrow()
  })
})
