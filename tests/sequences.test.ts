import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub encadenable de Supabase: cada método devuelve el mismo builder y el
// await resuelve lo configurado en `resultado` para esa tabla.
const db = vi.hoisted(() => {
  const resultados: Record<string, { data?: unknown; error: { message: string } | null }> = {}
  const llamadas: { tabla: string; op: string; args: unknown[] }[] = []
  function builder(tabla: string) {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'update', 'upsert', 'insert', 'eq', 'in', 'not', 'lt', 'lte', 'order']) {
      b[op] = (...args: unknown[]) => {
        llamadas.push({ tabla, op, args })
        return b
      }
    }
    ;(b as { then: unknown }).then = (res: (v: unknown) => unknown) =>
      Promise.resolve(res(resultados[tabla] ?? { data: [], error: null }))
    return b
  }
  return {
    resultados,
    llamadas,
    getServiceClient: () => ({ from: (tabla: string) => builder(tabla) }),
  }
})
vi.mock('@/lib/supabase', () => ({ getServiceClient: db.getServiceClient }))

import {
  SEQUENCE_DEFINITIONS,
  getNextFireAt,
  isWithinBusinessHours,
  cancelSequencesForLead,
  ensureFollowUpsForSilentLeads,
} from '@/lib/sequences'

describe('sequence definitions', () => {
  it('post_conversation insiste 5 toques hasta los 30 días (cadencia D1)', () => {
    expect(SEQUENCE_DEFINITIONS.post_conversation.steps.map(s => s.delay_hours)).toEqual([24, 72, 168, 336, 720])
  })

  it('hot_close empuja 4 toques en 4 días', () => {
    expect(SEQUENCE_DEFINITIONS.hot_close.steps.map(s => s.delay_hours)).toEqual([4, 24, 48, 96])
  })

  it('nurture llega hasta los 20 días', () => {
    expect(SEQUENCE_DEFINITIONS.nurture.steps.map(s => s.delay_hours)).toEqual([48, 120, 240, 480])
  })

  it('cold_reactivation reintenta a 30/60/90 días', () => {
    expect(SEQUENCE_DEFINITIONS.cold_reactivation.steps.map(s => s.delay_hours)).toEqual([720, 1440, 2160])
  })

  it('all steps have delay_hours and purpose', () => {
    for (const [, def] of Object.entries(SEQUENCE_DEFINITIONS)) {
      for (const step of def.steps) {
        expect(step.delay_hours).toBeGreaterThan(0)
        expect(step.purpose).toBeTruthy()
      }
    }
  })
})

describe('getNextFireAt', () => {
  it('adds delay hours to current time', () => {
    const now = new Date('2026-06-27T10:00:00-06:00')
    const result = getNextFireAt(now, 24)
    expect(new Date(result).getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000)
  })
})

describe('isWithinBusinessHours', () => {
  it('returns true during business hours (8am-6pm El Salvador)', () => {
    const workday = new Date('2026-06-27T14:00:00Z') // 8am El Salvador
    expect(isWithinBusinessHours(workday)).toBe(true)
  })

  it('returns false before 8am', () => {
    const early = new Date('2026-06-27T13:00:00Z') // 7am El Salvador
    expect(isWithinBusinessHours(early)).toBe(false)
  })

  it('returns false after 6pm', () => {
    const late = new Date('2026-06-28T01:00:00Z') // 7pm El Salvador
    expect(isWithinBusinessHours(late)).toBe(false)
  })
})


// ─────────────────────────────────────────────────────────────
// El "no" explícito apaga el seguimiento pendiente
// ─────────────────────────────────────────────────────────────

