import { getServiceClient } from '@/lib/supabase'
import type { AdCampaign, LeadSource, WaReferral } from '@/types'

export async function saveLeadSource(
  leadId: string,
  referral: WaReferral,
): Promise<LeadSource> {
  const supabase = getServiceClient()

  const sourceType = referral.source_type === 'ad' ? 'meta_ad' as const : 'organic' as const

  const { data, error } = await supabase
    .from('lead_sources')
    .insert({
      lead_id: leadId,
      source_type: sourceType,
      campaign_id: referral.source_id ?? null,
      ad_id: referral.source_id ?? null,
      ad_headline: referral.headline ?? null,
      ad_body: referral.body ?? null,
      source_url: referral.source_url ?? null,
      raw_referral: referral as Record<string, unknown>,
    })
    .select()
    .single()

  if (error) throw new Error(`saveLeadSource: ${error.message}`)
  return data as LeadSource
}

export async function getLeadSource(leadId: string): Promise<LeadSource | null> {
  const { data, error } = await getServiceClient()
    .from('lead_sources')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`getLeadSource: ${error.message}`)
  return (data as LeadSource) ?? null
}

export async function getActiveAdCampaigns(): Promise<AdCampaign[]> {
  const { data, error } = await getServiceClient()
    .from('ad_campaigns')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`getActiveAdCampaigns: ${error.message}`)
  return (data ?? []) as AdCampaign[]
}

export async function matchAdCampaign(
  referralSourceId: string,
): Promise<AdCampaign | null> {
  const { data, error } = await getServiceClient()
    .from('ad_campaigns')
    .select('*')
    .eq('external_id', referralSourceId)
    .maybeSingle()

  if (error) throw new Error(`matchAdCampaign: ${error.message}`)
  return (data as AdCampaign) ?? null
}

export function formatSourceContextForPrompt(
  source: LeadSource | null,
  campaign: AdCampaign | null,
): string | null {
  if (!source || source.source_type === 'organic') return null

  const parts: string[] = []
  parts.push('# ORIGEN DEL LEAD — CAMPAÑA PUBLICITARIA')
  parts.push('Este cliente llegó a través de un anuncio de Meta (Facebook/Instagram).')

  if (source.ad_headline) {
    parts.push(`Anuncio que vio: "${source.ad_headline}"`)
  }
  if (source.ad_body) {
    parts.push(`Mensaje del anuncio: "${source.ad_body}"`)
  }

  if (campaign) {
    parts.push(`Campaña: ${campaign.name}`)
    if (campaign.target_project) {
      parts.push(`Proyecto objetivo: ${campaign.target_project}`)
    }
    if (campaign.offer_details) {
      parts.push(`Notas del equipo sobre este anuncio: ${campaign.offer_details}`)
    }
  }

  parts.push('')
  parts.push('REGLA: Este cliente ya vio el anuncio, así que SABE de qué se trata. No repitas el contenido del anuncio.')
  parts.push('En su lugar, dale la bienvenida y avanza directamente a resolver su interés: precios, disponibilidad, proceso.')
  parts.push('Si el anuncio mencionaba una oferta o promoción, confírmala y úsala como palanca de cierre.')

  return parts.join('\n')
}

export function formatActiveAdsForPrompt(campaigns: AdCampaign[]): string | null {
  const active = campaigns.filter(c => c.status === 'active' && c.offer_details)
  if (active.length === 0) return null

  const parts: string[] = []
  parts.push('# CAMPAÑAS PUBLICITARIAS ACTIVAS')
  parts.push('Estos son los anuncios que estamos corriendo actualmente. Si un cliente pregunta por algo relacionado, usa este contexto:')
  parts.push('')

  for (const c of active) {
    parts.push(`- ${c.name}${c.target_project ? ` (${c.target_project})` : ''}`)
    parts.push(`  ${c.offer_details}`)
  }

  return parts.join('\n')
}
