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
  assigned_to: null,
  opted_out: false,
  last_proactive_at: null,
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
    expect(prompt).toContain('"qualification_data"')
    // el campo muerto "qualified" salió del contrato (nadie lo consumía)
    expect(prompt).not.toContain('"qualified"')
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
    // No dynamic catalog section when projects is empty
    expect(prompt).not.toContain('propiedades activas')
    expect(prompt).not.toContain('CATÁLOGO GRUPO TERRANOVA')
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

  it('warns that assistant messages are inferences, not client facts', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).toContain('ASISTENTE')
    expect(prompt).toContain('inferencias')
  })

  it('includes anti-loop rule', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null })
    expect(prompt).toContain('ANTI-LOOP')
  })
})

// ─────────────────────────────────────────────────────────────
// Investment intent catalog isolation
// ─────────────────────────────────────────────────────────────

describe('buildSystemPrompt — investment intent catalog isolation', () => {
  const rentalProject: GTProject = {
    slug: 'local-escalon-alquiler',
    name: 'Local Escalón',
    type: 'alquiler',
    priceFrom: 1400,
    currency: 'USD',
    location: 'San Salvador',
    description: 'Local comercial en alquiler.',
    status: 'active',
  }

  it('shows only investment catalog when intent is investment_query', () => {
    const prompt = buildSystemPrompt({
      lead: mockLead,
      project: null,
      projects: [mockProject, investmentProject, rentalProject],
      intent: 'investment_query',
    })
    expect(prompt).toContain('PORTAFOLIO DE INVERSIONES')
    expect(prompt).not.toContain('COMPRA RESIDENCIAL')
    // Check for the catalog bucket header specifically (not the static price-type section)
    expect(prompt).not.toContain('ALQUILER MENSUAL (precio por mes)')
  })

  it('includes investment project but not residential in investment_query mode', () => {
    const prompt = buildSystemPrompt({
      lead: mockLead,
      project: null,
      projects: [mockProject, investmentProject],
      intent: 'investment_query',
    })
    expect(prompt).toContain('Foresta Townhomes')
    expect(prompt).not.toContain('Portacelli Nuevo Cuscatlán')
  })

  it('uses investment-specific focus block when detected project is an investment entity', () => {
    const prompt = buildSystemPrompt({
      lead: mockLead,
      project: investmentProject,
      projects: [mockProject, investmentProject],
      intent: 'investment_query',
    })
    expect(prompt).toContain('PROYECTO DE INVERSIÓN ACTUAL')
    expect(prompt).not.toContain('COMPRA RESIDENCIAL')
  })

  it('falls back to full catalog when investment_query but no investment projects exist', () => {
    const prompt = buildSystemPrompt({
      lead: mockLead,
      project: null,
      projects: [mockProject],
      intent: 'investment_query',
    })
    // No investment bucket → falls through to full catalog display
    expect(prompt).toContain('CATÁLOGO GRUPO TERRANOVA')
  })

  it('investment_query intent instruction includes REGLA to not mention residentials', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null, intent: 'investment_query' })
    expect(prompt).toContain('SOLO habla de productos de INVERSIÓN')
    expect(prompt).toContain('NO menciones proyectos residenciales')
  })
})

// ─────────────────────────────────────────────────────────────
// GT URL context
// ─────────────────────────────────────────────────────────────

