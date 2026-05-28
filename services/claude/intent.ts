/**
 * Intent classifier for incoming WhatsApp messages.
 *
 * Determines HOW Daniela should respond to a message, independently from
 * WHAT project she's focused on (project detection lives in gt-api.ts).
 *
 * Intent affects the "INSTRUCCIÓN DE ESTE TURNO" block in the system prompt.
 */
import type { Conversation } from '@/types'

export type MessageIntent =
  | 'continuation'     // "sí", "porfavor", "hola?", "más" — confirma el turno anterior
  | 'investment_query' // pregunta por ROI, renta, Airbnb, rendimiento anual
  | 'catalog_request'  // "qué proyectos tienen", "ver opciones", "portafolio"
  | 'general'          // todo lo demás

// ─────────────────────────────────────────────────────────────
// Word lists
// ─────────────────────────────────────────────────────────────

const CONTINUATION_EXACT = new Set([
  // affirmations
  'sí', 'si', 'claro', 'dale', 'ok', 'okay', 'bueno', 'va', 'venga',
  'perfecto', 'entendido', 'de acuerdo', 'listo', 'exacto', 'correcto',
  'genial', 'excelente',
  // requests to continue
  'porfavor', 'por favor', 'más', 'mas', 'adelante', 'sigue',
  'cuéntame', 'cuentame', 'continúa', 'continua',
  'cuenta', 'dimelo', 'dímelo', 'dime',
  // re-engagement
  'hola', 'hola?', 'ahi?', 'ahí?', 'sigues', 'sigues?',
  'de nuevo', 'otra vez',
  // interest confirmations
  'me interesa', 'me interesa!', 'interesante', 'quiero', 'quiero saber',
])

const CONTINUATION_STARTS = [
  'sigues ahí', 'sigues ahi', 'hay alguien',
  'cuéntame más', 'cuentame mas',
  'dime más', 'dime mas',
]

const INVESTMENT_SIGNALS = [
  'roi', 'rendimiento', 'retorno', 'rentabilidad',
  // standalone investment keywords (catches "inversiones?", "quiero invertir", etc.)
  'inversion', 'inversión', 'inversiones', 'invertir',
  // annual / yield queries
  'renta anual', 'inversión anual', 'inversion anual',
  'retorno anual', 'porcentaje anual', 'porcentaje de retorno',
  // how-much questions
  'cuánto genera', 'cuanto genera', 'cuánto produce', 'cuanto produce',
  'cuánto gano', 'cuanto gano', 'cuánto me da', 'cuanto me da',
  'cuánto rinde', 'cuanto rinde',
  // investment purpose variants (as / for / of investment)
  'para inversión', 'para inversion',
  'como inversión', 'como inversion',
  'de inversión', 'de inversion',
  'es inversión', 'es inversion',
  // rental / airbnb
  'airbnb', 'alquiler vacacional', 'turismo vacacional',
  'renta corta', 'renta larga',
  'inquilino', 'flujo mensual', 'cash flow',
  // value appreciation
  'plusvalía', 'plusvalia', 'revalorización', 'revalorizacion',
  'ganancia', 'utilidad', 'dividendo',
]

const CATALOG_SIGNALS = [
  'qué proyectos', 'que proyectos', 'qué tienen', 'que tienen disponible',
  'qué hay', 'que hay', 'opciones disponibles', 'ver opciones',
  'portafolio', 'catálogo', 'catalogo', 'todo lo que tienen',
  'otras propiedades', 'más opciones', 'mas opciones',
  'más proyectos', 'mas proyectos', 'ver más', 'ver mas',
  'mostrame', 'muéstrame', 'mostrar',
]

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Classifies the user's message into a conversation intent.
 * This drives the "INSTRUCCIÓN DE ESTE TURNO" block in the system prompt.
 */
export function classifyIntent(message: string, _history: Conversation[]): MessageIntent {
  const msg = message.toLowerCase().trim()

  // 1. Exact match — clear continuation signals
  if (CONTINUATION_EXACT.has(msg)) return 'continuation'

  // 2. Starts-with match for multi-word continuation phrases
  if (CONTINUATION_STARTS.some(p => msg.startsWith(p))) return 'continuation'

  // 3. Investment type query
  if (INVESTMENT_SIGNALS.some(s => msg.includes(s))) return 'investment_query'

  // 4. Catalog / portfolio request
  if (CATALOG_SIGNALS.some(s => msg.includes(s))) return 'catalog_request'

  return 'general'
}

/**
 * Returns the last assistant message from conversation history.
 * Used to give the AI explicit context when the user sends a continuation.
 */
export function extractLastBotMessage(history: Conversation[]): string | null {
  const lastBot = [...history].reverse().find(m => m.role === 'assistant')
  if (!lastBot) return null
  const c = lastBot.content
  return c.length > 400 ? c.slice(0, 400) + '...' : c
}
