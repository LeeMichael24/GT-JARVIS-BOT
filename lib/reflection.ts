import { getServiceClient } from '@/lib/supabase'
import { callClaude } from '@/services/claude/client'
import { saveBrainObservations } from '@/lib/agent-brain'
import type { BrainObservation } from '@/types'

/**
 * Reflexión nocturna — el mecanismo REAL de "Daniela aprende sola".
 *
 * El aprendizaje inline (brain_observations en cada respuesta) captura
 * hallazgos en caliente, pero el modelo es conservador ahí. Esta pasada
 * nocturna revisa las conversaciones del día CON CALMA y extrae patrones:
 * objeciones nuevas, preguntas sin respuesta, técnicas que funcionaron,
 * motivos de pérdida. Lo guardado entra al cerebro como source='agent'
 * con confianza 0.5 — el equipo lo revisa/promueve desde el panel.
 */

interface ConvoGroup {
  leadId: string
  transcript: string
  userMsgs: number
}

const MAX_CONVOS_PER_NIGHT = 8
const MAX_TRANSCRIPT_CHARS = 1800
const MAX_LEARNINGS = 6

/** Agrupa los mensajes del período por lead y filtra las conversaciones con sustancia. */
export function groupConversations(
  rows: { lead_id: string; role: string; content: string; created_at: string }[],
): ConvoGroup[] {
  const byLead = new Map<string, { role: string; content: string }[]>()
  for (const r of rows) {
    if (!byLead.has(r.lead_id)) byLead.set(r.lead_id, [])
    byLead.get(r.lead_id)!.push({ role: r.role, content: r.content })
  }

  const groups: ConvoGroup[] = []
  for (const [leadId, msgs] of byLead) {
    const userMsgs = msgs.filter(m => m.role === 'user').length
    // Sustancia mínima: 4+ mensajes y 2+ del cliente (un "Hola" suelto no enseña nada)
    if (msgs.length < 4 || userMsgs < 2) continue
    let transcript = msgs
      .map(m => `${m.role === 'user' ? 'CLIENTE' : 'DANIELA'}: ${m.content}`)
      .join('\n')
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      transcript = transcript.slice(-MAX_TRANSCRIPT_CHARS) // el final pesa más
    }
    groups.push({ leadId, transcript, userMsgs })
  }
  return groups
    .sort((a, b) => b.userMsgs - a.userMsgs)
    .slice(0, MAX_CONVOS_PER_NIGHT)
}

export function buildReflectionPrompt(groups: ConvoGroup[], existingTopics: string[]): string {
  return `Eres el módulo de aprendizaje de Daniela, una SDR de bienes raíces de Grupo Terranova (El Salvador).
Analiza las conversaciones de hoy y extrae APRENDIZAJES ACCIONABLES para vender mejor mañana.

QUÉ BUSCAR (en orden de valor):
1. Objeciones o dudas que se repiten y CÓMO se respondieron (¿funcionó?)
2. Preguntas que Daniela NO supo responder bien (huecos de conocimiento)
3. Frases o enfoques que movieron al cliente a interesarse o agendar
4. Motivos por los que un cliente se enfrió o se fue
5. Patrones del mercado (qué proyectos piden, qué presupuestos mencionan)

TEMAS QUE YA EXISTEN EN EL CEREBRO (NO repitas estos temas, solo aporta si tienes un ángulo NUEVO):
${existingTopics.length ? existingTopics.map(t => `- ${t}`).join('\n') : '- (ninguno)'}

CONVERSACIONES DE HOY:
${groups.map((g, i) => `--- Conversación ${i + 1} ---\n${g.transcript}`).join('\n\n')}

Responde SOLO JSON válido:
{"learnings": [{"category": "pattern|objection_response|knowledge_gap|market_signal", "topic": "titulo corto y especifico", "content": "el aprendizaje, concreto y accionable, max 300 caracteres"}]}
Máximo ${MAX_LEARNINGS} aprendizajes. Si el día no dejó nada nuevo, devuelve {"learnings": []}. Calidad sobre cantidad.`
}

/** Mapea las categorías de la reflexión a las del cerebro. */
export function toBrainObservations(raw: unknown): BrainObservation[] {
  const arr = (raw as { learnings?: unknown })?.learnings
  if (!Array.isArray(arr)) return []
  const catMap: Record<string, BrainObservation['category']> = {
    pattern: 'pattern',
    objection_response: 'pattern',
    knowledge_gap: 'observation',
    market_signal: 'metric',
  }
  return arr
    .filter((l): l is Record<string, string> =>
      !!l && typeof l === 'object' &&
      typeof (l as Record<string, unknown>).topic === 'string' &&
      typeof (l as Record<string, unknown>).content === 'string')
    .slice(0, MAX_LEARNINGS)
    .map(l => ({
      category: catMap[l.category] ?? 'observation',
      topic: l.topic.slice(0, 80),
      content: l.content.slice(0, 400),
    }))
}

export type ReflectionResult =
  | { learned: number; conversations: number }
  | { skipped: string }
  | { error: string }

export async function runNightlyReflection(): Promise<ReflectionResult> {
  try {
    const supabase = getServiceClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: rows, error } = await supabase
      .from('conversations')
      .select('lead_id, role, content, created_at')
      .gte('created_at', since)
      .not('wa_message_id', 'like', 'import_%')
      .order('created_at', { ascending: true })
      .limit(1500)
    if (error) return { error: error.message }

    const groups = groupConversations(rows ?? [])
    if (groups.length === 0) return { skipped: 'sin_conversaciones_con_sustancia' }

    // Temas existentes para no duplicar
    const { data: topics } = await supabase
      .from('agent_brain')
      .select('topic')
      .eq('active', true)
      .limit(300)
    const existingTopics = Array.from(new Set((topics ?? []).map(t => (t as { topic: string }).topic)))

    const raw = await callClaude(buildReflectionPrompt(groups, existingTopics), [])
    const observations = toBrainObservations(JSON.parse(raw))
    if (observations.length === 0) return { learned: 0, conversations: groups.length }

    await saveBrainObservations(null, observations)
    console.log(`[reflection] ${observations.length} aprendizajes de ${groups.length} conversaciones`)
    return { learned: observations.length, conversations: groups.length }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'reflection failed' }
  }
}
