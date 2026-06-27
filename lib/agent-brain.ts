import { getServiceClient } from '@/lib/supabase'
import type { BrainObservation, BrainEntry } from '@/types'

export async function saveBrainObservations(
  leadId: string | null,
  observations: BrainObservation[],
): Promise<void> {
  if (observations.length === 0) return
  const supabase = getServiceClient()
  const rows = observations.map(o => ({
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

export function formatLearningsForPrompt(entries: BrainEntry[]): string {
  if (entries.length === 0) return ''
  const sorted = [...entries].sort((a, b) => {
    if (a.source === 'team' && b.source !== 'team') return -1
    if (b.source === 'team' && a.source !== 'team') return 1
    return b.confidence - a.confidence
  })
  return sorted
    .map(e => {
      const prefix = e.source === 'team' ? 'REGLA DEL EQUIPO' : 'Observación'
      return `- ${prefix} (${e.topic}): ${e.content}`
    })
    .join('\n')
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
