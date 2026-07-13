import { getServiceClient } from '@/lib/supabase'
import { checkEnv } from '@/lib/env-check'

// Health check con reporte de entorno por criticidad:
// - falta una variable crítica (o Supabase caído) → 'unhealthy' (503)
// - críticas OK pero faltan importantes → 'degraded' (200)
// - todo presente y los checks pasan → 'healthy' (200)
// El reporte de env incluye SOLO nombres de variables, nunca valores.
export async function GET(): Promise<Response> {
  try {
    const checks: Record<string, 'ok' | 'error'> = {}

    try {
      const { error } = await getServiceClient()
        .from('leads')
        .select('id', { count: 'exact', head: true })
      checks.supabase = error ? 'error' : 'ok'
    } catch {
      checks.supabase = 'error'
    }

    checks.env_wa = process.env.WA_PHONE_NUMBER_ID ? 'ok' : 'error'
    checks.env_openai = process.env.OPENAI_API_KEY ? 'ok' : 'error'

    const env = checkEnv()

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (!env.ok || checks.supabase === 'error' || checks.env_wa === 'error' || checks.env_openai === 'error') {
      // Sin las críticas (o sin base de datos) el bot deja clientes "en visto"
      status = 'unhealthy'
    } else if (env.missing.important.length > 0 || env.missing.integrations.length > 0) {
      // El bot responde, pero hay funciones degradadas en silencio
      status = 'degraded'
    }

    return Response.json(
      {
        status,
        timestamp: new Date().toISOString(),
        checks,
        env,
      },
      { status: status === 'unhealthy' ? 503 : 200 },
    )
  } catch (err) {
    // El health check jamás debe lanzar — si algo explota, repórtalo como caído
    console.error('[health] Health check failed:', err instanceof Error ? err.message : err)
    return Response.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'error desconocido',
      },
      { status: 503 },
    )
  }
}
