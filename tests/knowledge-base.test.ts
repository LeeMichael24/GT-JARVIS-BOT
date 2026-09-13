import { describe, it, expect, vi } from 'vitest'
import { filterPlaybookByProject, formatPlaybookForPrompt, type KBEntry } from '@/lib/knowledge-base'

function entry(project_slug: string | null, title = 't'): KBEntry {
  return { category: 'faq', topic: 'x', title, content: 'c', project_slug }
}

describe('filterPlaybookByProject', () => {
  const entries = [entry(null, 'general'), entry('portacelli', 'p1'), entry('foresta', 'f1')]

  it('con proyecto: deja lo general + lo de ese proyecto, saca el resto', () => {
    const out = filterPlaybookByProject(entries, 'portacelli')
    expect(out.map(e => e.title)).toEqual(['general', 'p1'])
  })

  // Cambio deliberado (sep-2026): antes, sin proyecto detectado, se inyectaba
  // TODO — los datos de Portacelli salían en conversaciones de Foresta o de un
  // alquiler. Ahora una entrada con alcance calla si no sabemos de qué se habla.
  it('sin proyecto: solo lo general, nunca lo anclado a un proyecto', () => {
    expect(filterPlaybookByProject(entries, null).map(e => e.title)).toEqual(['general'])
    expect(filterPlaybookByProject(entries, undefined).map(e => e.title)).toEqual(['general'])
  })

  it('lista vacía no truena', () => {
    expect(filterPlaybookByProject([], 'portacelli')).toEqual([])
  })
})

describe('presupuesto del playbook en el prompt', () => {
  function entradas(n: number, chars: number): KBEntry[] {
    return Array.from({ length: n }, (_, i) => ({
      category: 'faq', topic: `t${i}`, title: `T${i}`,
      content: 'x'.repeat(chars), project_slug: null,
    }))
  }

  it('un playbook de ~11K chars ya NO se trunca (el conocimiento de ventas cabe)', () => {
    const out = formatPlaybookForPrompt(entradas(26, 420))
    expect(out).not.toContain('playbook truncado')
  })

  it('más de 14K chars sí se trunca (el prompt no explota)', () => {
    const out = formatPlaybookForPrompt(entradas(45, 420))
    expect(out).toContain('playbook truncado')
    expect(out.length).toBeLessThan(14200)
  })
})

describe('filterPlaybookByProject — alcance por familia (fuga Portacelli → todo)', () => {
  const ALTA = 'portacelli-alta-fase-1-habitacional-nuevo-cuscatlan-58448f'
  const entries: KBEntry[] = [
    // universal: técnica de venta, vale en toda conversación
    { category: 'sales_playbook', topic: 'anclaje_precio', title: 'Ancla alto', content: '...', project_slug: null, project_key: null },
    // universal: ley salvadoreña
    { category: 'faq', topic: 'costos_cierre', title: 'ITBR y CNR', content: '...', project_slug: null, project_key: null },
    // familia Portacelli: vale para Alta, Alba y Raíces
    { category: 'faq', topic: 'parqueos', title: '2 parqueos', content: '...', project_slug: null, project_key: 'portacelli' },
    { category: 'faq', topic: 'descuento_contado', title: 'Prima de contado', content: '...', project_slug: null, project_key: 'portacelli' },
    // un listing exacto
    { category: 'project_pitch', topic: 'pitch_alta', title: 'Alta', content: '...', project_slug: ALTA, project_key: null },
  ]

  it('en Portacelli Alta entra todo: universal + familia + su propio listing', () => {
    const r = filterPlaybookByProject(entries, ALTA, 'Portacelli Alta - Fase 1 Habitacional')
    expect(r.map(e => e.topic).sort()).toEqual(
      ['anclaje_precio', 'costos_cierre', 'descuento_contado', 'parqueos', 'pitch_alta'].sort()
    )
  })

  it('en Portacelli Alba entra la familia pero NO el pitch de Alta', () => {
    const r = filterPlaybookByProject(entries, 'portacelli-alba-xyz', 'Portacelli Alba - Fase 1 Habitacional')
    expect(r.map(e => e.topic)).toContain('parqueos')
    expect(r.map(e => e.topic)).not.toContain('pitch_alta')
  })

  it('en Foresta NO se cuela ningún dato de Portacelli', () => {
    const r = filterPlaybookByProject(entries, 'foresta-townhomes-abc', 'Foresta Townhomes')
    expect(r.map(e => e.topic).sort()).toEqual(['anclaje_precio', 'costos_cierre'])
  })

  it('sin proyecto en conversación solo queda lo universal', () => {
    const r = filterPlaybookByProject(entries, null, null)
    expect(r.map(e => e.topic).sort()).toEqual(['anclaje_precio', 'costos_cierre'])
    expect(r.some(e => e.topic === 'descuento_contado')).toBe(false)
  })

  it('un alquiler en Escalón no hereda los parqueos de Portacelli', () => {
    const r = filterPlaybookByProject(entries, 'apartamento-con-vista-escalon-d8131f', 'Apartamento Con Vista Escalón')
    expect(r.some(e => e.topic === 'parqueos')).toBe(false)
  })
})

