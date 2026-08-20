import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  rows: [] as { key: string; value: string }[],
  fail: false,
}))

vi.mock('@/lib/supabase', () => ({
  getServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(async () =>
        db.fail ? { data: null, error: { message: 'no table' } } : { data: db.rows, error: null },
      ),
    })),
  })),
}))

import { getAgentSettings, DEFAULT_SETTINGS, _clearSettingsCache } from '@/lib/agent-settings'

beforeEach(() => {
  db.rows = []
  db.fail = false
  _clearSettingsCache()
})

describe('agent settings — perillas nuevas (migración 012)', () => {
  it('sin tabla → defaults completos (fail-safe)', async () => {
    db.fail = true
    const s = await getAgentSettings()
    expect(s).toEqual(DEFAULT_SETTINGS)
    expect(s.agent_enabled).toBe(true)
    expect(s.ceo_name).toBe('Michael Narváez')
  })

  it('agent_enabled=false pausa globalmente', async () => {
    db.rows = [{ key: 'agent_enabled', value: 'false' }]
    const s = await getAgentSettings()
    expect(s.agent_enabled).toBe(false)
  })

  it('parsea las perillas numéricas', async () => {
    db.rows = [
      { key: 'escalation_budget_usd', value: '500000' },
      { key: 'escalation_units', value: '5' },
      { key: 'reply_max_chars', value: '350' },
      { key: 'llm_temperature', value: '0.6' },
      { key: 'business_hours_start', value: '9' },
      { key: 'business_hours_end', value: '17' },
      { key: 'history_window', value: '20' },
      { key: 'brain_min_confidence', value: '0.6' },
      { key: 'auto_promote_threshold', value: '4' },
    ]
    const s = await getAgentSettings()
    expect(s.escalation_budget_usd).toBe(500_000)
    expect(s.escalation_units).toBe(5)
    expect(s.reply_max_chars).toBe(350)
    expect(s.llm_temperature).toBe(0.6)
    expect(s.business_hours_start).toBe(9)
    expect(s.business_hours_end).toBe(17)
    expect(s.history_window).toBe(20)
    expect(s.brain_min_confidence).toBe(0.6)
    expect(s.auto_promote_threshold).toBe(4)
  })

  it('valores corruptos o fuera de rango → default (una fila mala nunca rompe a Daniela)', async () => {
    db.rows = [
      { key: 'escalation_budget_usd', value: 'muchísimo' },
      { key: 'llm_temperature', value: '99' },
      { key: 'history_window', value: '-3' },
      { key: 'ceo_name', value: '' },
      { key: 'business_hours_start', value: '25' },
    ]
    const s = await getAgentSettings()
    expect(s.escalation_budget_usd).toBe(DEFAULT_SETTINGS.escalation_budget_usd)
    expect(s.llm_temperature).toBe(DEFAULT_SETTINGS.llm_temperature)
    expect(s.history_window).toBe(DEFAULT_SETTINGS.history_window)
    expect(s.ceo_name).toBe(DEFAULT_SETTINGS.ceo_name)
    expect(s.business_hours_start).toBe(DEFAULT_SETTINGS.business_hours_start)
  })

  it('ceo_name válido se aplica', async () => {
    db.rows = [{ key: 'ceo_name', value: 'Ana López' }]
    const s = await getAgentSettings()
    expect(s.ceo_name).toBe('Ana López')
  })
})
