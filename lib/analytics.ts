import { getServiceClient } from '@/lib/supabase'

export interface DashboardStats {
  totalLeads: number
  newLeads: number
  warmLeads: number
  hotLeads: number
  coldLeads: number
  botActive: number
  botPaused: number
  totalMessages: number
  messagesLast24h: number
  leadsFromAds: number
  meetingsScheduled: number
  escalations: number
  avgResponseTime: number | null
  conversionRate: number
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = getServiceClient()
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    leadsRes,
    msgsRes,
    msgs24hRes,
    adLeadsRes,
    meetingsRes,
    escalationsRes,
  ] = await Promise.all([
    supabase.from('leads').select('stage, bot_active').not('phone', 'like', 'n_%'),
    supabase.from('conversations').select('id', { count: 'exact', head: true })
      .not('wa_message_id', 'like', 'import_%'),
    supabase.from('conversations').select('id', { count: 'exact', head: true })
      .not('wa_message_id', 'like', 'import_%')
      .gte('created_at', yesterday),
    supabase.from('lead_sources').select('id', { count: 'exact', head: true })
      .eq('source_type', 'meta_ad'),
    supabase.from('activity_log').select('id', { count: 'exact', head: true })
      .eq('action', 'meeting_scheduled')
      .gte('created_at', thirtyDaysAgo),
    supabase.from('activity_log').select('id', { count: 'exact', head: true })
      .eq('action', 'escalate_ceo')
      .gte('created_at', thirtyDaysAgo),
  ])

  const leads = (leadsRes.data ?? []) as { stage: string; bot_active: boolean }[]
  const totalLeads = leads.length
  const newLeads = leads.filter(l => l.stage === 'new').length
  const warmLeads = leads.filter(l => l.stage === 'warm').length
  const hotLeads = leads.filter(l => l.stage === 'hot').length
  const coldLeads = leads.filter(l => l.stage === 'cold').length
  const botActive = leads.filter(l => l.bot_active).length
  const botPaused = leads.filter(l => !l.bot_active).length

  const conversionRate = totalLeads > 0
    ? Math.round(((hotLeads + warmLeads) / totalLeads) * 100)
    : 0

  return {
    totalLeads,
    newLeads,
    warmLeads,
    hotLeads,
    coldLeads,
    botActive,
    botPaused,
    totalMessages: msgsRes.count ?? 0,
    messagesLast24h: msgs24hRes.count ?? 0,
    leadsFromAds: adLeadsRes.count ?? 0,
    meetingsScheduled: meetingsRes.count ?? 0,
    escalations: escalationsRes.count ?? 0,
    avgResponseTime: null,
    conversionRate,
  }
}

export interface LeadsByDay {
  date: string
  count: number
}

export async function getLeadsByDay(days = 30): Promise<LeadsByDay[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await getServiceClient()
    .from('leads')
    .select('created_at')
    .not('phone', 'like', 'n_%')
    .gte('created_at', since)
    .order('created_at')

  if (error) throw new Error(`getLeadsByDay: ${error.message}`)

  const byDay = new Map<string, number>()
  for (const row of (data ?? []) as { created_at: string }[]) {
    const day = row.created_at.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }

  return Array.from(byDay.entries()).map(([date, count]) => ({ date, count }))
}

export interface DanielaStats {
  totalConversations: number
  handledAlone: number
  escalated: number
  escalationRate: number
  avgResponseTimeSec: number | null
  projectBreakdown: { project: string; count: number }[]
}

export async function getDanielaStats(days = 30): Promise<DanielaStats> {
  const supabase = getServiceClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const [leadsRes, escalationsRes, projectsRes, responseTimeRes] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .not('phone', 'like', 'n_%')
      .gte('created_at', since),
    supabase.from('activity_log').select('id', { count: 'exact', head: true })
      .in('action', ['escalate_ceo', 'consult_team'])
      .gte('created_at', since),
    supabase.from('leads').select('project_interest')
      .not('phone', 'like', 'n_%')
      .not('project_interest', 'is', null)
      .gte('created_at', since),
    supabase.from('conversations')
      .select('lead_id, role, created_at')
      .not('wa_message_id', 'like', 'import_%')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5000),
  ])

  const totalConversations = leadsRes.count ?? 0
  const escalated = escalationsRes.count ?? 0
  const handledAlone = Math.max(0, totalConversations - escalated)
  const escalationRate = totalConversations > 0
    ? Math.round((escalated / totalConversations) * 100)
    : 0

  const projectCounts = new Map<string, number>()
  for (const row of (projectsRes.data ?? []) as { project_interest: string }[]) {
    projectCounts.set(row.project_interest, (projectCounts.get(row.project_interest) ?? 0) + 1)
  }
  const projectBreakdown = Array.from(projectCounts.entries())
    .map(([project, count]) => ({ project, count }))
    .sort((a, b) => b.count - a.count)

  let avgResponseTimeSec: number | null = null
  const msgs = (responseTimeRes.data ?? []) as { lead_id: string; role: string; created_at: string }[]
  const responseTimes: number[] = []
  const lastUserMsg = new Map<string, number>()
  for (const m of msgs) {
    if (m.role === 'user') {
      lastUserMsg.set(m.lead_id, new Date(m.created_at).getTime())
    } else if (m.role === 'assistant' && lastUserMsg.has(m.lead_id)) {
      const userTime = lastUserMsg.get(m.lead_id)!
      const diff = (new Date(m.created_at).getTime() - userTime) / 1000
      if (diff > 0 && diff < 300) responseTimes.push(diff)
      lastUserMsg.delete(m.lead_id)
    }
  }
  if (responseTimes.length > 0) {
    avgResponseTimeSec = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
  }

  return {
    totalConversations,
    handledAlone,
    escalated,
    escalationRate,
    avgResponseTimeSec,
    projectBreakdown,
  }
}

