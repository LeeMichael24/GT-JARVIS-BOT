import { getServiceClient, getLatestUserMessageAt } from '@/lib/supabase'
import { isWithin24h } from '@/lib/wa-window'
import type { SessionMember } from '@/lib/auth'
import type { Conversation, Lead, LeadNote, Tag, TeamMember } from '@/types'

export interface InboxLead {
  lead: Lead
  snippet: string | null
  snippetRole: string | null
  tags: Tag[]
  assignedName: string | null
}

export interface LeadBundle {
  lead: Lead
  messages: Conversation[]
  tags: Tag[]
  allTags: Tag[]
  notes: (LeadNote & { author_name: string })[]
  team: TeamMember[]
  within24h: boolean
}

function leadVisible(member: SessionMember, lead: Lead): boolean {
  return member.role === 'admin' || lead.assigned_to === member.id
}

export async function listInboxLeads(member: SessionMember): Promise<InboxLead[]> {
  const supabase = getServiceClient()

  const baseQuery = supabase
    .from('leads')
    .select('*, lead_tags(tag_id, tags(*)), team_members!leads_assigned_to_fkey(name)')
    .not('phone', 'like', 'n_%')
    .order('last_message_at', { ascending: false })
    .limit(100)

  const { data: leads, error } = member.role !== 'admin'
    ? await baseQuery.eq('assigned_to', member.id)
    : await baseQuery

  if (error) throw new Error(`listInboxLeads: ${error.message}`)

  const rows = (leads ?? []) as (Lead & {
    lead_tags: { tag_id: string; tags: Tag }[] | null
    team_members: { name: string } | null
  })[]

  const ids = rows.map(l => l.id)
  const snippets = new Map<string, { content: string; role: string }>()
  if (ids.length > 0) {
    const { data: msgs } = await supabase
      .from('conversations')
      .select('lead_id, content, role, wa_message_id, created_at')
      .in('lead_id', ids)
      .not('wa_message_id', 'like', 'import_%')
      .not('wa_message_id', 'like', 'scraped_%')
      .order('created_at', { ascending: false })
      .limit(500)
    for (const m of (msgs ?? []) as { lead_id: string; content: string; role: string }[]) {
      if (!snippets.has(m.lead_id)) snippets.set(m.lead_id, { content: m.content, role: m.role })
    }
  }

  return rows.map(row => {
    const { lead_tags, team_members, ...lead } = row
    const snip = snippets.get(lead.id)
    return {
      lead: lead as Lead,
      snippet: snip?.content ?? null,
      snippetRole: snip?.role ?? null,
      tags: (lead_tags ?? []).map(lt => lt.tags).filter(Boolean),
      assignedName: team_members?.name ?? null,
    }
  })
}

export async function getLeadBundle(leadId: string, member: SessionMember): Promise<LeadBundle | null> {
  const supabase = getServiceClient()

  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle()
  if (error) throw new Error(`getLeadBundle: ${error.message}`)
  if (!lead || !leadVisible(member, lead as Lead)) return null

  const [msgsRes, tagsRes, allTagsRes, notesRes, teamRes, lastUserAt] = await Promise.all([
    supabase.from('conversations').select('*').eq('lead_id', leadId).not('wa_message_id', 'like', 'import_%').not('wa_message_id', 'like', 'scraped_%').order('created_at', { ascending: true }).limit(500),
    supabase.from('lead_tags').select('tags(*)').eq('lead_id', leadId),
    supabase.from('tags').select('*').order('name'),
    supabase.from('lead_notes').select('*, team_members(name)').eq('lead_id', leadId).order('created_at', { ascending: false }),
    supabase.from('team_members').select('*').eq('active', true).order('name'),
    getLatestUserMessageAt(leadId),
  ])

  const failed = [msgsRes, tagsRes, allTagsRes, notesRes, teamRes].find(r => r.error)
  if (failed?.error) throw new Error(`getLeadBundle: ${failed.error.message}`)

  return {
    lead: lead as Lead,
    messages: (msgsRes.data ?? []) as Conversation[],
    tags: ((tagsRes.data ?? []) as unknown as { tags: Tag }[]).map(r => r.tags).filter(Boolean),
    allTags: (allTagsRes.data ?? []) as Tag[],
    notes: ((notesRes.data ?? []) as (LeadNote & { team_members: { name: string } | null })[])
      .map(({ team_members, ...n }) => ({ ...n, author_name: team_members?.name ?? '—' })),
    team: (teamRes.data ?? []) as TeamMember[],
    within24h: isWithin24h(lastUserAt),
  }
}

export async function listAllTags(): Promise<Tag[]> {
  const { data, error } = await getServiceClient().from('tags').select('*').order('name')
  if (error) throw new Error(`listAllTags: ${error.message}`)
  return (data ?? []) as Tag[]
}

export async function listTeam(): Promise<TeamMember[]> {
  const { data, error } = await getServiceClient().from('team_members').select('*').order('name')
  if (error) throw new Error(`listTeam: ${error.message}`)
  return (data ?? []) as TeamMember[]
}