describe('cancelSequencesForLead', () => {
  beforeEach(() => {
    db.llamadas.length = 0
    for (const k of Object.keys(db.resultados)) delete db.resultados[k]
  })

  it('marca cancelled solo las secuencias activas del lead', async () => {
    await cancelSequencesForLead('lead-1')
    const update = db.llamadas.find(c => c.tabla === 'sequences' && c.op === 'update')
    expect(update?.args[0]).toEqual({ status: 'cancelled' })
    const eqs = db.llamadas.filter(c => c.tabla === 'sequences' && c.op === 'eq').map(c => c.args)
    expect(eqs).toContainEqual(['lead_id', 'lead-1'])
    expect(eqs).toContainEqual(['status', 'active'])
  })

  it('si la escritura falla NO lanza (convención fail-safe)', async () => {
    db.resultados.sequences = { error: { message: 'boom' } }
    await expect(cancelSequencesForLead('lead-1')).resolves.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// Dos relojes (Supabase cada 15 min + Vercel diario) no mandan
// el mismo seguimiento dos veces
// ─────────────────────────────────────────────────────────────

describe('reclamarSecuencia', () => {
  const seq = { id: 'seq-1', next_fire_at: '2026-09-01T20:36:08.792+00:00' }

  beforeEach(() => {
    db.llamadas.length = 0
    for (const k of Object.keys(db.resultados)) delete db.resultados[k]
  })

  it('gana solo si mueve next_fire_at desde el valor que leyó, y lo aparta hacia adelante', async () => {
    const { reclamarSecuencia } = await import('@/lib/sequences')
    db.resultados.sequences = { data: [{ id: 'seq-1' }], error: null }

    expect(await reclamarSecuencia(seq)).toBe(true)

    const eqs = db.llamadas.filter(c => c.tabla === 'sequences' && c.op === 'eq').map(c => c.args)
    expect(eqs).toContainEqual(['id', 'seq-1'])
    expect(eqs).toContainEqual(['status', 'active'])
    expect(eqs).toContainEqual(['next_fire_at', '2026-09-01T20:36:08.792+00:00'])
    const update = db.llamadas.find(c => c.tabla === 'sequences' && c.op === 'update')
    const apartadaHasta = new Date((update?.args[0] as { next_fire_at: string }).next_fire_at).getTime()
    expect(apartadaHasta).toBeGreaterThan(Date.now())
  })

  it('si otra corrida ya la movió (0 filas actualizadas), pierde', async () => {
    const { reclamarSecuencia } = await import('@/lib/sequences')
    db.resultados.sequences = { data: [], error: null }
    expect(await reclamarSecuencia(seq)).toBe(false)
  })

  it('si la base falla, no la reclama ni lanza', async () => {
    const { reclamarSecuencia } = await import('@/lib/sequences')
    db.resultados.sequences = { error: { message: 'boom' } }
    expect(await reclamarSecuencia(seq)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// Red de seguridad: seguimiento aunque el modelo no lo pida
// ─────────────────────────────────────────────────────────────

describe('ensureFollowUpsForSilentLeads', () => {
  beforeEach(() => {
    db.llamadas.length = 0
    for (const k of Object.keys(db.resultados)) delete db.resultados[k]
  })

  it('crea post_conversation para leads callados sin secuencia activa', async () => {
    db.resultados.leads = {
      data: [
        { id: 'l1', stage: 'warm', sequences: [] },
        { id: 'l2', stage: 'warm', sequences: [{ status: 'active' }] },
      ],
      error: null,
    }
    const creadas = await ensureFollowUpsForSilentLeads(new Date('2026-09-01T18:00:00Z'))
    expect(creadas).toBe(1)
    const upserts = db.llamadas.filter(c => c.tabla === 'sequences' && c.op === 'upsert')
    expect(upserts).toHaveLength(1)
    const fila = upserts[0].args[0] as { lead_id: string; sequence_type: string }
    expect(fila.lead_id).toBe('l1')
    expect(fila.sequence_type).toBe('post_conversation')
  })

  it('lead hot recibe hot_close en vez de post_conversation', async () => {
    db.resultados.leads = { data: [{ id: 'l3', stage: 'hot', sequences: [] }], error: null }
    await ensureFollowUpsForSilentLeads(new Date())
    const upsert = db.llamadas.find(c => c.tabla === 'sequences' && c.op === 'upsert')
    expect((upsert?.args[0] as { sequence_type: string }).sequence_type).toBe('hot_close')
  })

  it('secuencia cancelada o completada NO cuenta como activa', async () => {
    db.resultados.leads = {
      data: [{ id: 'l4', stage: 'warm', sequences: [{ status: 'cancelled' }, { status: 'completed' }] }],
      error: null,
    }
    const creadas = await ensureFollowUpsForSilentLeads(new Date())
    expect(creadas).toBe(1)
  })

  // 13-sep-2026: se pausaron 63 seguimientos de leads de prueba antes de
  // conectar el número real; la red diaria los habría recreado al otro día.
  // Pausado es una decisión humana (panel o "Lo tomo yo"): la red la respeta.
  it('secuencia pausada SÍ cuenta: la red diaria no deshace una pausa', async () => {
    db.resultados.leads = { data: [{ id: 'l5', stage: 'warm', sequences: [{ status: 'paused' }] }], error: null }
    const creadas = await ensureFollowUpsForSilentLeads(new Date())
    expect(creadas).toBe(0)
  })

  it('si la lectura falla devuelve 0 sin lanzar (convención fail-safe)', async () => {
    db.resultados.leads = { error: { message: 'boom' } }
    await expect(ensureFollowUpsForSilentLeads(new Date())).resolves.toBe(0)
  })
})

describe('red de seguridad — los leads fríos también se recontactan', () => {
  beforeEach(() => {
    db.llamadas.length = 0
    for (const k of Object.keys(db.resultados)) delete db.resultados[k]
  })

  it('un lead cold recibe cold_reactivation en vez de quedar mudo', async () => {
    db.resultados.leads = { data: [{ id: 'lc', stage: 'cold', sequences: [] }], error: null }
    const creadas = await ensureFollowUpsForSilentLeads(new Date())
    expect(creadas).toBe(1)
    const upsert = db.llamadas.find(c => c.tabla === 'sequences' && c.op === 'upsert')
    expect((upsert?.args[0] as { sequence_type: string }).sequence_type).toBe('cold_reactivation')
  })

  it('la consulta ya no excluye el stage cold', async () => {
    db.resultados.leads = { data: [], error: null }
    await ensureFollowUpsForSilentLeads(new Date())
    const consulta = db.llamadas.find(c => c.tabla === 'leads' && c.op === 'in')
    expect(consulta?.args[1]).toContain('cold')
  })
})
