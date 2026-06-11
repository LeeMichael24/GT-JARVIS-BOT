'use server'

import { refresh } from 'next/cache'
import { requireAdmin, requireMember } from '@/lib/auth'
import { getLeadById, getServiceClient, updateLead } from '@/lib/supabase'
import { sendCampaign } from '@/lib/proactive/engine'
import { claimCampaign, markRecipient } from '@/lib/proactive/data'
import type { LeadStage, TemplateCategory } from '@/types'

export type ActionResult = { ok: true } | { ok: false; error: string }

function fail(error: unknown, fallback = 'ERROR'): ActionResult {
  const msg = error instanceof Error ? error.message : fallback
  if (msg === 'UNAUTHORIZED' || msg === 'FORBIDDEN') return { ok: false, error: msg }
  console.error('[proactive action]', msg)
  return { ok: false, error: fallback }
}

export async function approveCampaign(campaignId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    // Claim atómico: si otro admin aprobó en paralelo (doble click), affected=0
    // y NO se envía dos veces — guard del camino del dinero
    const claimed = await claimCampaign(campaignId, 'pending_approval', {
      status: 'sending',
      approved_by: admin.id,
      approved_at: new Date().toISOString(),
    })
    if (!claimed) return { ok: false, error: 'NOT_PENDING' }
    await sendCampaign(campaignId)
    refresh()
    return { ok: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : ''
    if (msg === 'TEMPLATE_INACTIVE') return { ok: false, error: 'TEMPLATE_INACTIVE' }
    return fail(error, 'SEND_FAILED')
  }
}

export async function rejectCampaign(campaignId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const claimed = await claimCampaign(campaignId, 'pending_approval', { status: 'rejected' })
    if (!claimed) return { ok: false, error: 'NOT_PENDING' }
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function toggleRecipient(recipientId: string, included: boolean): Promise<ActionResult> {
  try {
    await requireAdmin()
    await markRecipient(recipientId, { included })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function retryFailedRecipients(campaignId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    // Solo se reintenta una campaña terminada; doble click → affected=0
    const claimed = await claimCampaign(campaignId, 'done', { status: 'sending' })
    if (!claimed) return { ok: false, error: 'NOT_PENDING' }
    await sendCampaign(campaignId)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, 'SEND_FAILED')
  }
}

export async function setLeadOptOut(leadId: string, optedOut: boolean): Promise<ActionResult> {
  try {
    const member = await requireMember()
    const lead = await getLeadById(leadId)
    if (!lead) throw new Error('NOT_FOUND')
    if (member.role !== 'admin' && lead.assigned_to !== member.id) throw new Error('FORBIDDEN')
    await updateLead(leadId, { opted_out: optedOut })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Plantillas (admin) ─────────────────────────────────────────────

export interface TemplateInput {
  name: string
  language: string
  category: TemplateCategory
  body_preview: string
  variables: number
}

function validTemplate(t: TemplateInput): string | null {
  if (!t.name.trim() || !/^[a-z0-9_]+$/.test(t.name.trim())) return 'INVALID_NAME'
  if (t.variables < 0 || t.variables > 2) return 'INVALID_VARIABLES'
  if (!t.body_preview.trim()) return 'EMPTY'
  return null
}

export async function createMessageTemplate(t: TemplateInput): Promise<ActionResult> {
  try {
    await requireAdmin()
    const invalid = validTemplate(t)
    if (invalid) return { ok: false, error: invalid }
    const { error } = await getServiceClient().from('message_templates').insert({
      name: t.name.trim(), language: t.language, category: t.category,
      body_preview: t.body_preview.trim(), variables: t.variables,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function setTemplateActive(templateId: string, active: boolean): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    const { error } = await service.from('message_templates').update({ active }).eq('id', templateId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Reglas (admin) ─────────────────────────────────────────────────

export interface RuleInput {
  name: string
  stages: LeadStage[] | null
  tag_ids: string[] | null
  days_inactive: number
  template_id: string
  max_per_run: number
}

function validRule(r: RuleInput): string | null {
  if (!r.name.trim()) return 'EMPTY'
  if (!Number.isInteger(r.days_inactive) || r.days_inactive < 1) return 'INVALID_DAYS'
  if (!Number.isInteger(r.max_per_run) || r.max_per_run < 1 || r.max_per_run > 50) return 'INVALID_MAX'
  if (!r.template_id) return 'NO_TEMPLATE'
  return null
}

export async function createRecontactRule(r: RuleInput): Promise<ActionResult> {
  try {
    await requireAdmin()
    const invalid = validRule(r)
    if (invalid) return { ok: false, error: invalid }
    const { error } = await getServiceClient().from('recontact_rules').insert({
      name: r.name.trim(), stages: r.stages, tag_ids: r.tag_ids,
      days_inactive: r.days_inactive, template_id: r.template_id, max_per_run: r.max_per_run,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function setRuleActive(ruleId: string, active: boolean): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    const { error } = await service.from('recontact_rules').update({ active }).eq('id', ruleId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteRecontactRule(ruleId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    const { error } = await service.from('recontact_rules').delete().eq('id', ruleId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}
