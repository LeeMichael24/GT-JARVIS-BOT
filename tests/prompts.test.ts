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

const secondProject: GTProject = {
  slug: 'quintas-campestres',
  name: 'Quintas Campestres',
  type: 'venta_nueva',
  priceFrom: 75000,
  location: 'Sonsonate',
  description: 'Casas en zona verde.',
  status: 'active',
}

const investmentProject: GTProject = {
  slug: 'foresta-townhomes',
  name: 'Foresta Townhomes',
  type: 'inversion',
  priceFrom: 400000,
  priceTo: 700000,
  currency: 'USD',
  location: 'San José Villanueva',
  description: 'Townhouses de lujo con potencial de renta vacacional.',
  status: 'active',
  entityType: 'investment',
}

// ─────────────────────────────────────────────────────────────
// Identity & format
// ─────────────────────────────────────────────────────────────

describe('buildSystemPrompt — identity and format', () => {
  it('includes Daniela identity', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).toContain('Daniela')
    expect(prompt).toContain('Grupo Terranova')
  })

  it('includes format prohibition (asterisks and numbered lists)', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).toContain('PROHIBIDO')
    expect(prompt).toContain('asteriscos')
  })

  it('includes lead name when known', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).toContain('Carlos')
  })

  it('uses "desconocido" when lead has no name', () => {
    const prompt = buildSystemPrompt({ lead: { ...mockLead, name: null }, project: null })
    expect(prompt).toContain('desconocido')
  })

  it('includes JSON response fields', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).toContain('"reply"')
    expect(prompt).toContain('"stage"')
    expect(prompt).toContain('"qualified"')
    expect(prompt).toContain('"qualification_data"')
  })
})

// ─────────────────────────────────────────────────────────────
// Project focus — critical: no other project data when focused
// ─────────────────────────────────────────────────────────────

describe('buildSystemPrompt — project focus', () => {
  it('includes focus project details', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: mockProject, projects: [mockProject, secondProject] })
    expect(prompt).toContain('Portacelli Nuevo Cuscatlán')
    expect(prompt).toContain('95,000')
    expect(prompt).toContain('180,000')
  })

  it('highlights focus project in PROYECTO ACTUAL while keeping full catalog', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: mockProject, projects: [mockProject, secondProject] })
    // Focus section present with current project
    expect(prompt).toContain('PROYECTO ACTUAL')
    expect(prompt).toContain('Portacelli Nuevo Cuscatlán')
    // Full catalog available as reference (user explicitly asked for full context)
    expect(prompt).toContain('Quintas Campestres')
  })

  it('shows catalog when no focus project', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null, projects: [mockProject, secondProject] })
    expect(prompt).toContain('Portacelli Nuevo Cuscatlán')
    expect(prompt).toContain('Quintas Campestres')
  })

  it('separates residential from investment in catalog mode', () => {
    const prompt = buildSystemPrompt({
      lead: mockLead,
      project: null,
      projects: [mockProject, investmentProject],
    })
    expect(prompt).toContain('COMPRA RESIDENCIAL')
    expect(prompt).toContain('INVERSIÓN / ROI')
  })
})

// ─────────────────────────────────────────────────────────────
// Intent instructions
// ─────────────────────────────────────────────────────────────

describe('buildSystemPrompt — intent instructions', () => {
  it('includes continuation instruction when intent is continuation', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null, intent: 'continuation' })
    expect(prompt).toContain('CONTINUACIÓN')
    expect(prompt).toContain('NO reinicies')
  })

  it('includes last bot message in continuation context', () => {
    const prompt = buildSystemPrompt({
      lead: mockLead,
      project: mockProject,
      intent: 'continuation',
      lastBotMessage: 'Te interesa visitar el proyecto?',
    })
    expect(prompt).toContain('Te interesa visitar el proyecto?')
  })

  it('includes investment guidance when intent is investment_query', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null, intent: 'investment_query' })
    expect(prompt).toContain('INVERSIÓN')
    expect(prompt).toContain('ROI')
  })

  it('includes catalog instruction when intent is catalog_request', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null, intent: 'catalog_request' })
    expect(prompt).toContain('CATÁLOGO')
  })

  it('includes no special instruction block for general intent', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null, intent: 'general' })
    expect(prompt).not.toContain('INSTRUCCIÓN DE ESTE TURNO')
  })
})

// ─────────────────────────────────────────────────────────────
// Qualification data
// ─────────────────────────────────────────────────────────────

describe('buildSystemPrompt — qualification data', () => {
  it('includes already-qualified data when present', () => {
    const leadWithData = {
      ...mockLead,
      qualification_data: {
        purpose: 'inversion' as const,
        budget_ok: true,
        timeline: null,
        financing_needed: null,
        decision_maker: null,
      },
    }
    const prompt = buildSystemPrompt({ lead: leadWithData, project: mockProject })
    expect(prompt).toContain('inversion')
  })

  it('does not include qualification block when no data', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).not.toContain('NO volver a preguntar')
  })
})

// ─────────────────────────────────────────────────────────────
// Fallback (no projects loaded)
// ─────────────────────────────────────────────────────────────

describe('buildSystemPrompt — no catalog', () => {
  it('gives generic GT context when no projects and no focus', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null, projects: [] })
    expect(prompt).toContain('Grupo Terranova')
    expect(prompt).not.toContain('Portacelli')
  })
})

// ─────────────────────────────────────────────────────────────
// History poisoning disclaimer
// ─────────────────────────────────────────────────────────────

describe('buildSystemPrompt — history poisoning guard', () => {
  it('always includes FUENTE DE VERDAD disclaimer', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).toContain('FUENTE DE VERDAD')
    expect(prompt).toContain('ÚNICA fuente válida')
  })

  it('instructs to ignore history inaccuracies', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).toContain('historial puede contener errores')
  })
})

// ─────────────────────────────────────────────────────────────
// Price type labels
// ─────────────────────────────────────────────────────────────

describe('buildSystemPrompt — price type clarity', () => {
  const rentalProject: GTProject = {
    slug: 'local-escalon',
    name: 'Local Escalón',
    type: 'alquiler',
    priceFrom: 1400,
    currency: 'USD',
    location: 'San Salvador',
    description: 'Local comercial en alquiler.',
    status: 'active',
  }

  it('labels rental price with /mes in catalog', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null, projects: [rentalProject] })
    expect(prompt).toContain('/mes')
    expect(prompt).toContain('ALQUILER MENSUAL')
  })

  it('labels rental price in focus block', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: rentalProject, projects: [rentalProject] })
    expect(prompt).toContain('Renta mensual')
    expect(prompt).toContain('/mes')
  })

  it('separates purchase properties from rental in catalog', () => {
    const prompt = buildSystemPrompt({
      lead: mockLead,
      project: null,
      projects: [mockProject, rentalProject],
    })
    expect(prompt).toContain('ALQUILER MENSUAL')
    expect(prompt).toContain('COMPRA RESIDENCIAL')
  })

  it('includes price type warning about incomparable prices', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).toContain('INCOMPARABLES')
  })
})
