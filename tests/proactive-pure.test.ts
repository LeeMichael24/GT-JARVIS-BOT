import { describe, it, expect } from 'vitest'
import { isLeadEligible, matchesRule, rankByStage, MIN_PROACTIVE_GAP_DAYS } from '@/lib/proactive/eligibility'
import { renderTemplate, buildRecipientParams } from '@/lib/proactive/render'
import { matchLeadsToListing } from '@/lib/proactive/matching'
import type { Lead, LeadStage } from '@/types'

const NOW = Date.parse('2026-06-11T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString()

const baseLead: Lead = {
  id: 'l1', phone: '503', name: 'Carlos', stage: 'warm', bot_active: true,
  project_interest: null, qualification_data: null, assigned_to: null,
  opted_out: false, last_proactive_at: null,
  first_message_at: '', last_message_at: daysAgo(10), created_at: '',
} as Lead
const mk = (over: Partial<Lead> = {}): Lead => ({ ...baseLead, ...over })

describe('isLeadEligible', () => {
  it('elegible por defecto', () => {
    expect(isLeadEligible(mk(), NOW)).toBe(true)
  })
  it('opted_out nunca es elegible', () => {
    expect(isLeadEligible(mk({ opted_out: true }), NOW)).toBe(false)
  })
  it('bot pausado (atendido por humano) no es elegible', () => {
    expect(isLeadEligible(mk({ bot_active: false }), NOW)).toBe(false)
  })
  it('proactivo reciente (< gap) no es elegible; viejo sí', () => {
    expect(isLeadEligible(mk({ last_proactive_at: daysAgo(MIN_PROACTIVE_GAP_DAYS - 1) }), NOW)).toBe(false)
    expect(isLeadEligible(mk({ last_proactive_at: daysAgo(MIN_PROACTIVE_GAP_DAYS + 1) }), NOW)).toBe(true)
  })
})

describe('matchesRule', () => {
  const rule = { stages: ['hot', 'warm'] as LeadStage[], tag_ids: null, days_inactive: 5 }
  it('cumple etapa y días desde el último mensaje del cliente', () => {
    expect(matchesRule(mk({ stage: 'hot' }), [], rule, daysAgo(6), NOW)).toBe(true)
  })
  it('etapa fuera del filtro no cumple', () => {
    expect(matchesRule(mk({ stage: 'cold' }), [], rule, daysAgo(6), NOW)).toBe(false)
  })
  it('mensaje del cliente reciente no cumple', () => {
    expect(matchesRule(mk({ stage: 'hot' }), [], rule, daysAgo(3), NOW)).toBe(false)
  })
  it('cliente que nunca escribió no cumple', () => {
    expect(matchesRule(mk({ stage: 'hot' }), [], rule, null, NOW)).toBe(false)
  })
  it('filtro de tags: basta UNA coincidencia', () => {
    const r = { stages: null, tag_ids: ['t1', 't2'], days_inactive: 1 }
    expect(matchesRule(mk({}), ['t2', 'x'], r, daysAgo(2), NOW)).toBe(true)
    expect(matchesRule(mk({}), ['x'], r, daysAgo(2), NOW)).toBe(false)
  })
  it('sin filtros (null) aplica a todos con los días cumplidos', () => {
    const r = { stages: null, tag_ids: null, days_inactive: 5 }
    expect(matchesRule(mk({ stage: 'cold' }), [], r, daysAgo(30), NOW)).toBe(true)
  })
})

describe('rankByStage', () => {
  it('ordena hot → warm → new → cold, estable', () => {
    const ls = [mk({ id: 'c', stage: 'cold' }), mk({ id: 'h1', stage: 'hot' }), mk({ id: 'n', stage: 'new' }), mk({ id: 'h2', stage: 'hot' }), mk({ id: 'w', stage: 'warm' })]
    expect(rankByStage(ls).map(l => l.id)).toEqual(['h1', 'h2', 'w', 'n', 'c'])
  })
})

describe('renderTemplate / buildRecipientParams', () => {
  it('sustituye {{1}} y {{2}}', () => {
    expect(renderTemplate('Hola {{1}}, mira {{2}}', ['Ana', 'Torre X'])).toBe('Hola Ana, mira Torre X')
  })
  it('parámetro faltante queda vacío', () => {
    expect(renderTemplate('Hola {{1}} y {{2}}', ['Ana'])).toBe('Hola Ana y ')
  })
  it('params del lead con nombre e interés', () => {
    expect(buildRecipientParams(mk({ name: ' Ana ', project_interest: 'Portacelli' }), { variables: 2 }))
      .toEqual(['Ana', 'Portacelli'])
  })
  it('fallbacks: sin nombre y sin interés', () => {
    expect(buildRecipientParams(mk({ name: null, project_interest: null }), { variables: 2 }))
      .toEqual(['qué gusto saludarte', 'nuestras propiedades'])
  })
  it('listingName tiene prioridad sobre project_interest', () => {
    expect(buildRecipientParams(mk({ project_interest: 'Portacelli' }), { variables: 2, listingName: 'Torre Nueva' }))
      .toEqual(['Carlos', 'Torre Nueva'])
  })
  it('respeta el número de variables de la plantilla', () => {
    expect(buildRecipientParams(mk({}), { variables: 1 })).toEqual(['Carlos'])
    expect(buildRecipientParams(mk({}), { variables: 0 })).toEqual([])
  })
})

describe('matchLeadsToListing', () => {
  const listing = { name: 'Torre Inversión Cuscatlán', entityType: 'investment' as const, type: 'Apartamentos', location: 'Nuevo Cuscatlán' }
  const qual = (purpose: 'inversion' | 'vivienda_propia' | 'ambos' | null) =>
    ({ purpose, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null })

  it('inversionista hot con interés compatible puntúa alto y trae razón legible', () => {
    const l = mk({ id: 'a', stage: 'hot', qualification_data: qual('inversion'), project_interest: 'apartamentos en cuscatlán' })
    const out = matchLeadsToListing(listing, [l])
    expect(out).toHaveLength(1)
    expect(out[0].score).toBe(6) // 3 propósito + 2 hot + 1 interés
    expect(out[0].reason).toContain('Inversión')
  })
  it('propósito incompatible y etapa fría queda fuera (score < 3)', () => {
    const l = mk({ id: 'b', stage: 'cold', qualification_data: qual('vivienda_propia') })
    expect(matchLeadsToListing(listing, [l])).toHaveLength(0)
  })
  it('ambos cuenta como compatible', () => {
    const l = mk({ id: 'c', stage: 'new', qualification_data: qual('ambos') })
    expect(matchLeadsToListing(listing, [l])).toHaveLength(1) // 3 + 0
  })
  it('ordena por score desc y corta en 50', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      mk({ id: `l${i}`, stage: i % 2 ? 'hot' : 'warm', qualification_data: qual('inversion') }))
    const out = matchLeadsToListing(listing, many)
    expect(out).toHaveLength(50)
    expect(out[0].score).toBeGreaterThanOrEqual(out[49].score)
  })
  it('residencial: vivienda_propia compatible con project/residency', () => {
    const res = { name: 'Foresta', entityType: 'project' as const, type: 'Townhomes', location: 'El Encanto' }
    const l = mk({ id: 'd', stage: 'warm', qualification_data: qual('vivienda_propia') })
    expect(matchLeadsToListing(res, [l])).toHaveLength(1) // 3 + 1
  })
  it('singular/plural: "apartamento" matchea type "Apartamentos"', () => {
    const l = mk({ id: 'sp', stage: 'new', qualification_data: qual('inversion'), project_interest: 'busco un apartamento' })
    const out = matchLeadsToListing(listing, [l])
    expect(out[0]?.score).toBe(4) // 3 propósito + 1 interés
  })
  it('"casado" NO matchea una casa (igualdad de tokens, no substring)', () => {
    const casaListing = { name: 'Casa Bella', entityType: 'project' as const, type: 'Casas', location: 'Santa Tecla' }
    const l = mk({ id: 'fp', stage: 'new', qualification_data: qual('vivienda_propia'), project_interest: 'soy casado y busco algo' })
    const out = matchLeadsToListing(casaListing, [l])
    expect(out[0]?.score).toBe(3) // solo propósito; SIN bonus de interés
  })
})
