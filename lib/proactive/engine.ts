import * as data from '@/lib/proactive/data'
import { getAllProjects } from '@/services/projects/gt-api'
import { sendTemplate } from '@/services/whatsapp/client'
import { saveConversation, updateLead } from '@/lib/supabase'
import { isLeadEligible, matchesRule, rankByStage } from '@/lib/proactive/eligibility'
import { buildRecipientParams, renderTemplate } from '@/lib/proactive/render'
import { matchLeadsToListing } from '@/lib/proactive/matching'
import type { GTProject } from '@/types'

// Dependencias inyectables: los tests pasan fakes, producción usa los defaults.
export interface EngineDeps {
  leadsWithTags: typeof data.leadsWithTags
  listActiveRules: typeof data.listActiveRules
  getTemplateById: typeof data.getTemplateById
  getTemplateByName: typeof data.getTemplateByName
  leadIdsInActiveCampaigns: typeof data.leadIdsInActiveCampaigns
  hasCampaignForRuleToday: typeof data.hasCampaignForRuleToday
  hasCampaignForListing: typeof data.hasCampaignForListing
  createCampaign: typeof data.createCampaign
  listKnownSlugs: typeof data.listKnownSlugs
  insertKnownListings: typeof data.insertKnownListings
  getAllProjects: typeof getAllProjects
  getCampaignForSend: typeof data.getCampaignForSend
  setCampaignStatus: typeof data.setCampaignStatus
  claimRecipient: typeof data.claimRecipient
  markRecipient: typeof data.markRecipient
  sendTemplate: typeof sendTemplate
  saveConversation: typeof saveConversation
  updateLead: typeof updateLead
  now: () => number
}

const realDeps: EngineDeps = {
  leadsWithTags: data.leadsWithTags,
  listActiveRules: data.listActiveRules,
  getTemplateById: data.getTemplateById,
  getTemplateByName: data.getTemplateByName,
  leadIdsInActiveCampaigns: data.leadIdsInActiveCampaigns,
  hasCampaignForRuleToday: data.hasCampaignForRuleToday,
  hasCampaignForListing: data.hasCampaignForListing,
  createCampaign: data.createCampaign,
  listKnownSlugs: data.listKnownSlugs,
  insertKnownListings: data.insertKnownListings,
  getAllProjects,
  getCampaignForSend: data.getCampaignForSend,
  setCampaignStatus: data.setCampaignStatus,
  claimRecipient: data.claimRecipient,
  markRecipient: data.markRecipient,
  sendTemplate,
  saveConversation,
  updateLead,
  now: () => Date.now(),
}

const OPPORTUNITY_TEMPLATE = 'nueva_oportunidad'
const SEND_GAP_MS = 250