describe('buildSystemPrompt — GT URL context', () => {
  it('includes inversiones URL instruction when gtUrlSection is inversiones', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null, gtUrlSection: 'inversiones' })
    expect(prompt).toContain('INVERSIONES')
    expect(prompt).toContain('enlace')
  })

  it('no special URL block when gtUrlSection is null', () => {
    const prompt = buildSystemPrompt({ lead: mockLead, project: null, gtUrlSection: null })
    expect(prompt).not.toContain('enlace de la sección')
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

// ─────────────────────────────────────────────────────────────
// Memoria del deal: señales reinyectadas al prompt (Tarea 1)
// ─────────────────────────────────────────────────────────────

describe('dealBlock con señales', () => {
  it('inyecta objeciones y señales de compra previas al prompt', () => {
    const prompt = buildSystemPrompt({
      lead: mockLead,
      project: null,
      dealSummary: {
        summary: 'Cliente evaluando Portacelli',
        next_action: 'Confirmar visita',
        signals: {
          objections: ['precio alto', 'lejos del trabajo'],
          buying_signals: ['preguntó por financiamiento'],
          budget_mentioned: 85000,
          preferred_zone: 'Santa Tecla',
          engagement_level: 'high',
        },
      },
    })
    expect(prompt).toContain('precio alto')
    expect(prompt).toContain('preguntó por financiamiento')
    expect(prompt).toContain('85,000')
    expect(prompt).toContain('Santa Tecla')
    expect(prompt).toContain('high')
  })

  it('sin señales, el dealBlock queda igual que antes', () => {
    const prompt = buildSystemPrompt({
      lead: mockLead,
      project: null,
      dealSummary: { summary: 'Resumen previo', next_action: null },
    })
    expect(prompt).toContain('Resumen previo')
    expect(prompt).not.toContain('Objeciones que YA planteó')
  })

  it('señales vacías no agregan líneas de ruido', () => {
    const prompt = buildSystemPrompt({
      lead: mockLead,
      project: null,
      dealSummary: { summary: 'Resumen', next_action: null, signals: { objections: [], buying_signals: [] } },
    })
    expect(prompt).not.toContain('Objeciones que YA planteó')
    expect(prompt).not.toContain('Señales de compra ya detectadas')
  })
})

// ─── Regresión 13-sep-2026: "te envío el brochure con planos y precios" ×3, nunca llegó ───
describe('prompt — material: solo lo que existe, dicho con su nombre real', () => {
  const inventario = [
    'Portacelli Alta - Fase 1 Habitacional: brochure ("Broshure apartamentos alta"), imagen, video',
    'Portacelli (Alta, Alba y Raíces): ubicación ("Ubicación exacta de Portacelli en Google Earth")',
  ]
  const conMedia = () => buildSystemPrompt({ lead: mockLead, project: mockProject, projects: [mockProject], mediaInventory: inventario })

  it('ya no le dicta prometer "planos y precios" sin saber qué trae el documento', () => {
    expect(conMedia()).not.toContain('planos y precios')
  })

  it('lista el material por listing y tipo, no solo el nombre de la familia', () => {
    expect(conMedia()).toContain('Portacelli Alta - Fase 1 Habitacional: brochure ("Broshure apartamentos alta")')
  })

  it('si dice que lo envía, send_media va en la MISMA respuesta', () => {
    expect(conMedia()).toContain('en la misma respuesta')
  })

  it('si pregunta dónde queda y hay link de ubicación, lo manda sin preguntar primero', () => {
    expect(conMedia()).toContain('no preguntes si lo quiere')
  })

  it('las notas [Material …] del historial son registro interno: no se imitan', () => {
    expect(conMedia()).toContain('[Material')
    expect(conMedia()).toContain('nunca las escribas tú')
  })

  it('no promete plusvalía', () => {
    expect(conMedia()).toContain('nunca digas que una zona o un proyecto "promete"')
  })

  it('sin inventario sigue prohibiendo ofrecer documentos', () => {
    const p = buildSystemPrompt({ lead: mockLead, project: mockProject, projects: [mockProject] })
    expect(p).toContain('NUNCA ofrezcas enviar fichas')
  })
})

// ─── Venta guiada: responder + gancho + lazo abierto (13-sep-2026) ───
// Daniela respondía y se callaba: el prompt le decía seis veces que cerrara
// sin nada. Mike quiere que oriente y deje intriga del siguiente paso, SIN
// volver a interrogar con preguntas de trámite (commit a3df2b6).
describe('prompt — venta guiada', () => {
  const p = () => buildSystemPrompt({ lead: mockLead, project: mockProject, projects: [mockProject] })

  it('trae el método: responde, suma un gancho y deja un lazo abierto', () => {
    const t = p()
    expect(t).toContain('VENTA GUIADA')
    expect(t).toContain('SUMA UN GANCHO')
    expect(t).toContain('DEJA UN LAZO ABIERTO')
  })

  it('el lazo no es una pregunta de trámite', () => {
    expect(p()).toContain('El lazo no es una pregunta')
  })

  it('ya no le enseña a soltar el dato e irse', () => {
    const t = p()
    expect(t).not.toContain('Un vendedor de verdad responde y se calla')
    expect(t).not.toContain('dar el dato y quedarte ahí es un cierre válido')
    expect(t).not.toContain('El cierre es OPCIONAL')
    expect(t).not.toContain('o simplemente no cierras con nada')
  })

  it('respeta al cliente que pidió tiempo: ahí no hay lazo', () => {
    expect(p()).toContain('Excepción que manda')
  })

  it('el lazo solo con respaldo real — nada de escasez ni material inventado', () => {
    expect(p()).toContain('Todo lazo va respaldado por algo real')
  })

  it('manda sobre lo que el conocimiento diga de cerrar siempre con pregunta', () => {
    expect(p()).toContain('esta regla manda')
  })

  it('lo último que lee antes de responder es el chequeo del lazo, no "respondé y callate"', () => {
    const t = p()
    expect(t.lastIndexOf('ANTES DE ENVIAR')).toBeGreaterThan(t.indexOf('MISIÓN DE CALIFICACIÓN'))
  })

  it('el bloque existe en el panel como bloque editable', async () => {
    const { PROMPT_BLOCK_KEYS } = await import('@/lib/prompt-blocks')
    expect(PROMPT_BLOCK_KEYS).toContain('venta_guiada')
  })
})

describe('prompt — el lazo se declara en el JSON y se demuestra con ejemplos', () => {
  const p = () => buildSystemPrompt({ lead: mockLead, project: mockProject, projects: [mockProject] })

  it('el formato de respuesta pide lazo_abierto', () => {
    expect(p()).toContain('"lazo_abierto"')
  })

  it('explica cuándo va null: solo si pidió tiempo, se despidió o es trámite', () => {
    expect(p()).toContain('null SOLO si el cliente pidió tiempo')
  })

  it('venta guiada trae ejemplos completos, no solo reglas', async () => {
    const { DEFAULT_PROMPT_BLOCKS } = await import('@/lib/prompt-blocks')
    expect(DEFAULT_PROMPT_BLOCKS.venta_guiada).toContain('EJEMPLOS COMPLETOS')
  })

  it('ningún ejemplo usa frases prohibidas', async () => {
    const { DEFAULT_PROMPT_BLOCKS } = await import('@/lib/prompt-blocks')
    expect(DEFAULT_PROMPT_BLOCKS.venta_guiada.toLowerCase()).not.toContain('estoy aquí')
    expect(DEFAULT_PROMPT_BLOCKS.venta_guiada.toLowerCase()).not.toContain('no dudes')
  })
})

describe('prompt — segunda iteración de venta guiada', () => {
  const p = () => buildSystemPrompt({ lead: mockLead, project: mockProject, projects: [mockProject] })

  it('los ejemplos no traen frases completas que el modelo copie textual', async () => {
    const { DEFAULT_PROMPT_BLOCKS } = await import('@/lib/prompt-blocks')
    const b = DEFAULT_PROMPT_BLOCKS.venta_guiada
    // copiadas palabra por palabra en la evaluación del 13-sep
    expect(b).not.toContain('esa vista hay que verla en persona para dimensionarla')
    expect(b).not.toContain('es una decisión para tomarla juntos')
    expect(b).toContain('nunca copies')
  })

  it('el lazo no puede ser una pregunta ni el precio a secas', () => {
    expect(p()).toContain('no puede ser una pregunta')
  })
})

describe('prompt — piensa antes de escribir', () => {
  const p = () => buildSystemPrompt({ lead: mockLead, project: mockProject, projects: [mockProject] })

  it('en el formato de respuesta, "plan" va antes que "reply"', () => {
    const t = p()
    const formato = t.slice(t.indexOf('# RESPUESTA — JSON'))
    expect(formato.indexOf('"plan"')).toBeGreaterThan(-1)
    expect(formato.indexOf('"plan"')).toBeLessThan(formato.indexOf('"reply"'))
  })

  it('explica que el reply ejecuta el plan', () => {
    expect(p()).toContain('PIENSA ANTES DE ESCRIBIR')
  })
})
