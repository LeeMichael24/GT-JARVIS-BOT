import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

// Mock de Supabase — misma convención que cron-route.test.ts
const db = vi.hoisted(() => {
  const state = {
    queryError: null as { message: string } | null,
    throwOnClient: false,
  }
  return {
    state,
    getServiceClient: vi.fn(() => {
      if (state.throwOnClient) throw new Error('supabaseUrl is required')
      return {
        from: () => ({
          select: async () => ({ error: state.queryError }),
        }),
      }
    }),
  }
})
vi.mock('@/lib/supabase', () => ({ getServiceClient: db.getServiceClient }))

import { GET } from '@/app/api/health/route'
import { ENV_REQUIREMENTS } from '@/lib/env-check'

const ALL_VARS = [
  ...ENV_REQUIREMENTS.critical,
  ...ENV_REQUIREMENTS.important,
  ...ENV_REQUIREMENTS.integrations,
]

// Guardar y restaurar process.env
const original: Record<string, string | undefined> = {}
for (const name of ALL_VARS) original[name] = process.env[name]

afterAll(() => {
  for (const name of ALL_VARS) {
    if (original[name] === undefined) delete process.env[name]
    else process.env[name] = original[name]
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  db.state.queryError = null
  db.state.throwOnClient = false
  // Entorno completo por defecto; cada test borra lo que necesita
  for (const name of ALL_VARS) process.env[name] = `valor-secreto-${name}`
})

describe('GET /api/health', () => {
  it('healthy (200) con entorno completo y Supabase OK — conserva campos existentes', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('healthy')
    expect(body.timestamp).toBeDefined()
    // Contrato previo: checks de supabase y envs siguen presentes
    expect(body.checks).toEqual({ supabase: 'ok', env_wa: 'ok', env_openai: 'ok' })
    // Nuevo reporte de entorno
    expect(body.env).toEqual({
      ok: true,
      missing: { critical: [], important: [], integrations: [] },
    })
  })

  it('unhealthy (503) si falta una variable crítica, y la nombra', async () => {
    delete process.env.WA_APP_SECRET
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('unhealthy')
    expect(body.env.ok).toBe(false)
    expect(body.env.missing.critical).toEqual(['WA_APP_SECRET'])
    expect(body.checks.supabase).toBe('ok')
  })

  it('unhealthy (503) si falta WA_PHONE_NUMBER_ID — y el check legado lo refleja', async () => {
    delete process.env.WA_PHONE_NUMBER_ID
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('unhealthy')
    expect(body.checks.env_wa).toBe('error')
    expect(body.env.missing.critical).toEqual(['WA_PHONE_NUMBER_ID'])
  })

  it('degraded (200) si las críticas están pero falta una importante', async () => {
    delete process.env.CRON_SECRET
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.env.ok).toBe(true)
    expect(body.env.missing.important).toEqual(['CRON_SECRET'])
  })

  it('degraded (200) si solo falta una integración opcional', async () => {
    delete process.env.GOOGLE_CALENDAR_ID
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.env.missing.integrations).toEqual(['GOOGLE_CALENDAR_ID'])
  })

  it('unhealthy (503) si Supabase devuelve error — conserva la alerta previa', async () => {
    db.state.queryError = { message: 'connection refused' }
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('unhealthy')
    expect(body.checks.supabase).toBe('error')
  })

  it('jamás lanza: si el cliente de Supabase explota, responde 503 igual', async () => {
    db.state.throwOnClient = true
    await expect(GET()).resolves.toBeInstanceOf(Response)
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('unhealthy')
    expect(body.checks.supabase).toBe('error')
  })

  it('la respuesta jamás contiene valores del entorno (solo nombres)', async () => {
    delete process.env.GT_API_SECRET
    const res = await GET()
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('valor-secreto')
    expect(body.env.missing.important).toEqual(['GT_API_SECRET'])
  })
})
