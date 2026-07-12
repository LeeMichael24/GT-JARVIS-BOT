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
}

export const DEFAULT_SETTINGS: AgentSettings = {
  emoji_policy: 'minimal',
  learning_sensitivity: 'high',
  formality_default: 'tu',
  custom_instructions: '',
  reflection_enabled: true,
}

// Cache simple en memoria del proceso (serverless: vive lo que la instancia)
let cache: { value: AgentSettings; at: number } | null = null
const CACHE_MS = 60 * 1000

export async function getAgentSettings(): Promise<AgentSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value

  const settings: AgentSettings = { ...DEFAULT_SETTINGS }
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