// ── Embudo de ventas ─────────────────────────────────────────
// total → interesados (warm+hot) → calificados (presupuesto o timeline
// confirmado) → citas agendadas → escalados al CEO

export interface FunnelStats {
  total: number
  interested: number
  qualified: number
  meetings: number
  escalated: number
}

export async function getFunnelStats(days = 30): Promise<FunnelStats> {
  const supabase = getServiceClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const [leadsRes, meetingsRes, escalationsRes] = await Promise.all([
    supabase.from('leads')
      .select('stage, qualification_data')
      .not('phone', 'like', 'n_%')
      .gte('created_at', since),
    supabase.from('activity_log').select('id', { count: 'exact', head: true })
      .eq('action', 'meeting_scheduled')
      .gte('created_at', since),
    supabase.from('activity_log').select('id', { count: 'exact', head: true })
      .eq('action', 'escalate_ceo')
      .gte('created_at', since),
  ])

  const leads = (leadsRes.data ?? []) as { stage: string; qualification_data: Record<string, unknown> | null }[]
  const interested = leads.filter(l => l.stage === 'warm' || l.stage === 'hot').length
  const qualified = leads.filter(l => {
    const q = l.qualification_data
    return q?.budget_ok === true || q?.timeline === 'inmediato' || q?.timeline === '3_meses'
  }).length

  return {
    total: leads.length,
    interested,
    qualified,
    meetings: meetingsRes.count ?? 0,
    escalated: escalationsRes.count ?? 0,
  }
}

// ── Objeciones más comunes (de la memoria de deals) ──────────

export interface ObjectionStat {
  objection: string
  count: number
}

export async function getTopObjections(limit = 6): Promise<ObjectionStat[]> {
  const { data, error } = await getServiceClient()
    .from('deal_summaries')
    .select('signals')
  if (error) throw new Error(`getTopObjections: ${error.message}`)

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { signals: { objections?: unknown } | null }[]) {
    const objections = row.signals?.objections
    if (!Array.isArray(objections)) continue
    for (const raw of objections) {
      if (typeof raw !== 'string' || !raw.trim()) continue
      const key = raw.trim().toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([objection, count]) => ({ objection, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

// ── Deal warnings (estilo Gong): leads A abandonados ─────────
// Un lead calificado A sin actividad >48h es dinero enfriándose.

export interface NeglectedLead {
  id: string
  name: string | null
  phone: string
  project_interest: string | null
  hoursIdle: number
}

export async function getNeglectedALeads(hours = 48): Promise<NeglectedLead[]> {
  const { scoreLead } = await import('@/lib/lead-scoring')
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const { data, error } = await getServiceClient()
    .from('leads')
    .select('id, name, phone, stage, qualification_data, project_interest, last_message_at, opted_out')
    .not('phone', 'like', 'n_%')
    .eq('opted_out', false)
    .neq('stage', 'cold')
    .lt('last_message_at', cutoff)
  if (error) throw new Error(`getNeglectedALeads: ${error.message}`)

  interface Row {
    id: string
    name: string | null
    phone: string
    stage: 'new' | 'warm' | 'hot' | 'cold'
    qualification_data: Parameters<typeof scoreLead>[0]['qualification_data']
    project_interest: string | null
    last_message_at: string
  }

  const now = Date.now()
  return ((data ?? []) as Row[])
    .filter(l => scoreLead(l).score === 'A')
    .map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      project_interest: l.project_interest,
      hoursIdle: Math.round((now - Date.parse(l.last_message_at)) / (60 * 60 * 1000)),
    }))
    .sort((a, b) => b.hoursIdle - a.hoursIdle)
    .slice(0, 8)
}

export interface SourceBreakdown {
  source: string
  count: number
}

export async function getSourceBreakdown(): Promise<SourceBreakdown[]> {
  const { data, error } = await getServiceClient()
    .from('lead_sources')
    .select('source_type')

  if (error) throw new Error(`getSourceBreakdown: ${error.message}`)

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { source_type: string }[]) {
    counts.set(row.source_type, (counts.get(row.source_type) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
}
