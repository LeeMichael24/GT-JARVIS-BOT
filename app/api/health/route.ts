import { getServiceClient } from '@/lib/supabase'

export async function GET(): Promise<Response> {
  const checks: Record<string, 'ok' | 'error'> = {}
  let healthy = true

  try {
    const { error } = await getServiceClient()
      .from('leads')
      .select('id', { count: 'exact', head: true })
    checks.supabase = error ? 'error' : 'ok'
    if (error) healthy = false
  } catch {
    checks.supabase = 'error'
    healthy = false
  }

  checks.env_wa = process.env.WA_PHONE_NUMBER_ID ? 'ok' : 'error'
  checks.env_openai = process.env.OPENAI_API_KEY ? 'ok' : 'error'
  if (!checks.env_wa || !checks.env_openai) healthy = false

  return Response.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 },
  )
}
