import { runDailyRadar, runRecontactRules } from '@/lib/proactive/engine'

export const maxDuration = 60

// Vercel Cron manda Authorization: Bearer ${CRON_SECRET}
export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  // Sin secret configurado el endpoint se CIERRA (evita 'Bearer undefined')
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const radar = await runDailyRadar().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : 'radar failed',
  }))
  const rules = await runRecontactRules().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : 'rules failed',
  }))

  console.log('[cron/daily]', JSON.stringify({ radar, rules }))
  return Response.json({ radar, rules })
}
