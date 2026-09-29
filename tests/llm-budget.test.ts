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
  permitidoHoy, leerGastoMes, COSTO_MENSAJE_ESTIMADO_USD,
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
    expect(await leerGastoHoy(AHORA)).toEqual({ usd: 0.08, calls: 3, mensajes: 0 })
    expect(db.rows.has('_sys_gasto_2026-09-28')).toBe(true)
    _limpiarCacheGasto()
    expect(await leerGastoHoy(new Date('2026-09-29T15:00:00Z'))).toEqual({ usd: 0, calls: 0, mensajes: 0 })
  })

  it('un valor corrupto en la fila cuenta como 0 en vez de romper', async () => {
    db.rows.set('_sys_gasto_2026-09-28', { key: '_sys_gasto_2026-09-28', value: 'no-es-json' })
    expect(await leerGastoHoy(AHORA)).toEqual({ usd: 0, calls: 0, mensajes: 0 })
  })

  it('sin cliente de BD: leer devuelve 0 y sumar NO lanza (nunca tumba una respuesta)', async () => {
    db.fail = true
    await expect(sumarGasto(1, 1, AHORA)).resolves.toBeUndefined()
    expect(await leerGastoHoy(AHORA)).toEqual({ usd: 0, calls: 0, mensajes: 0 })
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

describe('permitidoHoy — el presupuesto del mes se reparte por ritmo, no se gasta de golpe', () => {
  // 29-sep-2026: con $20 al mes ($0.67 al día) un tope diario de $5 se comía el mes en 4 días.
  const base = { diarioUsd: 0 }

  it('primer día del mes sin gasto: $20 entre 30 días', () => {
    const p = permitidoHoy({ ...base, mensualUsd: 20, gastoMesUsd: 0, gastoHoyUsd: 0, ahora: new Date('2026-09-01T15:00:00Z') })
    expect(p.diasRestantes).toBe(30)
    expect(p.permitidoUsd).toBeCloseTo(20 / 30, 6)
  })

  it('lo que no se gastó se acumula: el día 29 con $9 disponibles y 2 días por delante', () => {
    // gasto del mes $12 (de los cuales $1 es de hoy) → al empezar el día quedaban $9
    const p = permitidoHoy({ ...base, mensualUsd: 20, gastoMesUsd: 12, gastoHoyUsd: 1, ahora: new Date('2026-09-29T15:00:00Z') })
    expect(p.diasRestantes).toBe(2)
    expect(p.restanteAlEmpezarUsd).toBeCloseTo(9, 6)
    expect(p.permitidoUsd).toBeCloseTo(4.5, 6)
  })

  it('un tope diario explícito solo puede BAJAR el ritmo, nunca subirlo', () => {
    const hoy = new Date('2026-09-01T15:00:00Z')
    expect(permitidoHoy({ mensualUsd: 20, diarioUsd: 0.5, gastoMesUsd: 0, gastoHoyUsd: 0, ahora: hoy }).permitidoUsd).toBe(0.5)
    expect(permitidoHoy({ mensualUsd: 20, diarioUsd: 5, gastoMesUsd: 0, gastoHoyUsd: 0, ahora: hoy }).permitidoUsd).toBeCloseTo(20 / 30, 6)
  })

  it('mes agotado: no queda nada permitido, nunca negativo', () => {
    const p = permitidoHoy({ ...base, mensualUsd: 20, gastoMesUsd: 25, gastoHoyUsd: 1, ahora: new Date('2026-09-10T15:00:00Z') })
    expect(p.restanteAlEmpezarUsd).toBe(0)
    expect(p.permitidoUsd).toBe(0)
  })

  it('sin tope mensual (0): solo cuenta el diario explícito; sin ninguno, no hay límite (0)', () => {
    const hoy = new Date('2026-09-10T15:00:00Z')
    expect(permitidoHoy({ mensualUsd: 0, diarioUsd: 3, gastoMesUsd: 99, gastoHoyUsd: 0, ahora: hoy }).permitidoUsd).toBe(3)
    expect(permitidoHoy({ mensualUsd: 0, diarioUsd: 0, gastoMesUsd: 99, gastoHoyUsd: 0, ahora: hoy }).permitidoUsd).toBe(0)
  })

  it('cambio de mes y año: el 1-ene tiene 31 días por delante', () => {
    expect(permitidoHoy({ ...base, mensualUsd: 31, gastoMesUsd: 0, gastoHoyUsd: 0, ahora: new Date('2027-01-01T15:00:00Z') }).diasRestantes).toBe(31)
  })
})

describe('contador mensual y mensajes', () => {
  it('el medidor suma al día y al mes, y cuenta el mensaje una sola vez', async () => {
    const m = crearMedidor()
    m.add('gpt-4.1', { prompt_tokens: 10_000, completion_tokens: 1_000 })
    m.add('o4-mini', { prompt_tokens: 2_000, completion_tokens: 1_000 })
    await m.guardar(AHORA, { mensaje: true })
    const hoy = await leerGastoHoy(AHORA)
    const mes = await leerGastoMes(AHORA)
    expect(hoy.mensajes).toBe(1)
    expect(mes.mensajes).toBe(1)
    expect(mes.calls).toBe(2)
    expect(mes.usd).toBeCloseTo(hoy.usd, 6)
    expect(db.rows.has('_sys_gasto_mes_2026-09')).toBe(true)
  })

  it('el mes acumula varios días', async () => {
    await sumarGasto(0.5, 5, new Date('2026-09-10T15:00:00Z'), 3)
    _limpiarCacheGasto()
    await sumarGasto(0.25, 2, new Date('2026-09-11T15:00:00Z'), 1)
    _limpiarCacheGasto()
    expect(await leerGastoMes(new Date('2026-09-20T15:00:00Z'))).toEqual({ usd: 0.75, calls: 7, mensajes: 4 })
  })
})

describe('estadoPresupuesto (mensual $20)', () => {
  const cfg = { mensualUsd: 20, diarioUsd: 0 }

  it('mes sin gasto: normal, con mensajes estimados según el costo por mensaje por defecto', async () => {
    const e = await estadoPresupuesto(cfg, new Date('2026-09-01T15:00:00Z'))
    expect(e.nivel).toBe('normal')
    expect(e.mensajesRestantes).toBe(Math.floor(20 / COSTO_MENSAJE_ESTIMADO_USD))
  })

  it('con 10+ mensajes medidos usa el costo real por mensaje, no el estimado', async () => {
    const dia = new Date('2026-09-05T15:00:00Z')
    await sumarGasto(1.0, 40, dia, 20) // $0.05 por mensaje
    _limpiarCacheGasto()
    const e = await estadoPresupuesto(cfg, dia)
    expect(e.mensajesRestantes).toBe(Math.floor((20 - 1.0) / 0.05))
  })

  it('el ritmo del día manda: pasarse del permitido de hoy sube el nivel aunque el mes vaya bien', async () => {
    const dia = new Date('2026-09-01T15:00:00Z') // permitido hoy ≈ $0.667
    await sumarGasto(0.6, 10, dia, 8) // 90 % del permitido
    _limpiarCacheGasto()
    expect((await estadoPresupuesto(cfg, dia)).nivel).toBe('aviso')
    await sumarGasto(0.2, 3, dia, 2) // 120 %
    _limpiarCacheGasto()
    expect((await estadoPresupuesto(cfg, dia)).nivel).toBe('ahorro')
    await sumarGasto(0.6, 9, dia, 7) // ~210 %
    _limpiarCacheGasto()
    expect((await estadoPresupuesto(cfg, dia)).nivel).toBe('tope')
  })

  it('el mes agotado es tope, aunque hoy no se haya gastado nada', async () => {
    await sumarGasto(20.5, 400, new Date('2026-09-10T15:00:00Z'), 300)
    _limpiarCacheGasto()
    const e = await estadoPresupuesto(cfg, new Date('2026-09-11T15:00:00Z'))
    expect(e.nivel).toBe('tope')
    expect(e.mensajesRestantes).toBe(0)
  })

  it('80 % del mes ya es aviso', async () => {
    await sumarGasto(16.5, 300, new Date('2026-09-10T15:00:00Z'), 250)
    _limpiarCacheGasto()
    // ese mismo día queda por encima del permitido, así que tomamos el día siguiente
    expect((await estadoPresupuesto(cfg, new Date('2026-09-11T15:00:00Z'))).nivel).not.toBe('normal')
  })

  it('sin tope alguno (mensual 0 y diario 0) nunca degrada', async () => {
    await sumarGasto(999, 5000, AHORA, 3000)
    _limpiarCacheGasto()
    expect((await estadoPresupuesto({ mensualUsd: 0, diarioUsd: 0 }, AHORA)).nivel).toBe('normal')
  })

  it('si la BD falla, el nivel es normal (nunca se apaga a Daniela por un error de lectura)', async () => {
    db.fail = true
    const e = await estadoPresupuesto(cfg, AHORA)
    expect(e.nivel).toBe('normal')
    expect(e.gastoUsd).toBe(0)
  })
})

describe('avisarSiCorresponde — una alerta por nivel y por día', () => {
  const ctx = { gastoHoyUsd: 4.1, permitidoHoyUsd: 5, gastoMesUsd: 12.34, mensualUsd: 20, mensajesRestantes: 144 }

  it('avisa una sola vez por nivel y día, con el gasto del mes y los mensajes que quedan', async () => {
    const enviar = vi.fn(async () => {})
    await avisarSiCorresponde('aviso', ctx, { enviar, ahora: AHORA })
    await avisarSiCorresponde('aviso', { ...ctx, gastoHoyUsd: 4.3 }, { enviar, ahora: AHORA })
    expect(enviar).toHaveBeenCalledTimes(1)
    const texto = (enviar.mock.calls[0] as unknown as string[])[0]
    expect(texto).toContain('$12.34')
    expect(texto).toContain('$20.00')
    expect(texto).toContain('144')
  })

  it('un nivel distinto el mismo día sí vuelve a avisar', async () => {
    const enviar = vi.fn(async () => {})
    await avisarSiCorresponde('aviso', ctx, { enviar, ahora: AHORA })
    await avisarSiCorresponde('ahorro', ctx, { enviar, ahora: AHORA })
    expect(enviar).toHaveBeenCalledTimes(2)
    expect((enviar.mock.calls[1] as unknown as string[])[0]).toMatch(/ahorro/i)
  })

  it('nivel normal no avisa', async () => {
    const enviar = vi.fn(async () => {})
    await avisarSiCorresponde('normal', ctx, { enviar, ahora: AHORA })
    expect(enviar).not.toHaveBeenCalled()
  })

  it('si el envío falla no lanza (p. ej. fuera de la ventana de 24 h de WhatsApp)', async () => {
    const enviar = vi.fn(async () => { throw new Error('131047') })
    await expect(avisarSiCorresponde('aviso', ctx, { enviar, ahora: AHORA })).resolves.toBeUndefined()
  })
})
