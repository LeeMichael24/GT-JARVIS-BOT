import {
  getDueSequences,
  advanceSequence,
  SEQUENCE_DEFINITIONS,
  isWithinBusinessHours,
} from '@/lib/sequences'
import {
  getLeadById,
  getDealSummary,
  getLatestUserMessageAt,
  saveConversation,
  updateLead,
} from '@/lib/supabase'
import { isWithin24h } from '@/lib/wa-window'
import { callClaude } from '@/services/claude/client'
import { sendText, sendTemplate } from '@/services/whatsapp/client'
import type { SequenceType } from '@/types'

export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  if (!isWithinBusinessHours(now)) {
    return Response.json({ skipped: 'outside_business_hours' })
  }

  const due = await getDueSequences(now)
  let sent = 0
  let skipped = 0
  let errors = 0
  let failed = 0
  let blockedMissingTemplate = 0
  // Alerta UNA sola vez por corrida (no por lead) si falta la plantilla HSM
  let missingTemplateAlerted = false

  for (const seq of due) {
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

      const def = SEQUENCE_DEFINITIONS[seq.sequence_type as SequenceType]
      const step = def?.steps[seq.current_step]
      if (!step) {
        skipped++
        continue
      }

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
        const topic = (seq.context as Record<string, string>).project
          ?? lead.project_interest
          ?? 'tu consulta con Grupo Terranova'
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

      // Ask for JSON with a "message" field so callClaude (which forces JSON mode) works
      const followUpPrompt = `Genera un mensaje de seguimiento de WhatsApp para ${lead.name ?? 'el cliente'}.
Contexto del deal: ${dealContext}
Propósito de este seguimiento: ${step.purpose}
Paso ${seq.current_step + 1} de ${def.steps.length} (${step.purpose === 'last_chance' ? 'último intento' : 'seguimiento normal'}).

Reglas:
- Máximo 400 caracteres
- Tono cálido y natural, como si fueras Daniela de Grupo Terranova
- No presiones. Sé útil y genuina.
- Cierra con una pregunta abierta
- NO uses asteriscos, bullets, ni listas
- Responde SOLO con un JSON: {"message": "<el texto del mensaje aquí>"}`

      const rawReply = await callClaude(followUpPrompt, [])

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
      await advanceSequence(seq.id, seq.sequence_type as SequenceType, seq.current_step)
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
    `[cron/sequences] Done: ${sent} sent, ${skipped} skipped, ${failed} failed, ${blockedMissingTemplate} bloqueados (sin plantilla), ${errors} errors`,
  )
  return Response.json({ sent, skipped, errors, failed, blocked_missing_template: blockedMissingTemplate })
}
