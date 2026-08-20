import { getServiceClient } from '@/lib/supabase'
import type { BrainObservation, BrainEntry } from '@/types'

export interface SaveObservationOptions {
  /** Auto-promoción por convergencia: una observación repetida N veces
   *  (mismo tema) sube sola a confianza 0.72 y ENTRA al prompt — así el
   *  loop de aprendizaje se cierra sin esperar revisión manual. */
  autoPromoteEnabled?: boolean
  autoPromoteThreshold?: number
}

// Confianza a la que se auto-promueve una observación convergente.
// Justo sobre el umbral default (0.7) pero bajo las entradas del equipo
// (0.85) — el equipo siempre puede bajarla o desactivarla en el panel.
const AUTO_PROMOTE_CONFIDENCE = 0.72

export async function saveBrainObservations(
  leadId: string | null,
  observations: BrainObservation[],
  opts: SaveObservationOptions = {},
): Promise<void> {
  if (observations.length === 0) return
  const supabase = getServiceClient()
  const threshold = opts.autoPromoteThreshold ?? 3
  const autoPromote = opts.autoPromoteEnabled ?? true

  // Dedup por tema: la misma observación repetida NO se inserta de nuevo —
  // incrementa seen_count. Sin esto, con sensibilidad alta se acumulan
  // miles de casi-duplicados a 0.5 que nadie revisa.
  let existing: { id: string; topic: string; confidence: number; seen_count: number | null }[] = []
  try {
    const topics = observations.map(o => o.topic)
    const { data } = await supabase
      .from('agent_brain')
      .select('id, topic, confidence, seen_count')
      .eq('source', 'agent')
      .eq('active', true)
      .in('topic', topics)
    existing = (data as typeof existing) ?? []
  } catch {
    // columnas/tabla sin migrar → seguimos con insert plano
  }

  const byTopic = new Map(existing.map(e => [e.topic.toLowerCase(), e]))
  const toInsert: BrainObservation[] = []

  for (const o of observations) {
    const match = byTopic.get(o.topic.toLowerCase())
    if (!match) {
      toInsert.push(o)
      continue
    }
    // Tema repetido: contar convergencia y auto-promover si tocó el umbral
    const seenCount = (match.seen_count ?? 1) + 1
    const promote = autoPromote && match.confidence < 0.7 && seenCount >= threshold
    const { error } = await supabase
      .from('agent_brain')
      .update({
        seen_count: seenCount,
        last_seen_at: new Date().toISOString(),
        ...(promote ? { confidence: AUTO_PROMOTE_CONFIDENCE } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', match.id)
    if (error) {
      // Columnas 012 sin migrar: el dedup igual evitó el duplicado
      console.warn('[agent-brain] Failed to update seen observation:', error.message)
    } else if (promote) {
      console.log(`[agent-brain] Auto-promovido "${o.topic}" (visto ${seenCount}×) → confianza ${AUTO_PROMOTE_CONFIDENCE}`)
    }
  }

  if (toInsert.length === 0) return
  const rows = toInsert.map(o => ({
    category: o.category,
    topic: o.topic,
    content: o.content,
    source: 'agent' as const,
    lead_id: leadId,
    confidence: 0.5,
  }))
  const { error } = await supabase.from('agent_brain').insert(rows)
  if (error) console.warn('[agent-brain] Failed to save observations:', error.message)
}

export async function getHighConfidenceLearnings(minConfidence = 0.7): Promise<BrainEntry[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('agent_brain')
    .select('*')
    .eq('active', true)
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false })
    .limit(20)
  if (error) {
    console.warn('[agent-brain] Failed to fetch learnings:', error.message)
    return []
  }
  return (data as BrainEntry[]) ?? []
}

// Presupuesto de caracteres del bloque de cerebro en el prompt.
// Sin tope, 17 entradas largas pesaban ~12K chars (~3.3K tokens) POR MENSAJE
// → latencia, costo y el techo de 30K tokens/min de OpenAI.
const BRAIN_PROMPT_BUDGET_CHARS = 4500

export function formatLearningsForPrompt(entries: BrainEntry[]): string {
  if (entries.length === 0) return ''
  const sorted = [...entries].sort((a, b) => {
    if (a.source === 'team' && b.source !== 'team') return -1
    if (b.source === 'team' && a.source !== 'team') return 1
    return b.confidence - a.confidence
  })
  const lines: string[] = []
  let used = 0
  for (const e of sorted) {
    const prefix = e.source === 'team' ? 'REGLA DEL EQUIPO' : 'Observación'
    // Entradas muy largas se truncan; el conocimiento completo vive en el
    // panel — al prompt va la versión operativa
    const content = e.content.length > 600 ? e.content.slice(0, 600) + '…' : e.content
    const line = `- ${prefix} (${e.topic}): ${content}`
    if (used + line.length > BRAIN_PROMPT_BUDGET_CHARS) break
    lines.push(line)
    used += line.length
  }
  return lines.join('\n')
}

export async function aggregateDailyMetrics(date: Date): Promise<void> {
  const supabase = getServiceClient()
  const dayStart = new Date(date)
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

  const startIso = dayStart.toISOString()
  const endIso = dayEnd.toISOString()

  const [convos, meetings, escalations, followUps] = await Promise.all([
    supabase.from('conversations').select('id', { count: 'exact' })
      .eq('role', 'user').gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('conversations').select('content')
      .eq('role', 'assistant').gte('created_at', startIso).lt('created_at', endIso)
      .like('content', '%agendé tu cita%'),
    supabase.from('agent_brain').select('id', { count: 'exact' })
      .eq('category', 'metric').eq('topic', 'escalation')
      .gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('sequences').select('id', { count: 'exact' })
      .gte('last_fired_at', startIso).lt('last_fired_at', endIso),
  ])

  const dateStr = dayStart.toISOString().split('T')[0]
  await supabase.from('agent_metrics').upsert({
    period_start: dateStr,
    period_end: dateStr,
    total_conversations: convos.count ?? 0,
    meetings_scheduled: meetings.data?.length ?? 0,
    escalations: escalations.count ?? 0,
    follow_ups_sent: followUps.count ?? 0,
  }, { onConflict: 'period_start,period_end' })
}
