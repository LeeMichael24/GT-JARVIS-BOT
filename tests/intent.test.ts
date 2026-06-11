import { describe, it, expect } from 'vitest'
import { classifyIntent, extractLastBotMessage } from '@/services/claude/intent'
import type { Conversation } from '@/types'

const noHistory: Conversation[] = []

const historyWithBot: Conversation[] = [
  { id: '1', lead_id: 'l1', role: 'user', content: 'Hola', wa_message_id: null, sent_by: null, created_at: '2024-01-01T00:00:00Z' },
  { id: '2', lead_id: 'l1', role: 'assistant', content: 'Hola! Soy Daniela. ¿Qué tipo de propiedad buscas?', wa_message_id: null, sent_by: null, created_at: '2024-01-01T00:01:00Z' },
]

// ─────────────────────────────────────────────────────────────
// classifyIntent — continuation
// ─────────────────────────────────────────────────────────────

describe('classifyIntent — continuation', () => {
  it('detects "sí" as continuation', () => {
    expect(classifyIntent('sí', noHistory)).toBe('continuation')
  })

  it('detects "porfavor" as continuation', () => {
    expect(classifyIntent('porfavor', noHistory)).toBe('continuation')
  })

  it('detects "por favor" as continuation', () => {
    expect(classifyIntent('por favor', noHistory)).toBe('continuation')
  })

  it('detects "claro" as continuation', () => {
    expect(classifyIntent('claro', noHistory)).toBe('continuation')
  })

  it('detects "hola" as continuation', () => {
    expect(classifyIntent('hola', noHistory)).toBe('continuation')
  })

  it('detects "hola?" as continuation', () => {
    expect(classifyIntent('hola?', noHistory)).toBe('continuation')
  })

  it('detects "más" as continuation', () => {
    expect(classifyIntent('más', noHistory)).toBe('continuation')
  })

  it('detects "cuéntame" as continuation', () => {
    expect(classifyIntent('cuéntame', noHistory)).toBe('continuation')
  })

  it('detects "de acuerdo" as continuation', () => {
    expect(classifyIntent('de acuerdo', noHistory)).toBe('continuation')
  })

  it('detects "me interesa" as continuation', () => {
    expect(classifyIntent('me interesa', noHistory)).toBe('continuation')
  })

  it('detects "sigues ahí" prefix as continuation', () => {
    expect(classifyIntent('sigues ahí', noHistory)).toBe('continuation')
  })
})

// ─────────────────────────────────────────────────────────────
// classifyIntent — investment_query
// ─────────────────────────────────────────────────────────────

describe('classifyIntent — investment_query', () => {
  it('detects "para inversión anual" query', () => {
    expect(classifyIntent('para inversión anual no tienes?', noHistory)).toBe('investment_query')
  })

  it('detects "rendimiento" query', () => {
    expect(classifyIntent('qué rendimiento tiene ese proyecto?', noHistory)).toBe('investment_query')
  })

  it('detects "airbnb" query', () => {
    expect(classifyIntent('se puede usar para airbnb?', noHistory)).toBe('investment_query')
  })

  it('detects "renta corta" query', () => {
    expect(classifyIntent('busco algo para renta corta', noHistory)).toBe('investment_query')
  })

  it('detects "plusvalía" query', () => {
    expect(classifyIntent('tiene buena plusvalía esa zona?', noHistory)).toBe('investment_query')
  })

  it('detects "cuánto genera" query', () => {
    expect(classifyIntent('cuánto genera al mes?', noHistory)).toBe('investment_query')
  })

  // New variants added in v3
  it('detects "como inversión" (as investment) query', () => {
    expect(classifyIntent('como inversión no tienes?', noHistory)).toBe('investment_query')
  })

  it('detects "como inversion" (sin acento)', () => {
    expect(classifyIntent('como inversion', noHistory)).toBe('investment_query')
  })

  it('detects "de inversión" query', () => {
    expect(classifyIntent('algo de inversión tienes?', noHistory)).toBe('investment_query')
  })

  it('detects bare "inversiones?" as investment_query', () => {
    expect(classifyIntent('inversiones?', noHistory)).toBe('investment_query')
  })

  it('detects "inversiones" (plural, no accent) as investment_query', () => {
    expect(classifyIntent('inversiones', noHistory)).toBe('investment_query')
  })

  it('detects "invertir" as investment_query', () => {
    expect(classifyIntent('quiero invertir mi dinero', noHistory)).toBe('investment_query')
  })
})

// ─────────────────────────────────────────────────────────────
// classifyIntent — catalog_request
// ─────────────────────────────────────────────────────────────

describe('classifyIntent — catalog_request', () => {
  it('detects "qué proyectos tienen"', () => {
    expect(classifyIntent('qué proyectos tienen disponibles?', noHistory)).toBe('catalog_request')
  })

  it('detects "ver opciones"', () => {
    expect(classifyIntent('me puedes mostrar ver opciones?', noHistory)).toBe('catalog_request')
  })

  it('detects "más opciones"', () => {
    expect(classifyIntent('tienes más opciones?', noHistory)).toBe('catalog_request')
  })

  it('detects "portafolio"', () => {
    expect(classifyIntent('muestrame el portafolio', noHistory)).toBe('catalog_request')
  })
})

// ─────────────────────────────────────────────────────────────
// classifyIntent — general
// ─────────────────────────────────────────────────────────────

describe('classifyIntent — general', () => {
  it('classifies project name mentions as general', () => {
    expect(classifyIntent('quiero info sobre Portacelli Alba', noHistory)).toBe('general')
  })

  it('classifies price questions as general', () => {
    expect(classifyIntent('cuánto cuesta el metro cuadrado?', noHistory)).toBe('general')
  })

  it('classifies location questions as general', () => {
    expect(classifyIntent('en nuevo cuscatlán tienen algo?', noHistory)).toBe('general')
  })
})

// ─────────────────────────────────────────────────────────────
// extractLastBotMessage
// ─────────────────────────────────────────────────────────────

describe('extractLastBotMessage', () => {
  it('returns null for empty history', () => {
    expect(extractLastBotMessage([])).toBeNull()
  })

  it('returns null when no assistant messages exist', () => {
    const userOnly: Conversation[] = [
      { id: '1', lead_id: 'l1', role: 'user', content: 'Hola', wa_message_id: null, sent_by: null, created_at: '' },
    ]
    expect(extractLastBotMessage(userOnly)).toBeNull()
  })

  it('returns the last assistant message', () => {
    const result = extractLastBotMessage(historyWithBot)
    expect(result).toBe('Hola! Soy Daniela. ¿Qué tipo de propiedad buscas?')
  })

  it('truncates messages longer than 400 chars', () => {
    const longContent = 'x'.repeat(500)
    const history: Conversation[] = [
      { id: '1', lead_id: 'l1', role: 'assistant', content: longContent, wa_message_id: null, sent_by: null, created_at: '' },
    ]
    const result = extractLastBotMessage(history)
    expect(result).toHaveLength(403) // 400 + '...'
    expect(result?.endsWith('...')).toBe(true)
  })
})
