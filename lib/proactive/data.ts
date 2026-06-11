import { getServiceClient } from '@/lib/supabase'
import type {
  Campaign, CampaignKind, CampaignRecipient, CampaignStatus, GTProject, Lead,
  MessageTemplate, RecontactRule,
} from '@/types'

export interface LeadWithTags {
  lead: Lead
  tagIds: string[]
  // último mensaje DEL CLIENTE (role user) — gating de days_inactive;
  // last_message_at NO sirve (lo actualizan también las respuestas del bot)
  lastUserMessageAt: string | null
}

export async function leadsWithTags(): Promise<LeadWithTags[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*, lead_tags(tag_id), conversations(created_at)')
    .eq('conversations.role', 'user')
    .order('created_at', { referencedTable: 'conversations', ascending: false })
    .limit(1, { referencedTable: 'conversations' })
  if (error) throw new Error(`leadsWithTags: ${error.message}`)
  const rows = (data ?? []) as (Lead & {
    lead_tags: { tag_id: string }[] | null
    conversations: { created_at: string }[] | null
  })[]
  return rows.map(({ lead_tags, conversations, ...lead }) => ({
    lead: lead as Lead,
    tagIds: (lead_tags ?? []).map(t => t.tag_id),
    lastUserMessageAt: conversations?.[0]?.created_at ?? null,
  }))
}

export async function listActiveRules(): Promise<RecontactRule[]> {
  const { data, error } = await getServiceClient()
    .from('recontact_rules').select('*').eq('active', true)
  if (error) throw new Error(`listActiveRules: ${error.message}`)
  return (data ?? []) as RecontactRule[]
}

export async function getTemplateById(id: string): Promise<MessageTemplate | null> {
  const { data, error } = await getServiceClient()
    .from('message_templates').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getTemplateById: ${error.message}`)
  return (data as MessageTemplate) ?? null
}

export async function getTemplateByName(name: string): Promise<MessageTemplate | null> {
  const { data, error } = await getServiceClient()
    .from('message_templates').select('*').eq('name', name).eq('active', true).maybeSingle()
  if (error) throw new Error(`getTemplateByName: ${error.message}`)
  return (data as MessageTemplate) ?? null
}

// Leads que ya están en una campaña viva (pendiente o enviándose)
export async function leadIdsInActiveCampaigns(): Promise<Set<string>> {
  const { data, error } = await getServiceClient()
    .from('campaign_recipients')
    .select('lead_id, campaigns!inner(status)')
    .in('campaigns.status', ['pending_approval', 'sending'])
  if (error) throw new Error(`leadIdsInActiveCampaigns: ${error.message}`)
  return new Set(((data ?? []) as { lead_id: string }[]).map(r => r.lead_id))
}

export async function hasCampaignForRuleToday(ruleId: string, dayStartIso: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('campaigns').select('id').eq('rule_id', ruleId).gte('created_at', dayStartIso).limit(1)
  if (error) throw new Error(`hasCampaignForRuleToday: ${error.message}`)
  return ((data ?? []) as unknown[]).length > 0
}

export async function hasCampaignForListing(slug: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('campaigns').select('id').eq('listing_slug', slug).limit(1)
  if (error) throw new Error(`hasCampaignForListing: ${error.message}`)
  return ((data ?? []) as unknown[]).length > 0
}

export interface NewCampaign {
  kind: CampaignKind
  title: string
  reason: string | null
  rule_id?: string | null
  listing_slug?: string | null
  template_id: string
  recipients: { lead_id: string; variables: string[]; match_reason: string | null }[]
}

export async function createCampaign(c: NewCampaign): Promise<string> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      kind: c.kind, title: c.title, reason: c.reason,
      rule_id: c.rule_id ?? null, listing_slug: c.listing_slug ?? null,
      template_id: c.template_id,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createCampaign: ${error?.message ?? 'sin id'}`)
  const campaignId = (data as { id: string }).id
  const { error: rErr } = await supabase
    .from('campaign_recipients')
    .insert(c.recipients.map(r => ({ campaign_id: campaignId, ...r })))
  if (rErr) throw new Error(`createCampaign recipients: ${rErr.message}`)
  return campaignId
}

export async function listKnownSlugs(): Promise<Set<string>> {
  const { data, error } = await getServiceClient().from('known_listings').select('slug')
  if (error) throw new Error(`listKnownSlugs: ${error.message}`)
  return new Set(((data ?? []) as { slug: string }[]).map(r => r.slug))
}

export async function insertKnownListings(listings: GTProject[]): Promise<void> {
  if (listings.length === 0) return
  const { error } = await getServiceClient()
    .from('known_listings')
    .insert(listings.map(l => ({
      slug: l.slug, name: l.name, entity_type: l.entityType ?? null, snapshot: l,
    })))
  if (error) throw new Error(`insertKnownListings: ${error.message}`)
}

export interface CampaignForSend {
  campaign: Campaign
  template: MessageTemplate
  recipients: (CampaignRecipient & { lead: Pick<Lead, 'id' | 'phone' | 'name'> })[]
}

