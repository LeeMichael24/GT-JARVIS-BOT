import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake mínimo de Supabase: agent_settings como un mapa key → fila
const db = vi.hoisted(() => ({
  rows: new Map<string, { key: string; value: string }>(),
  fail: false,
}))

vi.mock('@/lib/supabase', () => ({
  getServiceClient: vi.fn(() => {
    if (db.fail) throw new Error('sin cliente de BD')
    return {
      from: (_t: string) => ({
        select: () => ({
          eq: (_c: string, key: string) => ({
            maybeSingle: async () => ({ data: db.rows.get(key) ?? null, error: null }),
          }),
        }),
        upsert: async (row: { key: string; value: string }) => {
          db.rows.set(row.key, row)
          return { error: null }
        },
      }),
    }
  }),
}))

import {
  costoLlamada, nivelPresupuesto, fechaSV, crearMedidor, leerGastoHoy, sumarGasto,
  estadoPresupuesto, avisarSiCorresponde, registrarUso, _limpiarCacheGasto,
} from '@/lib/llm-budget'

const AHORA = new Date('2026-09-28T15:00:00Z') // lunes 28-sep, 09:00 en El Salvador

beforeEach(() => {
  db.rows.clear()
  db.fail = false
  _limpiarCacheGasto()
})

describe('costoLlamada', () => {
  it('gpt-4.1: entrada, entrada cacheada y salida a su tarifa', () => {
    // 8,000 nuevos × $2 + 2,000 cacheados × $0.50 + 1,000 salida × $8, por millón
    const usd = costoLlamada('gpt-4.1', {
      prompt_tokens: 10_000, completion_tokens: 1_000, prompt_tokens_details: { cached_tokens: 2_000 },
    })
    expect(usd).toBeCloseTo(0.025, 6)
  })

  it('o4-mini: la salida incluye su razonamiento y pesa más que la entrada', () => {
    const usd = costoLlamada('o4-mini', { prompt_tokens: 2_000, completion_tokens: 1_500 })
    expect(usd).toBeCloseTo((2_000 * 1.1 + 1_500 * 4.4) / 1e6, 6)
  })

  it('modelo desconocido: se cobra a la tarifa MÁS ALTA conocida, nunca a cero', () => {
    const desconocido = costoLlamada('gpt-9-futuro', { prompt_tokens: 10_000, completion_tokens: 1_000 })
    expect(desconocido).toBeGreaterThan(costoLlamada('gpt-4.1', { prompt_tokens: 10_000, completion_tokens: 1_000 }))
  })

  it('sin uso (respuesta sin usage) cuesta 0 y no lanza', () => {
    expect(costoLlamada('gpt-4.1', undefined)).toBe(0)
    expect(costoLlamada('gpt-4.1', {})).toBe(0)
  })
})

describe('nivelPresupuesto', () => {
  it('normal por debajo del 80 %, aviso desde el 80 %, ahorro al 100 %, tope al 200 %', () => {
    expect(nivelPresupuesto(3.9, 5)).toBe('normal')
    expect(nivelPresupuesto(4.0, 5)).toBe('aviso')
    expect(nivelPresupuesto(5.0, 5)).toBe('ahorro')
    expect(nivelPresupuesto(9.99, 5)).toBe('ahorro')
    expect(nivelPresupuesto(10.0, 5)).toBe('tope')
  })

  it('presupuesto 0 o inválido = sin tope', () => {
    expect(nivelPresupuesto(999, 0)).toBe('normal')
    expect(nivelPresupuesto(999, -1)).toBe('normal')
    expect(nivelPresupuesto(999, Number.NaN)).toBe('normal')
  })
})

describe('fechaSV', () => {
  it('usa el día de El Salvador, no el de UTC: 03:54 UTC del 29 sigue siendo 28', () => {
    expect(fechaSV(new Date('2026-09-29T03:54:00Z'))).toBe('2026-09-28')
    expect(fechaSV(new Date('2026-09-29T06:00:00Z'))).toBe('2026-09-29')
  })
})

