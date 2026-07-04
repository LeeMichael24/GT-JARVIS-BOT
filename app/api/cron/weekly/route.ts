import { getFunnelStats, getTopObjections, getDanielaStats } from '@/lib/analytics'
import { sendText } from '@/services/whatsapp/client'

export const maxDuration = 60

// Reporte semanal de Daniela al CEO — lunes 8am El Salvador (14:00 UTC).
// Como una empleada reportando su semana: números, no ruido.
export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const ceoPhone = process.env.CEO_PHONE_NUMBER
  if (!ceoPhone) {
    return Response.json({ skipped: 'no_ceo_phone' })
  }

  const [funnel, objections, daniela] = await Promise.all([
    getFunnelStats(7),
    getTopObjections(3),
    getDanielaStats(7),
  ])

  const lines = [
    '📊 Reporte semanal de Daniela',
    '',
    `Esta semana atendí ${funnel.total} leads nuevos.`,
    `${funnel.interested} mostraron interés real, ${funnel.qualified} quedaron calificados.`,
    `Agendé ${funnel.meetings} citas y te escalé ${funnel.escalated} clientes listos para cerrar.`,
  ]

  if (daniela.avgResponseTimeSec != null) {
    lines.push(`Tiempo promedio de respuesta: ${daniela.avgResponseTimeSec}s.`)
  }

  if (objections.length > 0) {
    lines.push('', 'Lo que más nos frena:')
    for (const o of objections) {
      lines.push(`· ${o.objection} (${o.count} veces)`)
    }
  }

  if (daniela.projectBreakdown.length > 0) {
    const top = daniela.projectBreakdown.slice(0, 3)
      .map(p => `${p.project} (${p.count})`)
      .join(', ')
    lines.push('', `Proyectos más pedidos: ${top}.`)
  }

  lines.push('', 'Detalle completo en el panel 👉 /panel/dashboard')
  const report = lines.join('\n')

  try {
    await sendText(ceoPhone, report, { typingDelay: false })
    console.log('[cron/weekly] Reporte semanal enviado al CEO')
    return Response.json({ sent: true, leads: funnel.total })
  } catch (err) {
    // Fuera de ventana de 24h sin plantilla dedicada: queda en logs, no es crítico
    console.error('[cron/weekly] No se pudo enviar el reporte:', err instanceof Error ? err.message : err)
    return Response.json({ sent: false, error: 'send_failed', leads: funnel.total })
  }
}
