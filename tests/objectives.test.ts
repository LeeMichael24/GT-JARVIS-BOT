import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  getServiceClient: vi.fn(() => ({ from: vi.fn() })),
}))

import { formatObjectivesForPrompt } from '@/lib/objectives'
import type { AgentObjective } from '@/types'

function obj(partial: Partial<AgentObjective>): AgentObjective {
  return {
    id: crypto.randomUUID(), scope: 'general', target_key: null,
    objective: 'x', priority: 100, active: true,
    created_at: '', updated_at: '',
    ...partial,
  }
}

describe('formatObjectivesForPrompt', () => {
  it('sin objetivos → sección vacía (se omite del prompt)', () => {
    expect(formatObjectivesForPrompt([])).toBe('')
  })

  it('los generales aplican siempre', () => {
    const out = formatObjectivesForPrompt([
      obj({ scope: 'general', objective: 'Calificar y agendar visitas' }),
    ])
    expect(out).toContain('OBJETIVOS GENERALES')
    expect(out).toContain('- Calificar y agendar visitas')
  })

  it('los de proyecto solo aplican con match del proyecto en foco', () => {
    const objectives = [
      obj({ scope: 'project', target_key: 'Portacelli Alta', objective: 'Empujar preventa' }),
    ]
    // Sin proyecto en foco → no aparece
    expect(formatObjectivesForPrompt(objectives, {})).toBe('')
    // Con el proyecto correcto → aparece (match case-insensitive y parcial)
    const out = formatObjectivesForPrompt(objectives, { projectNames: ['portacelli alta', 'portacelli-alta'] })
    expect(out).toContain('OBJETIVO PARA ESTE PROYECTO (Portacelli Alta)')
    expect(out).toContain('- Empujar preventa')
    // Con otro proyecto → no aparece
    expect(formatObjectivesForPrompt(objectives, { projectNames: ['Foresta'] })).toBe('')
  })

  it('los de inversión aplican por nombre de sub-inversión o por proyecto cuando el tema es inversión', () => {
    const objectives = [
      obj({ scope: 'investment', target_key: 'Foresta El Encanto', objective: 'Priorizar ROI anual' }),
    ]
    // Match directo por nombre de inversión
    const bySub = formatObjectivesForPrompt(objectives, { investmentNames: ['Foresta El Encanto - Etapa 2'] })
    expect(bySub).toContain('OBJETIVO PARA ESTA INVERSIÓN')
    // Match por proyecto en foco cuando el tema ES inversión
    const byTopic = formatObjectivesForPrompt(objectives, {
      projectNames: ['Foresta El Encanto'], isInvestmentTopic: true,
    })
    expect(byTopic).toContain('- Priorizar ROI anual')
    // Proyecto en foco pero el tema NO es inversión → no aplica
    expect(formatObjectivesForPrompt(objectives, { projectNames: ['Foresta El Encanto'], isInvestmentTopic: false })).toBe('')
  })

  it('combina general + proyecto en una sola sección ordenada', () => {
    const out = formatObjectivesForPrompt([
      obj({ scope: 'general', objective: 'Meta general' }),
      obj({ scope: 'project', target_key: 'Portacelli', objective: 'Meta del proyecto' }),
    ], { projectNames: ['Portacelli Alta'] })
    expect(out).toContain('OBJETIVOS DEL NEGOCIO')
    expect(out).toContain('Meta general')
    expect(out).toContain('Meta del proyecto')
  })
})
