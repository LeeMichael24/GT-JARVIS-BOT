// Verificación de variables de entorno por criticidad.
// Módulo puro y sin dependencias — seguro de importar desde cualquier runtime.
//
// REGLA DE SEGURIDAD (dura): este módulo reporta únicamente NOMBRES de
// variables. Jamás retorna, registra ni expone sus VALORES.

export const ENV_REQUIREMENTS = {
  // Críticas: sin ellas el bot no puede recibir ni responder mensajes
  // (el cliente queda "en visto" en silencio)
  critical: [
    'WA_APP_SECRET',
    'WA_ACCESS_TOKEN',
    'WA_PHONE_NUMBER_ID',
    'WA_WEBHOOK_VERIFY_TOKEN',
    'OPENAI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
  // Importantes: funciones que se degradan en silencio si faltan
  // (cron, alertas al CEO, plantillas HSM, catálogo GT)
  important: [
    'CRON_SECRET',
    'CEO_PHONE_NUMBER',
    'WA_TEMPLATE_CEO_ALERT',
    'WA_TEMPLATE_FOLLOWUP',
    'GT_API_URL',
    'GT_API_SECRET',
  ],
  // Integraciones opcionales (Google Calendar, panel con Supabase público)
  integrations: [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    'GOOGLE_CALENDAR_ID',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ],
} as const

export interface EnvCheckResult {
  ok: boolean
  missing: {
    critical: string[]
    important: string[]
    integrations: string[]
  }
}

// Cadena vacía cuenta como faltante (un token "" no sirve para nada)
function missingNames(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name])
}

// Devuelve SOLO los nombres de las variables faltantes — nunca sus valores.
// `ok` es true únicamente cuando el set crítico está completo.
export function checkEnv(): EnvCheckResult {
  const missing = {
    critical: missingNames(ENV_REQUIREMENTS.critical),
    important: missingNames(ENV_REQUIREMENTS.important),
    integrations: missingNames(ENV_REQUIREMENTS.integrations),
  }

  return { ok: missing.critical.length === 0, missing }
}
