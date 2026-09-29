import {
  getDueSequences,
  reclamarSecuencia,
  advanceSequence,
  SEQUENCE_DEFINITIONS,
  isWithinBusinessHours,
  pickHoraActiva,
  tieneEscalacionCeoReciente,
} from '@/lib/sequences'
import { temaDeConversacion } from '@/lib/recontact-topic'
import { getAllProjects } from '@/services/projects/gt-api'
import {
  getLeadById,
  getDealSummary,
  getLatestUserMessageAt,
  getConversationHistory,
  saveConversation,
  updateLead,
} from '@/lib/supabase'
import { isWithin24h } from '@/lib/wa-window'
import { callClaude } from '@/services/claude/client'
import { sendText, sendTemplate } from '@/services/whatsapp/client'
import { getAgentSettings } from '@/lib/agent-settings'
import { recordCronRun } from '@/lib/cron-log'
import type { SequenceType } from '@/types'

// Hobby permite hasta 300 s. Con 60 s la corrida se cortaba antes de llegar al
// registro final: cron_runs no tuvo ni una fila de 'sequences' del 2 al 13-sep.
export const maxDuration = 300

/** Se deja de tomar secuencias con margen antes del corte de Vercel */
const PRESUPUESTO_MS = 240_000

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const startedAt = new Date()
  const inicio = Date.now()
  const settings = await getAgentSettings()

  // PAUSA GLOBAL: con Daniela pausada NO salen seguimientos automáticos
  if (!settings.agent_enabled) {
    await recordCronRun('sequences', startedAt, 'ok', { skipped: 'agent_paused' })
    return Response.json({ skipped: 'agent_paused' })
  }

  const now = new Date()
  if (!isWithinBusinessHours(now, settings.business_hours_start, settings.business_hours_end)) {
    await recordCronRun('sequences', startedAt, 'ok', { skipped: 'outside_business_hours' })
    return Response.json({ skipped: 'outside_business_hours' })
  }

  const due = await getDueSequences(now)
  let sent = 0
  let skipped = 0
  let errors = 0
  let failed = 0
  let blockedMissingTemplate = 0
  let deferredTimeBudget = 0
  // Alerta UNA sola vez por corrida (no por lead) si falta la plantilla HSM
  let missingTemplateAlerted = false

  for (const [i, seq] of due.entries()) {
    // Lo que no alcanza a salir queda vencido y lo toma la próxima vuelta
    if (Date.now() - inicio > PRESUPUESTO_MS) {
      deferredTimeBudget = due.length - i
      console.warn(`[cron/sequences] Presupuesto de tiempo agotado: ${deferredTimeBudget} quedan para la próxima vuelta`)
      break
    }

    try {
      const lead = await getLeadById(seq.lead_id)
      if (!lead || lead.opted_out || !lead.bot_active) {
        skipped++
        continue
      }

      // Max 1 proactive message per lead per day
      if (lead.last_proactive_at) {
        const lastProactive = new Date(lead.last_proactive_at)
        const hoursSince = (now.getTime() - lastProactive.getTime()) / (1000 * 60 * 60)
        if (hoursSince < 20) {
          skipped++
          continue
        }
      }

      // Zona de cierre: un lead escalado al CEO espera a un humano, no a un bot
      if (await tieneEscalacionCeoReciente(seq.lead_id, now)) {
        skipped++
        continue
      }

      const def = SEQUENCE_DEFINITIONS[seq.sequence_type as SequenceType]
      const step = def?.steps[seq.current_step]
      if (!step) {
        skipped++
        continue
      }

      // Dos relojes (Supabase cada 15 min y Vercel diario) pueden leer la misma
      // secuencia a la vez: solo envía la corrida que logra apartarla
      if (!(await reclamarSecuencia(seq))) {
        skipped++
        continue
      }

      // Historial real de la charla: sin esto el modelo no sabe qué pidió el
      // cliente y el seguimiento sale genérico o de otro tema. Antes se
      // mandaba [] a callClaude — el bug de "recontacto sin contexto".
      const history = await getConversationHistory(seq.lead_id, settings.history_window)

      // Tema del recontacto = lo que de verdad se habló. NO lead.project_interest:
      // es un campo que puede quedar mal fijado (lead 31204ec5, 29-sep-2026).
      const proyectos = await getAllProjects().catch(() => [])
      const temaVerificado = temaDeConversacion(history, proyectos)
      const proyectoDelContexto = (seq.context as Record<string, string>).project ?? temaVerificado

      // Ventana de 24h de Meta: fuera de ella el texto libre es RECHAZADO
      // (error 131047). Fuera de ventana la ÚNICA vía legal es una plantilla
      // HSM aprobada (WA_TEMPLATE_FOLLOWUP).
      const lastUserAt = await getLatestUserMessageAt(seq.lead_id)
      if (!isWithin24h(lastUserAt)) {
        const tpl = process.env.WA_TEMPLATE_FOLLOWUP
        if (!tpl) {
          // NO avanzamos el paso: queda pendiente y se reintenta en la próxima
          // corrida, cuando la plantilla ya esté configurada. Avanzar aquí
          // quemaría la secuencia en silencio sin contactar nunca al lead.
          if (!missingTemplateAlerted) {
            console.error(
              '[cron/sequences] 🚨 WA_TEMPLATE_FOLLOWUP no está configurada: los follow-ups fuera de la ventana de 24h están BLOQUEADOS y quedan pendientes. Configura la plantilla HSM aprobada en las variables de entorno para reanudarlos.',
            )
            missingTemplateAlerted = true
          }
          blockedMissingTemplate++
          continue
        }
        const topic = proyectoDelContexto ?? 'tu consulta con Grupo Terranova'
        // {{1}}=saludo: nombre real, o "de nuevo" → plantilla lee "Hola de nuevo 😊"
        let tplWaId: string | null
        try {
          tplWaId = await sendTemplate(lead.phone, tpl, 'es', [lead.name ?? 'de nuevo', topic])
        } catch (err) {
          // Meta rechazó el envío de la plantilla: NO avanzamos el paso — queda
          // pendiente y se reintenta en la próxima corrida del cron.
          failed++
          console.error(
            `[cron/sequences] Error enviando plantilla ${tpl} para sequence ${seq.id} (lead ${seq.lead_id}):`,
            err instanceof Error ? err.message : err,
          )
          continue
        }
        await saveConversation({
          leadId: seq.lead_id,
          role: 'assistant',
          content: `[Plantilla ${tpl}] Seguimiento sobre ${topic}`,
          waMessageId: tplWaId ?? undefined,
        })
        await updateLead(seq.lead_id, { last_proactive_at: now.toISOString() })
        await advanceSequence(seq.id, seq.sequence_type as SequenceType, seq.current_step)
        sent++
        console.log(`[cron/sequences] Plantilla ${tpl} enviada a lead ${seq.lead_id} (fuera de ventana)`)
        continue
      }

      const deal = await getDealSummary(seq.lead_id)
      const dealContext =
        deal?.summary ??
        (seq.context as Record<string, string>).summary ??
        ''
      const projectInterest = proyectoDelContexto

      // Ask for JSON with a "message" field so callClaude (which forces JSON mode) works
      const followUpPrompt = `Eres Daniela, de Grupo Terranova. Arriba tienes la conversación real que ya tuviste con ${lead.name ?? 'este cliente'} — LÉELA antes de escribir: el seguimiento debe retomar lo último que el cliente preguntó o dijo, nunca un tema aparte o genérico.
${dealContext ? `Resumen del caso: ${dealContext}` : ''}
${projectInterest ? `Proyecto de interés: ${projectInterest}` : ''}
Propósito de este seguimiento: ${step.purpose}
Paso ${seq.current_step + 1} de ${def.steps.length} (${step.purpose === 'last_chance' ? 'último intento' : 'seguimiento normal'}).

Reglas:
- Conecta con el hilo real de la conversación de arriba, nunca con un tema distinto
- Máximo 400 caracteres
- Tono cálido y natural, como si fueras Daniela de Grupo Terranova
- No presiones. Sé útil y genuina.
- Cierra con una pregunta abierta
- NO uses asteriscos, bullets, ni listas
- Responde SOLO con un JSON: {"message": "<el texto del mensaje aquí>"}`

      // 20 s por intento: con el reintento del SDK, un cliente no se come la corrida
      const rawReply = await callClaude(followUpPrompt, history, { timeoutMs: 20_000 })

      // Extract message from JSON response
      let reply: string
      try {
        const parsed = JSON.parse(rawReply) as Record<string, unknown>
        reply = typeof parsed.message === 'string' ? parsed.message.trim() : ''
      } catch {
        // Fallback: try stripping JSON wrappers if parsing fails
        reply = rawReply.replace(/^["'{]|["'}]$/g, '').trim()
      }

      if (!reply || reply.length < 10) {
        skipped++
        continue
      }

      const waMessageId = await sendText(lead.phone, reply, { typingDelay: false })
      await saveConversation({
        leadId: seq.lead_id,
        role: 'assistant',
        content: reply,
        waMessageId: waMessageId ?? undefined,
      })
      await updateLead(seq.lead_id, { last_proactive_at: now.toISOString() })
      // Reaprovecha el historial ya cargado para el mensaje: la próxima cita
      // de la secuencia aterriza en la hora en que este lead suele escribir.
      const activeHourSV = pickHoraActiva(
        history.filter(m => m.role === 'user').map(m => m.created_at),
      )
      await advanceSequence(seq.id, seq.sequence_type as SequenceType, seq.current_step, activeHourSV)
      sent++
      console.log(
        `[cron/sequences] Sent follow-up to lead ${seq.lead_id} (step ${seq.current_step}, ${step.purpose})`,
      )
    } catch (err) {
      errors++
      console.error(
        `[cron/sequences] Error for sequence ${seq.id}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  console.log(
    `[cron/sequences] Done: ${sent} sent, ${skipped} skipped, ${failed} failed, ${blockedMissingTemplate} bloqueados (sin plantilla), ${deferredTimeBudget} para la próxima vuelta, ${errors} errors`,
  )
  const summary = {
    sent,
    skipped,
    errors,
    failed,
    blocked_missing_template: blockedMissingTemplate,
    deferred_time_budget: deferredTimeBudget,
  }
  await recordCronRun('sequences', startedAt, errors > 0 ? 'error' : 'ok', summary)
  return Response.json(summary)
}
