import { describe, it, expect, vi, beforeEach } from 'vitest'

const analytics = vi.hoisted(() => ({
  getFunnelStats: vi.fn(async () => ({ total: 47, interested: 20, qualified: 12, meetings: 5, escalated: 2 })),
  getTopObjections: vi.fn(async () => [
    { objection: 'precio muy alto', count: 8 },
    { objection: 'zona lejana', count: 4 },
  ]),
  getDanielaStats: vi.fn(async () => ({
    totalConversations: 47, handledAlone: 45, escalated: 2, escalationRate: 4,
    avgResponseTimeSec: 12,
    projectBreakdown: [{ project: 'Portacelli Alta', count: 15 }, { project: 'Foresta', count: 9 }],
  })),
  getLeadDigest: vi.fn(async () => [
    {
      id: 'l1', name: 'Marcelo Díaz', phone: '50377772222', stage: 'hot' as const, score: 'A' as const,
      project: 'Portacelli Alta', summary: 'Quiere invertir, espera al CEO.',
      nextAction: 'Que Michael lo llame.', botActive: true, daysIdle: 1,
    },
  ]),
  // El formateo real se prueba en tests/lead-digest.test.ts; aquí solo
  // verificamos que el bloque llegue al mensaje.
  formatLeadDigest: vi.fn(() => 'Cliente por cliente:\n\n· Marcelo Díaz — Portacelli Alta (caliente, A)'),
}))
vi.mock('@/lib/analytics', () => analytics)

const wa = vi.hoisted(() => ({
  sendText: vi.fn(async () => 'wamid.weekly1'),
}))
vi.mock('@/services/whatsapp/client', () => wa)

import { GET } from '@/app/api/cron/weekly/route'

process.env.CRON_SECRET = 'sec123'

const req = (auth?: string) =>
  new Request('http://localhost/api/cron/weekly', { headers: auth ? { authorization: auth } : {} })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CEO_PHONE_NUMBER = '50370000000'
})

describe('cron weekly — reporte semanal al CEO', () => {
  it('401 sin Bearer correcto', async () => {
    expect((await GET(req())).status).toBe(401)
    expect(wa.sendText).not.toHaveBeenCalled()
  })

  it('envía el reporte con embudo, objeciones y proyectos', async () => {
    const res = await GET(req('Bearer sec123'))
    const body = await res.json()

    expect(body.sent).toBe(true)
    expect(wa.sendText).toHaveBeenCalledTimes(1)
    const [to, msg] = wa.sendText.mock.calls[0] as [string, string, unknown]
    expect(to).toBe('50370000000')
    expect(msg).toContain('47 leads')
    expect(msg).toContain('12 quedaron calificados')
    expect(msg).toContain('5 citas')
    expect(msg).toContain('precio muy alto')
    expect(msg).toContain('Portacelli Alta')
    // El reporte ya no se queda en totales: baja al cliente concreto
    expect(msg).toContain('Cliente por cliente:')
    expect(msg).toContain('Marcelo Díaz')
    expect(body.detallados).toBe(1)
  })

  it('si el detalle por lead falla, el reporte agregado igual se envía', async () => {
    analytics.getLeadDigest.mockRejectedValueOnce(new Error('BD caída'))
    const res = await GET(req('Bearer sec123'))
    const body = await res.json()
    expect(body.sent).toBe(true)
    expect(body.detallados).toBe(0)
    const [, msg] = wa.sendText.mock.calls[0] as [string, string, unknown]
    expect(msg).toContain('47 leads')
  })

  it('si el envío falla (fuera de ventana), responde sent:false sin explotar', async () => {
    wa.sendText.mockRejectedValueOnce(new Error('131047'))
    const res = await GET(req('Bearer sec123'))
    const body = await res.json()
    expect(body.sent).toBe(false)
    expect(res.status).toBe(200)
  })

  it('sin CEO_PHONE_NUMBER configurado, se salta limpio', async () => {
    delete process.env.CEO_PHONE_NUMBER
    const res = await GET(req('Bearer sec123'))
    const body = await res.json()
    expect(body.skipped).toBe('no_ceo_phone')
    expect(wa.sendText).not.toHaveBeenCalled()
  })
})
