import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/services/claude/prompts'
import type { Lead, GTProject } from '@/types'

const mockLead: Lead = {
  id: 'lead-1',
  phone: '50312345678',
  name: 'Carlos',
  stage: 'new',
  bot_active: true,
  project_interest: null,
  qualification_data: null,
  first_message_at: new Date().toISOString(),
  last_message_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
}

const mockProject: GTProject = {
  slug: 'portacelli-nuevo-cuscatlan',
  name: 'Portacelli Nuevo Cuscatlán',
  type: 'venta_nueva',
  priceFrom: 95000,
  priceTo: 180000,
  currency: 'USD',
  location: 'Nuevo Cuscatlán, La Libertad',
  deliveryDate: '2026-12',
  description: 'Apartamentos modernos con amenidades premium.',
  status: 'active',
}

describe('buildSystemPrompt', () => {
  it('includes project name in the prompt', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: mockProject })
    expect(prompt).toContain('Portacelli Nuevo Cuscatlán')
  })

  it('includes formatted price range', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: mockProject })
    expect(prompt).toContain('95,000')
    expect(prompt).toContain('180,000')
  })

  it('includes lead name when known', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: mockProject })
    expect(prompt).toContain('Carlos')
  })

  it('uses "desconocido" when lead has no name', () => {
    const leadNoName = { ...mockLead, name: null }
    const prompt = buildSystemPrompt({ lead: leadNoName, project: mockProject })
    expect(prompt).toContain('desconocido')
  })

  it('includes required JSON response fields in instructions', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: mockProject })
    expect(prompt).toContain('"reply"')
    expect(prompt).toContain('"stage"')
    expect(prompt).toContain('"qualified"')
    expect(prompt).toContain('"qualification_data"')
  })

  it('includes generic GT context when no project provided', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).toContain('Grupo Terranova')
    expect(prompt).not.toContain('Portacelli')
  })

  it('includes already-qualified data when present', () => {
    const leadWithData = {
      ...mockLead,
      qualification_data: {
        purpose: 'inversion' as const,
        budget_ok: true,
        timeline: null,
        financing_needed: null,
        decision_maker: null,
      }
    }
    const prompt = buildSystemPrompt({ lead: leadWithData, project: mockProject })
    expect(prompt).toContain('inversion')
  })
})