function dayStartIso(nowMs: number): string {
  const d = new Date(nowMs)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function runRecontactRules(deps: EngineDeps = realDeps): Promise<{ campaignsCreated: number }> {
  const nowMs = deps.now()
  const [rules, universe, busy] = await Promise.all([
    deps.listActiveRules(),
    deps.leadsWithTags(),
    deps.leadIdsInActiveCampaigns(),
  ])
  let campaignsCreated = 0

  for (const rule of rules) {
    if (await deps.hasCampaignForRuleToday(rule.id, dayStartIso(nowMs))) continue
    const template = await deps.getTemplateById(rule.template_id)
    if (!template || !template.active) continue

    const candidates = universe
      .filter(({ lead, tagIds, lastUserMessageAt }) =>
        !busy.has(lead.id) &&
        isLeadEligible(lead, nowMs) &&
        matchesRule(lead, tagIds, rule, lastUserMessageAt, nowMs))
      .map(({ lead }) => lead)

    const chosen = rankByStage(candidates).slice(0, rule.max_per_run)
    if (chosen.length === 0) continue

    try {
      await deps.createCampaign({
        kind: 'recontact',
        title: `Regla: ${rule.name}`,
        reason: `${rule.days_inactive}+ días sin conversación`,
        rule_id: rule.id,
        template_id: template.id,
        recipients: chosen.map(lead => ({
          lead_id: lead.id,
          variables: buildRecipientParams(lead, { variables: template.variables }),
          match_reason: `Etapa ${lead.stage}`,
        })),
      })
      campaignsCreated++
    } catch (err) {
      // Índice único de idempotencia (cron solapado): skip silencioso
      const msg = err instanceof Error ? err.message : ''
      if (!msg.includes('uniq_campaign') && !msg.includes('duplicate')) throw err
    }
  }
  return { campaignsCreated }
}

export async function runDailyRadar(deps: EngineDeps = realDeps): Promise<{ newListings: number; campaignsCreated: number }> {
  const nowMs = deps.now()
  const [projects, known] = await Promise.all([deps.getAllProjects(), deps.listKnownSlugs()])

  // Primera ejecución: memorizar el catálogo completo sin disparar campañas
  if (known.size === 0) {
    await deps.insertKnownListings(projects)
    return { newListings: projects.length, campaignsCreated: 0 }
  }

  const fresh = projects.filter(p => p.slug && !known.has(p.slug))
  if (fresh.length === 0) return { newListings: 0, campaignsCreated: 0 }
  await deps.insertKnownListings(fresh)

  let campaignsCreated = 0
  const template = await deps.getTemplateByName(OPPORTUNITY_TEMPLATE)
  if (!template) {
    console.warn(`[radar] Sin plantilla activa '${OPPORTUNITY_TEMPLATE}' — ${fresh.length} listings registrados sin campaña`)
    return { newListings: fresh.length, campaignsCreated: 0 }
  }

  const [universe, busy] = await Promise.all([deps.leadsWithTags(), deps.leadIdsInActiveCampaigns()])

  for (const listing of fresh) {
    if (await deps.hasCampaignForListing(listing.slug)) continue
    const eligible = universe
      .filter(({ lead }) => !busy.has(lead.id) && isLeadEligible(lead, nowMs))
      .map(({ lead }) => lead)
    const matches = matchLeadsToListing(listing, eligible)
    if (matches.length === 0) continue

    const byId = new Map(eligible.map(l => [l.id, l]))
    try {
      await deps.createCampaign({
        kind: 'opportunity',
        title: `🆕 ${listing.name}`,
        reason: `Nuevo en el ecosistema (${listing.entityType ?? listing.type ?? 'propiedad'})`,
        listing_slug: listing.slug,
        template_id: template.id,
        recipients: matches.map(m => ({
          lead_id: m.leadId,
          variables: buildRecipientParams(byId.get(m.leadId)!, {
            variables: template.variables,
            listingName: listing.name,
          }),
          match_reason: m.reason,
        })),
      })
      campaignsCreated++
    } catch (err) {
      // Índice único de idempotencia (cron solapado): skip silencioso
      const msg = err instanceof Error ? err.message : ''
      if (!msg.includes('uniq_campaign') && !msg.includes('duplicate')) throw err
    }
  }
  return { newListings: fresh.length, campaignsCreated }
}

export async function sendCampaign(campaignId: string, deps: EngineDeps = realDeps): Promise<{ sent: number; failed: number }> {
  const bundle = await deps.getCampaignForSend(campaignId)
  if (!bundle) throw new Error('NOT_FOUND')
  const { template, recipients } = bundle

  let sent = 0
  let failed = 0
  for (const r of recipients) {
    if (!r.included) {
      if (r.status === 'pending') await deps.markRecipient(r.id, { status: 'skipped' })
      continue
    }
    if (r.status !== 'pending' && r.status !== 'failed') continue
    // Claim atómico ANTES del gasto: si un retry/doble ejecución ya lo tomó, saltar
    if (!(await deps.claimRecipient(r.id))) continue
    try {
      const waMessageId = await deps.sendTemplate(r.lead.phone, template.name, template.language, r.variables)
      await deps.markRecipient(r.id, {
        status: 'sent',
        wa_message_id: waMessageId,
        error: null,
        sent_at: new Date(deps.now()).toISOString(),
      })
      // El historial del chat muestra el proactivo y Daniela tiene el contexto
      await deps.saveConversation({
        leadId: r.lead_id,
        role: 'assistant',
        content: renderTemplate(template.body_preview, r.variables),
        waMessageId: waMessageId ?? undefined,
      })
      await deps.updateLead(r.lead_id, { last_proactive_at: new Date(deps.now()).toISOString() })
      sent++
    } catch (err) {
      await deps.markRecipient(r.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'send failed',
      })
      failed++
    }
    await new Promise(res => setTimeout(res, SEND_GAP_MS))
  }
  await deps.setCampaignStatus(campaignId, { status: 'done' })
  return { sent, failed }
}
