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

  it('llm_model acepta gpt-5.6-terra y descarta valores desconocidos', async () => {
    db.rows = [{ key: 'llm_model', value: 'gpt-5.6-terra' }]
    expect((await getAgentSettings()).llm_model).toBe('gpt-5.6-terra')
    _clearSettingsCache()
    db.rows = [{ key: 'llm_model', value: 'gpt-9-inventado' }]
    expect((await getAgentSettings()).llm_model).toBe(DEFAULT_SETTINGS.llm_model)
  })

  it('monthly_budget_usd: default $20 (el presupuesto de la cuenta); 0 = sin tope; fuera de rango vuelve al default', async () => {
    expect(DEFAULT_SETTINGS.monthly_budget_usd).toBe(20)
    for (const [valor, esperado] of [['0', 0], ['35.5', 35.5], ['99999', 20], ['-3', 20], ['abc', 20]] as const) {
      _clearSettingsCache()
      db.rows = [{ key: 'monthly_budget_usd', value: valor }]
      expect((await getAgentSettings()).monthly_budget_usd).toBe(esperado)
    }
  })

  it('daily_budget_usd: default 0 (solo el ritmo del mes); acepta decimales; fuera de rango vuelve al default', async () => {
    expect(DEFAULT_SETTINGS.daily_budget_usd).toBe(0)
    for (const [valor, esperado] of [['0.5', 0.5], ['5000', 0], ['-3', 0], ['abc', 0]] as const) {
      _clearSettingsCache()
      db.rows = [{ key: 'daily_budget_usd', value: valor }]
      expect((await getAgentSettings()).daily_budget_usd).toBe(esperado)
    }
  })

  it('las filas internas _sys_* (contadores de gasto) no alteran ningún ajuste', async () => {
    db.rows = [{ key: '_sys_gasto_2026-09-29', value: '{"usd":3.2,"calls":40}' }, { key: '_sys_alerta_2026-09-29_aviso', value: '1' }]
    expect(await getAgentSettings()).toEqual(DEFAULT_SETTINGS)
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
