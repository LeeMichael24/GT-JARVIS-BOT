import { getServiceClient } from '@/lib/supabase'

/**
 * Configuración viva del agente — perillas de comportamiento editables
 * sin deploy (tabla `agent_settings`). El código SIEMPRE trae defaults:
 * si la tabla no existe o falta una clave, Daniela funciona igual.
 *
 * Para agregar una perilla nueva: default aquí + fila en la tabla + uso.
 */

export interface AgentSettings {
  /** minimal = casi sin emojis | moderate = 1-2 por mensaje | none = cero */
  emoji_policy: 'minimal' | 'moderate' | 'none'
  /** high = aprende de casi toda conversación con sustancia | normal = solo lo notable */
  learning_sensitivity: 'high' | 'normal'
  /** Trato por defecto (el cliente siempre puede cambiarlo con su tono) */
  formality_default: 'tu' | 'usted'
  /** Instrucciones libres del equipo, se inyectan al prompt tal cual */
  custom_instructions: string
  /** Reflexión nocturna: extraer aprendizajes de las conversaciones del día */
  reflection_enabled: boolean
  /** PAUSA GLOBAL: false = Daniela no responde a nadie (mensajes se guardan) */
  agent_enabled: boolean
  /** Nombre del CEO/closer al que se escalan los clientes grandes */
  ceo_name: string
  /** Presupuesto (USD) a partir del cual se escala al CEO */
  escalation_budget_usd: number
  /** Unidades a partir de las cuales se escala al CEO */
  escalation_units: number
  /** Largo máximo pedido para cada respuesta (caracteres) */
  reply_max_chars: number
  /** Temperatura del modelo al responder (0-1) */
  llm_temperature: number
  /** Temperatura del modelo en reflexión/entrenamiento (0-1) */
  reflection_temperature: number
  /** Horario laboral El Salvador para seguimientos automáticos */
  business_hours_start: number
  business_hours_end: number
  /** Precio bajo el cual una propiedad se trata como alquiler mensual */
  rental_threshold_usd: number
  /** Mensajes de historial que ve Daniela por turno */
  history_window: number
  /** Confianza mínima para que un aprendizaje entre al prompt */
  brain_min_confidence: number
  /** Auto-promoción de aprendizajes repetidos (cierra el loop solo) */
  auto_promote_enabled: boolean
  /** Repeticiones del mismo tema para auto-promover */
  auto_promote_threshold: number
}

export const DEFAULT_SETTINGS: AgentSettings = {
  emoji_policy: 'minimal',
  learning_sensitivity: 'high',
  formality_default: 'tu',
  custom_instructions: '',
  reflection_enabled: true,
  agent_enabled: true,
  ceo_name: 'Michael Narváez',
  escalation_budget_usd: 300_000,
  escalation_units: 3,
  reply_max_chars: 500,
  llm_temperature: 0.85,
  reflection_temperature: 0.3,
  business_hours_start: 8,
  business_hours_end: 18,
  rental_threshold_usd: 30_000,
  history_window: 15,
  brain_min_confidence: 0.7,
  auto_promote_enabled: true,
  auto_promote_threshold: 3,
}

// Parseo numérico defensivo: valor inválido o fuera de rango → default.
// Una fila corrupta en la tabla NUNCA debe romper a Daniela.
function num(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < min || n > max) return fallback
  return n
}

// Cache simple en memoria del proceso (serverless: vive lo que la instancia)
let cache: { value: AgentSettings; at: number } | null = null
const CACHE_MS = 60 * 1000

export async function getAgentSettings(): Promise<AgentSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value

  const settings: AgentSettings = { ...DEFAULT_SETTINGS }
  const d = DEFAULT_SETTINGS
  try {
    const { data, error } = await getServiceClient()
      .from('agent_settings')
      .select('key, value')
    if (!error && data) {
      for (const row of data as { key: string; value: string }[]) {
        const v = row.value.trim()
        switch (row.key) {
          case 'emoji_policy':
            if (v === 'minimal' || v === 'moderate' || v === 'none') settings.emoji_policy = v
            break
          case 'learning_sensitivity':
            if (v === 'high' || v === 'normal') settings.learning_sensitivity = v
            break
          case 'formality_default':
            if (v === 'tu' || v === 'usted') settings.formality_default = v
            break
          case 'custom_instructions':
            settings.custom_instructions = v.slice(0, 3000)
            break
          case 'reflection_enabled':
            settings.reflection_enabled = v !== 'false'
            break
          case 'agent_enabled':
            settings.agent_enabled = v !== 'false'
            break
          case 'ceo_name':
            if (v.length > 0) settings.ceo_name = v.slice(0, 80)
            break
          case 'escalation_budget_usd':
            settings.escalation_budget_usd = num(v, 1_000, 100_000_000, d.escalation_budget_usd)
            break
          case 'escalation_units':
            settings.escalation_units = Math.round(num(v, 2, 1_000, d.escalation_units))
            break
          case 'reply_max_chars':
            settings.reply_max_chars = Math.round(num(v, 100, 2_000, d.reply_max_chars))
            break
          case 'llm_temperature':
            settings.llm_temperature = num(v, 0, 1.5, d.llm_temperature)
            break
          case 'reflection_temperature':
            settings.reflection_temperature = num(v, 0, 1.5, d.reflection_temperature)
            break
          case 'business_hours_start':
            settings.business_hours_start = Math.round(num(v, 0, 23, d.business_hours_start))
            break
          case 'business_hours_end':
            settings.business_hours_end = Math.round(num(v, 1, 24, d.business_hours_end))
            break
          case 'rental_threshold_usd':
            settings.rental_threshold_usd = num(v, 0, 1_000_000, d.rental_threshold_usd)
            break
          case 'history_window':
            settings.history_window = Math.round(num(v, 4, 50, d.history_window))
            break
          case 'brain_min_confidence':
            settings.brain_min_confidence = num(v, 0.1, 1, d.brain_min_confidence)
            break
          case 'auto_promote_enabled':
            settings.auto_promote_enabled = v !== 'false'
            break
          case 'auto_promote_threshold':
            settings.auto_promote_threshold = Math.round(num(v, 2, 50, d.auto_promote_threshold))
            break
        }
      }
    }
  } catch {
    // Sin tabla / sin red → defaults. El agente nunca muere por configuración.
  }
  cache = { value: settings, at: Date.now() }
  return settings
}

/** Solo para tests */
export function _clearSettingsCache(): void {
  cache = null
}
