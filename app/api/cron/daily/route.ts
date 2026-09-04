import { runDailyRadar, runRecontactRules } from '@/lib/proactive/engine'
import { aggregateDailyMetrics } from '@/lib/agent-brain'
import { getNeglectedALeads } from '@/lib/analytics'
import { syncProjectMediaFromEcosystem } from '@/lib/media-sync'
import { syncKnowledgeFromEcosystem } from '@/lib/knowledge-sync'
import { runNightlyReflection } from '@/lib/reflection'
import { getAgentSettings } from '@/lib/agent-settings'
import { ensureFollowUpsForSilentLeads } from '@/lib/sequences'
import { recordCronRun } from '@/lib/cron-log'
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

  const startedAt = new Date()
  const settingsEarly = await getAgentSettings()

  // PAUSA GLOBAL: sin contacto proactivo con clientes. Métricas, media
  // sync y reflexión (aprendizaje interno) sí corren — no tocan a nadie.
  const paused = !settingsEarly.agent_enabled

  const radar = paused
    ? { skipped: 'agent_paused' }
    : await runDailyRadar().catch((e: unknown) => ({
        error: e instanceof Error ? e.message : 'radar failed',
      }))
  const rules = paused
    ? { skipped: 'agent_paused' }
    : await runRecontactRules().catch((e: unknown) => ({
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

  // Conocimiento de proyectos desde Terranova (pitches/ángulos curados).
  // Igual que el media: no-op silencioso mientras el endpoint no exista.
  const knowledgeSync = await syncKnowledgeFromEcosystem().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : 'knowledge sync failed',
  }))

  // Red de seguridad: leads callados >24h sin secuencia activa reciben la
  // suya aunque el modelo no haya pedido follow_up_needed en su momento.
  // Con pausa global no se agenda contacto nuevo.
  let followUps: { created: number } | { skipped: string } | { error: string }
  if (paused) {
    followUps = { skipped: 'agent_paused' }
  } else {
    followUps = await ensureFollowUpsForSilentLeads(new Date())
      .then(created => ({ created }))
      .catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'follow-up net failed' }))
  }

  // Reflexión nocturna: Daniela aprende sola de las conversaciones del día
  const reflection = settingsEarly.reflection_enabled
    ? await runNightlyReflection()
    : { skipped: 'reflection_disabled' as const }

  const summary = { radar, rules, metrics, dealWarnings, mediaSync, knowledgeSync, followUps, reflection }
  console.log('[cron/daily]', JSON.stringify(summary))
  // Observabilidad: el panel (tab Estado) muestra esta corrida.
  // 'error' si CUALQUIER sub-paso falló — visible de un vistazo.
  const hadError = Object.values(summary).some(
    v => v && typeof v === 'object' && 'error' in (v as Record<string, unknown>),
  )
  await recordCronRun('daily', startedAt, hadError ? 'error' : 'ok', summary)
  return Response.json(summary)
}