describe('getPlaybook — tolerante a que la migración 019 no haya corrido', () => {
  it('reintenta sin project_key cuando la columna no existe', async () => {
    const intentos: string[] = []
    const build = (cols: string) => {
      intentos.push(cols)
      const falta = cols.includes('project_key')
      const chain = {
        eq: () => chain,
        order: async () => falta
          ? { data: null, error: { message: 'column knowledge_base.project_key does not exist' } }
          : { data: [{ category: 'faq', topic: 't', title: 'T', content: 'c', project_slug: null }], error: null },
      }
      return chain
    }
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({ from: () => ({ select: build }) }),
    }))
    vi.resetModules()
    const { getPlaybook } = await import('@/lib/knowledge-base')
    const out = await getPlaybook()

    expect(intentos).toHaveLength(2)
    expect(intentos[0]).toContain('project_key')
    expect(intentos[1]).not.toContain('project_key')
    expect(out).toHaveLength(1)
    vi.doUnmock('@supabase/supabase-js')
    vi.resetModules()
  })
})

// ─── 13-sep-2026: el tope cortaba a mitad de texto y por posición en la BD ───
// Con 62 entradas quedaban FUERA las 5 técnicas de cierre y 9 de 11 objeciones,
// y entraban el post-venta y la compra corporativa. Lo que vende va primero.
describe('formatPlaybookForPrompt — lo que vende entra primero y entero', () => {
  const e = (category: string, topic: string, chars: number, extra: Partial<KBEntry> = {}): KBEntry =>
    ({ category, topic, title: topic, content: topic + ' ' + 'x'.repeat(chars), project_slug: null, ...extra })

  it('ficha del proyecto, cierres y objeciones van antes que FAQ y playbook general', () => {
    const out = formatPlaybookForPrompt([
      e('faq', 'costos_cierre', 50),
      e('sales_playbook', 'seguimiento_postventa', 50),
      e('objection', 'obj_muy_caro', 50),
      e('closing_technique', 'cierre_visita', 50),
      e('faq', 'ficha_pago', 50, { project_slug: 'portacelli-alta' }),
    ])
    const pos = (t: string) => out.indexOf(t + ':')
    expect(pos('ficha_pago')).toBeLessThan(pos('cierre_visita'))
    expect(pos('cierre_visita')).toBeLessThan(pos('obj_muy_caro'))
    expect(pos('obj_muy_caro')).toBeLessThan(pos('seguimiento_postventa'))
    expect(pos('seguimiento_postventa')).toBeLessThan(pos('costos_cierre'))
  })

  it('cuando no cabe, deja afuera entradas enteras — nunca corta una a la mitad', () => {
    const muchas = [
      ...Array.from({ length: 10 }, (_, i) => e('closing_technique', `cierre_${i}`, 440)),
      ...Array.from({ length: 30 }, (_, i) => e('faq', `faq_${i}`, 440)),
    ]
    const out = formatPlaybookForPrompt(muchas)
    for (const x of muchas) {
      const idx = out.indexOf(x.title + ':')
      if (idx >= 0) expect(out).toContain(x.content)
    }
    for (let i = 0; i < 10; i++) expect(out).toContain(`cierre_${i}:`)
  })
})
