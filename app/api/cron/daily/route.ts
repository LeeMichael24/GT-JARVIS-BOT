import { runDailyRadar, runRecontactRules } from '@/lib/proactive/engine'
import { aggregateDailyMetrics } from '@/lib/agent-brain'
import { getNeglectedALeads } from '@/lib/analytics'
import { syncProjectMediaFromEcosystem } from '@/lib/media-sync'
import { runNightlyReflection } from '@/lib/reflection'
import { getAgentSettings } from '@/lib/agent-settings'
import { sendText } from '@/services/whatsapp/client'

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

  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const metrics = await aggregateDailyMetrics(yesterday).catch((e: unknown) => ({
    error: e instanceof Error ? e.message : 'metrics failed',
  }))

  // Deal warning (estilo Gong): leads A enfriándose >48h → alerta al CEO
  let dealWarnings: { alerted: number } | { error: string } = { alerted: 0 }
  try {
    const neglected = await getNeglectedALeads(48)
    const ceoPhone = process.env.CEO_PHONE_NUMBER
    if (neglected.length > 0 && ceoPhone) {
      const lines = [
        `${neglected.length} lead${neglected.length > 1 ? 's' : ''} calificado${neglected.length > 1 ? 's' : ''} A sin actividad +48h:`,
        '',
        ...neglected.map(l => `· ${l.name ?? l.phone}${l.project_interest ? ` (${l.project_interest})` : ''} — ${Math.round(l.hoursIdle / 24)}d sin hablar`),
        '',
        'Dinero enfriándose — un mensaje tuyo puede revivirlos: /panel',
      ]
      await sendText(ceoPhone, lines.join('\n'), { typingDelay: false })
      dealWarnings = { alerted: neglected.length }
    }
  } catch (e: unknown) {
    dealWarnings = { error: e instanceof Error ? e.message : 'deal warnings failed' }
  }

  // Sync de media del Ecosistema Terranova → project_media (no-op si el
  // endpoint aún no existe; ver docs/BRIEF-ECOSISTEMA-MEDIA.md)
  const mediaSync = await syncProjectMediaFromEcosystem().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : 'media sync failed',
  }))

  // Reflexión nocturna: Daniela aprende sola de las conversaciones del día
  const settings = await getAgentSettings()
  const reflection = settings.reflection_enabled
    ? await runNightlyReflection()
    : { skipped: 'reflection_disabled' as const }

  console.log('[cron/daily]', JSON.stringify({ radar, rules, metrics, dealWarnings, mediaSync, reflection }))
  return Response.json({ radar, rules, metrics, dealWarnings, mediaSync, reflection })
}
