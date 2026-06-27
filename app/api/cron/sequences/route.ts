import {
  getDueSequences,
  advanceSequence,
  SEQUENCE_DEFINITIONS,
  isWithinBusinessHours,
} from '@/lib/sequences'
import {
  getLeadById,
  getDealSummary,
  saveConversation,
  updateLead,
} from '@/lib/supabase'
import { callClaude } from '@/services/claude/client'
import { sendText } from '@/services/whatsapp/client'
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

  console.log(`[cron/sequences] Done: ${sent} sent, ${skipped} skipped, ${errors} errors`)
  return Response.json({ sent, skipped, errors })
}
