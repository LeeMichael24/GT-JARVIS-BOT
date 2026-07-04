import { describe, it, expect } from 'vitest'
import { scoreLead } from '@/lib/lead-scoring'

const NOW = Date.parse('2026-07-03T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString()

const emptyQual = { purpose: null, budget_ok: null, timeline: null, financing_needed: null, decision_maker: null }

describe('scoreLead — A/B/C determinista', () => {
  it('A: hot + presupuesto + timeline inmediato', () => {
    const r = scoreLead({
      stage: 'hot',
      qualification_data: { ...emptyQual, budget_ok: true, timeline: 'inmediato' },
      last_message_at: hoursAgo(2),
    }, NOW)
    expect(r.score).toBe('A')
    expect(r.reasons).toContain('Presupuesto confirmado')
    expect(r.reasons).toContain('Timeline inmediato')
  })

  it('B: warm con timeline a 3 meses', () => {
    const r = scoreLead({
      stage: 'warm',
      qualification_data: { ...emptyQual, timeline: '3_meses' },
      last_message_at: hoursAgo(72),
    }, NOW)
    expect(r.score).toBe('B')
  })

  it('C: lead nuevo sin señales', () => {
    const r = scoreLead({
      stage: 'new',
      qualification_data: emptyQual,
      last_message_at: hoursAgo(1),
    }, NOW)
    expect(r.score).toBe('C')
  })

  it('C: hot pero abandonado +7 días pierde puntos', () => {
    const r = scoreLead({
      stage: 'hot',
      qualification_data: emptyQual,
      last_message_at: hoursAgo(24 * 10),
    }, NOW)
    // 3 (hot) - 2 (inactivo) = 1 → C
    expect(r.score).toBe('C')
    expect(r.reasons).toContain('Sin actividad +7 días')
  })

  it('inversionista con decisión propia suma señales', () => {
    const r = scoreLead({
      stage: 'warm',
      qualification_data: { ...emptyQual, purpose: 'inversion', decision_maker: true, budget_ok: true },
      last_message_at: hoursAgo(3),
    }, NOW)
    // 2 + 1 + 1 + 2 + 1 = 7 → A
    expect(r.score).toBe('A')
  })

  it('qualification_data null no explota', () => {
    const r = scoreLead({ stage: 'new', qualification_data: null, last_message_at: hoursAgo(1) }, NOW)
    expect(r.score).toBe('C')
  })
})
