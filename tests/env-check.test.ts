import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { checkEnv, ENV_REQUIREMENTS } from '@/lib/env-check'

const ALL_VARS = [
  ...ENV_REQUIREMENTS.critical,
  ...ENV_REQUIREMENTS.important,
  ...ENV_REQUIREMENTS.integrations,
]

// Guardar y restaurar process.env — misma convención que cron-route.test.ts
const original: Record<string, string | undefined> = {}
for (const name of ALL_VARS) original[name] = process.env[name]

afterAll(() => {
  for (const name of ALL_VARS) {
    if (original[name] === undefined) delete process.env[name]
    else process.env[name] = original[name]
  }
})

// Valores centinela: si alguno aparece en el resultado hay fuga de secretos
beforeEach(() => {
  for (const name of ALL_VARS) process.env[name] = `valor-secreto-${name}`
})

describe('checkEnv', () => {
  it('ok:true con el entorno completo y sin faltantes', () => {
    expect(checkEnv()).toEqual({
      ok: true,
      missing: { critical: [], important: [], integrations: [] },
    })
  })

  it('ok:false y nombra la variable si falta una crítica', () => {
    delete process.env.WA_APP_SECRET
    const res = checkEnv()
    expect(res.ok).toBe(false)
    expect(res.missing.critical).toEqual(['WA_APP_SECRET'])
    expect(res.missing.important).toEqual([])
    expect(res.missing.integrations).toEqual([])
  })

  it('cadena vacía cuenta como faltante', () => {
    process.env.SUPABASE_URL = ''
    const res = checkEnv()
    expect(res.ok).toBe(false)
    expect(res.missing.critical).toEqual(['SUPABASE_URL'])
  })

  it('ok:true si solo faltan importantes, pero las lista', () => {
    delete process.env.CRON_SECRET
    delete process.env.WA_TEMPLATE_FOLLOWUP
    const res = checkEnv()
    expect(res.ok).toBe(true)
    expect(res.missing.critical).toEqual([])
    expect(res.missing.important).toEqual(['CRON_SECRET', 'WA_TEMPLATE_FOLLOWUP'])
  })

  it('ok:true si solo faltan integraciones, pero las lista', () => {
    delete process.env.GOOGLE_CALENDAR_ID
    const res = checkEnv()
    expect(res.ok).toBe(true)
    expect(res.missing.integrations).toEqual(['GOOGLE_CALENDAR_ID'])
  })

  it('reporta cada nivel por separado cuando faltan varias', () => {
    delete process.env.WA_ACCESS_TOKEN
    delete process.env.GT_API_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const res = checkEnv()
    expect(res.ok).toBe(false)
    expect(res.missing.critical).toEqual(['WA_ACCESS_TOKEN'])
    expect(res.missing.important).toEqual(['GT_API_URL'])
    expect(res.missing.integrations).toEqual(['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
  })

  it('jamás expone VALORES del entorno — solo nombres', () => {
    delete process.env.CEO_PHONE_NUMBER
    const res = checkEnv()
    // Ningún valor centinela debe aparecer en el resultado serializado
    expect(JSON.stringify(res)).not.toContain('valor-secreto')
    // Y todo lo reportado debe ser un nombre conocido de variable
    for (const lista of Object.values(res.missing)) {
      for (const nombre of lista) expect(ALL_VARS).toContain(nombre)
    }
  })
})