export async function getCampaignForSend(id: string): Promise<CampaignForSend | null> {
  const supabase = getServiceClient()
  const { data: campaign, error } = await supabase
    .from('campaigns').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getCampaignForSend: ${error.message}`)
  if (!campaign) return null
  const template = await getTemplateById((campaign as Campaign).template_id)
  if (!template) throw new Error('TEMPLATE_INACTIVE')
  const { data: recipients, error: rErr } = await supabase
    .from('campaign_recipients')
    .select('*, leads(id, phone, name)')
    .eq('campaign_id', id)
  if (rErr) throw new Error(`getCampaignForSend recipients: ${rErr.message}`)
  return {
    campaign: campaign as Campaign,
    template,
    recipients: ((recipients ?? []) as (CampaignRecipient & { leads: Pick<Lead, 'id' | 'phone' | 'name'> })[])
      .map(({ leads, ...r }) => ({ ...r, lead: leads })),
  }
}

export async function setCampaignStatus(
  id: string,
  fields: Partial<Pick<Campaign, 'status' | 'approved_by' | 'approved_at'>>
): Promise<void> {
  const { error } = await getServiceClient().from('campaigns').update(fields).eq('id', id)
  if (error) throw new Error(`setCampaignStatus: ${error.message}`)
}

export async function markRecipient(
  id: string,
  fields: Partial<Pick<CampaignRecipient, 'status' | 'wa_message_id' | 'error' | 'sent_at' | 'included'>>
): Promise<void> {
  const { error } = await getServiceClient().from('campaign_recipients').update(fields).eq('id', id)
  if (error) throw new Error(`markRecipient: ${error.message}`)
}

// Claim atómico: solo UNA ejecución puede tomar este recipient para enviarlo.
// (pending|failed → sending). Si otra lo tomó (o ya se envió), devuelve false.
export async function claimRecipient(id: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('campaign_recipients')
    .update({ status: 'sending' })
    .eq('id', id)
    .in('status', ['pending', 'failed'])
    .select('id')
  if (error) throw new Error(`claimRecipient: ${error.message}`)
  return ((data ?? []) as unknown[]).length > 0
}

// Claim atómico de campaña: transición condicional de estado.
// Devuelve false si la campaña no estaba en fromStatus (otro admin ganó la carrera).
export async function claimCampaign(
  id: string,
  fromStatus: CampaignStatus,
  fields: Partial<Pick<Campaign, 'status' | 'approved_by' | 'approved_at'>>
): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('campaigns')
    .update(fields)
    .eq('id', id)
    .eq('status', fromStatus)
    .select('id')
  if (error) throw new Error(`claimCampaign: ${error.message}`)
  return ((data ?? []) as unknown[]).length > 0
}

export interface PendingCampaign {
  campaign: Campaign
  template: MessageTemplate
  recipients: (CampaignRecipient & { lead: Pick<Lead, 'id' | 'phone' | 'name'> })[]
}

export async function listPendingCampaigns(): Promise<PendingCampaign[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, message_templates(*), campaign_recipients(*, leads(id, phone, name))')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listPendingCampaigns: ${error.message}`)
  type Row = Campaign & {
    message_templates: MessageTemplate
    campaign_recipients: (CampaignRecipient & { leads: Pick<Lead, 'id' | 'phone' | 'name'> })[]
  }
  return ((data ?? []) as Row[]).map(({ message_templates, campaign_recipients, ...campaign }) => ({
    campaign: campaign as Campaign,
    template: message_templates,
    recipients: campaign_recipients.map(({ leads, ...r }) => ({ ...r, lead: leads })),
  }))
}

export async function listCampaignHistory(limit = 20): Promise<(Campaign & { sent: number; failed: number })[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, campaign_recipients(status)')
    .in('status', ['sending', 'done', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listCampaignHistory: ${error.message}`)
  type Row = Campaign & { campaign_recipients: { status: string }[] }
  return ((data ?? []) as Row[]).map(({ campaign_recipients, ...c }) => ({
    ...(c as Campaign),
    sent: campaign_recipients.filter(r => r.status === 'sent').length,
    failed: campaign_recipients.filter(r => r.status === 'failed').length,
  }))
}

export async function countPendingCampaigns(): Promise<number> {
  const { count, error } = await getServiceClient()
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_approval')
  if (error) throw new Error(`countPendingCampaigns: ${error.message}`)
  return count ?? 0
}

export async function listTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await getServiceClient()
    .from('message_templates').select('*').order('name')
  if (error) throw new Error(`listTemplates: ${error.message}`)
  return (data ?? []) as MessageTemplate[]
}

export async function listRules(): Promise<RecontactRule[]> {
  const { data, error } = await getServiceClient()
    .from('recontact_rules').select('*').order('created_at')
  if (error) throw new Error(`listRules: ${error.message}`)
  return (data ?? []) as RecontactRule[]
}