describe('contador diario (agent_settings, clave _sys_gasto_<fecha>)', () => {
  it('suma sobre el mismo día y separa un día de otro', async () => {
    await sumarGasto(0.05, 1, AHORA)
    await sumarGasto(0.03, 2, AHORA)
    expect(await leerGastoHoy(AHORA)).toEqual({ usd: 0.08, calls: 3 })
    expect(db.rows.has('_sys_gasto_2026-09-28')).toBe(true)
    _limpiarCacheGasto()
    expect(await leerGastoHoy(new Date('2026-09-29T15:00:00Z'))).toEqual({ usd: 0, calls: 0 })
  })

  it('un valor corrupto en la fila cuenta como 0 en vez de romper', async () => {
    db.rows.set('_sys_gasto_2026-09-28', { key: '_sys_gasto_2026-09-28', value: 'no-es-json' })
    expect(await leerGastoHoy(AHORA)).toEqual({ usd: 0, calls: 0 })
  })

  it('sin cliente de BD: leer devuelve 0 y sumar NO lanza (nunca tumba una respuesta)', async () => {
    db.fail = true
    await expect(sumarGasto(1, 1, AHORA)).resolves.toBeUndefined()
    expect(await leerGastoHoy(AHORA)).toEqual({ usd: 0, calls: 0 })
  })

  it('registrarUso calcula el costo del modelo y lo suma', async () => {
    await registrarUso('gpt-4.1', { prompt_tokens: 10_000, completion_tokens: 1_000 }, AHORA)
    const g = await leerGastoHoy(AHORA)
    expect(g.calls).toBe(1)
    expect(g.usd).toBeCloseTo(0.028, 3)
  })
})

describe('medidor por mensaje: un solo guardado, no uno por llamada', () => {
  it('acumula varias llamadas y escribe UNA vez con el total', async () => {
    const m = crearMedidor()
    m.add('gpt-4.1', { prompt_tokens: 10_000, completion_tokens: 1_000 })
    m.add('o4-mini', { prompt_tokens: 2_000, completion_tokens: 1_000 })
    m.add('o4-mini', { prompt_tokens: 2_000, completion_tokens: 1_000 })
    await m.guardar(AHORA)
    const g = await leerGastoHoy(AHORA)
    expect(g.calls).toBe(3)
    expect(g.usd).toBeCloseTo(0.028 + 2 * (2_000 * 1.1 + 1_000 * 4.4) / 1e6, 3)
  })

  it('sin llamadas no escribe nada', async () => {
    await crearMedidor().guardar(AHORA)
    expect(db.rows.size).toBe(0)
  })
})

describe('estadoPresupuesto', () => {
  it('devuelve el nivel según el gasto de hoy', async () => {
    await sumarGasto(4.2, 50, AHORA)
    expect(await estadoPresupuesto(5, AHORA)).toEqual({ nivel: 'aviso', gastoUsd: 4.2 })
    await sumarGasto(1.0, 10, AHORA)
    _limpiarCacheGasto()
    expect((await estadoPresupuesto(5, AHORA)).nivel).toBe('ahorro')
  })

  it('si la BD falla, el nivel es normal (nunca se apaga a Daniela por un error de lectura)', async () => {
    db.fail = true
    expect(await estadoPresupuesto(5, AHORA)).toEqual({ nivel: 'normal', gastoUsd: 0 })
  })
})

describe('avisarSiCorresponde — una alerta por nivel y por día', () => {
  it('avisa una sola vez por nivel y día', async () => {
    const enviar = vi.fn(async () => {})
    await avisarSiCorresponde('aviso', 4.1, 5, { enviar, ahora: AHORA })
    await avisarSiCorresponde('aviso', 4.3, 5, { enviar, ahora: AHORA })
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(enviar.mock.calls[0][0]).toContain('$4.10')
    expect(enviar.mock.calls[0][0]).toContain('$5.00')
  })

  it('un nivel distinto el mismo día sí vuelve a avisar', async () => {
    const enviar = vi.fn(async () => {})
    await avisarSiCorresponde('aviso', 4.1, 5, { enviar, ahora: AHORA })
    await avisarSiCorresponde('ahorro', 5.2, 5, { enviar, ahora: AHORA })
    expect(enviar).toHaveBeenCalledTimes(2)
    expect(enviar.mock.calls[1][0]).toMatch(/ahorro/i)
  })

  it('nivel normal no avisa', async () => {
    const enviar = vi.fn(async () => {})
    await avisarSiCorresponde('normal', 1, 5, { enviar, ahora: AHORA })
    expect(enviar).not.toHaveBeenCalled()
  })

  it('si el envío falla no lanza (p. ej. fuera de la ventana de 24 h de WhatsApp)', async () => {
    const enviar = vi.fn(async () => { throw new Error('131047') })
    await expect(avisarSiCorresponde('aviso', 4.1, 5, { enviar, ahora: AHORA })).resolves.toBeUndefined()
  })
})
