import { describe, it, expect, vi, beforeEach } from 'vitest'

const engine = vi.hoisted(() => ({
  runDailyRadar: vi.fn(async () => ({ newListings: 1, campaignsCreated: 1 })),
  runRecontactRules: vi.fn(async () => ({ campaignsCreated: 2 })),
}))
vi.mock('@/lib/proactive/engine', () => engine)

import { GET } from '@/app/api/cron/daily/route'

process.env.CRON_SECRET = 'sec123'

const req = (auth?: string) =>
  new Request('http://localhost/api/cron/daily', { headers: auth ? { authorization: auth } : {} })

beforeEach(() => vi.clearAllMocks())

describe('cron daily', () => {
  it('401 sin Bearer correcto', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer nope'))).status).toBe(401)
    expect(engine.runDailyRadar).not.toHaveBeenCalled()
  })

  it('401 si CRON_SECRET no está configurado (fail closed)', async () => {
    const prev = process.env.CRON_SECRET
    delete process.env.CRON_SECRET
    try {
      expect((await GET(req('Bearer undefined'))).status).toBe(401)
      expect(engine.runDailyRadar).not.toHaveBeenCalled()
    } finally {
      process.env.CRON_SECRET = prev
    }
  })

  it('ejecuta radar y reglas y devuelve resumen', async () => {
    const res = await GET(req('Bearer sec123'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      radar: { newListings: 1, campaignsCreated: 1 },
      rules: { campaignsCreated: 2 },
    })
  })

  it('un fallo del radar no bloquea las reglas', async () => {
    engine.runDailyRadar.mockRejectedValueOnce(new Error('GT API caída'))
    const res = await GET(req('Bearer sec123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.radar).toEqual({ error: 'GT API caída' })
    expect(body.rules).toEqual({ campaignsCreated: 2 })
  })
})
