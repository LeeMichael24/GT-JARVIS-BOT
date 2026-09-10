import { describe, it, expect } from 'vitest'
import { familiaDeSlug, formatInvestableForPrompt, type ProjectRegistryRow } from '@/lib/projects-registry'

function row(over: Partial<ProjectRegistryRow> = {}): ProjectRegistryRow {
  return { slug: 'portacelli-alta-xyz', name: 'Portacelli Alta', project_key: 'portacelli', investable: true, active: true, ...over }
}

describe('familiaDeSlug — agrupa los listings de un mismo proyecto', () => {
  it('los tres Portacelli caen en la misma familia', () => {
    expect(familiaDeSlug('portacelli-alta-fase-1-habitacional-nuevo-cuscatlan-58448f')).toBe('portacelli')
    expect(familiaDeSlug('portacelli-alba-fase-1-habitacional-abc')).toBe('portacelli')
    expect(familiaDeSlug('portacelli-raices-fase-1-def')).toBe('portacelli')
  })

  it('Foresta queda en la suya', () => {
    expect(familiaDeSlug('foresta-townhomes-la-libertad-99')).toBe('foresta')
  })

  it('un slug raro no revienta', () => {
    expect(familiaDeSlug('')).toBe('')
  })
})

describe('formatInvestableForPrompt — el requisito que no existía', () => {
  it('sin nada marcado no afirma nada', () => {
    expect(formatInvestableForPrompt([])).toBe('')
  })

  it('con uno solo le dice cuál es y que no liste el catálogo', () => {
    const out = formatInvestableForPrompt([row()])
    expect(out).toContain('Portacelli Alta')
    expect(out).toContain('no listas el catálogo entero')
  })

  it('con varios los enumera en castellano', () => {
    const out = formatInvestableForPrompt([row(), row({ slug: 'f', name: 'Foresta Townhomes' })])
    expect(out).toContain('Portacelli Alta y Foresta Townhomes')
  })

  it('aclara que los demás siguen a la venta — no los mata', () => {
    expect(formatInvestableForPrompt([row()])).toContain('no digas que "no están disponibles"')
  })
})
