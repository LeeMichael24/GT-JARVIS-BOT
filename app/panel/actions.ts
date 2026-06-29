'use server'

import { refresh } from 'next/cache'
import { requireAdmin, requireMember, type SessionMember } from '@/lib/auth'
import {
  getLatestUserMessageAt,
  getLeadById,
  getServiceClient,
  saveConversation,
  updateLead,
} from '@/lib/supabase'
import { isWithin24h } from '@/lib/wa-window'
import { sendText } from '@/services/whatsapp/client'
import type { BrainEntry, EscalationAction, EscalationRule, EscalationTriggerType, Lead, LeadStage, TeamRole } from '@/types'

export type ActionResult = { ok: true } | { ok: false; error: string }

const STAGES: LeadStage[] = ['new', 'warm', 'hot', 'cold']

function fail(error: unknown, fallback = 'ERROR'): ActionResult {
  const msg = error instanceof Error ? error.message : fallback
  if (msg === 'UNAUTHORIZED' || msg === 'FORBIDDEN') return { ok: false, error: msg }
  console.error('[panel action]', msg)
  return { ok: false, error: fallback }
}

async function getAccessibleLead(member: SessionMember, leadId: string): Promise<Lead> {
  const lead = await getLeadById(leadId)
  if (!lead) throw new Error('NOT_FOUND')
  if (member.role !== 'admin' && lead.assigned_to !== member.id) throw new Error('FORBIDDEN')
  return lead
}

export async function sendHumanMessage(leadId: string, text: string): Promise<ActionResult> {
  try {
    const member = await requireMember()
    const lead = await getAccessibleLead(member, leadId)

    const content = text.trim()
    if (!content) return { ok: false, error: 'EMPTY' }

    const lastUserAt = await getLatestUserMessageAt(leadId)
    if (!isWithin24h(lastUserAt)) return { ok: false, error: 'WINDOW_EXPIRED' }

    // Pausar a Daniela ANTES de enviar: si el cliente contesta al instante,
    // el webhook ya ve bot_active=false y no se pisan bot y humano.
    await updateLead(lead.id, {
      bot_active: false,
      ...(lead.assigned_to ? {} : { assigned_to: member.id }),
    })

    const waMessageId = await sendText(lead.phone, content, { typingDelay: false })
    await saveConversation({
      leadId: lead.id,
      role: 'human',
      content,
      waMessageId: waMessageId ?? undefined,
      sentBy: member.id,
    })

    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, 'SEND_FAILED')
  }
}

export async function setBotActive(leadId: string, active: boolean): Promise<ActionResult> {
  try {
    const member = await requireMember()
    await getAccessibleLead(member, leadId)
    await updateLead(leadId, { bot_active: active })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updateLeadStage(leadId: string, stage: LeadStage): Promise<ActionResult> {
  try {
    const member = await requireMember()
    await getAccessibleLead(member, leadId)
    if (!STAGES.includes(stage)) return { ok: false, error: 'INVALID_STAGE' }
    await updateLead(leadId, { stage })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function assignLead(leadId: string, memberId: string | null): Promise<ActionResult> {
  try {
    await requireAdmin()
    await updateLead(leadId, { assigned_to: memberId })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function addLeadTag(leadId: string, tagId: string): Promise<ActionResult> {
  try {
    const member = await requireMember()
    await getAccessibleLead(member, leadId)
    const { error } = await getServiceClient()
      .from('lead_tags')
      .insert({ lead_id: leadId, tag_id: tagId, source: 'human', created_by: member.id })
    if (error && error.code !== '23505' && !error.message.includes('duplicate')) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function removeLeadTag(leadId: string, tagId: string): Promise<ActionResult> {
  try {
    const member = await requireMember()
    await getAccessibleLead(member, leadId)
    const service = getServiceClient()
    const { error } = await service.from('lead_tags').delete().eq('lead_id', leadId).eq('tag_id', tagId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function addNote(leadId: string, content: string): Promise<ActionResult> {
  try {
    const member = await requireMember()
    await getAccessibleLead(member, leadId)
    const trimmed = content.trim()
    if (!trimmed) return { ok: false, error: 'EMPTY' }
    const { error } = await getServiceClient()
      .from('lead_notes')
      .insert({ lead_id: leadId, author: member.id, content: trimmed })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function createTag(name: string, color: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'EMPTY' }
    const { error } = await getServiceClient().from('tags').insert({ name: trimmed, color })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updateTag(tagId: string, name: string, color: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'EMPTY' }
    const service = getServiceClient()
    const { error } = await service.from('tags').update({ name: trimmed, color }).eq('id', tagId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteTag(tagId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    const { error } = await service.from('tags').delete().eq('id', tagId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function inviteTeamMember(email: string, name: string, role: TeamRole): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (!(['admin', 'asesor'] as TeamRole[]).includes(role)) return { ok: false, error: 'INVALID_ROLE' }
    const service = getServiceClient()
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? ''
    const { data, error } = await service.auth.admin.inviteUserByEmail(email.trim(), {
      redirectTo: `${site}/panel/set-password`,
    })
    if (error || !data.user) throw new Error(error?.message ?? 'INVITE_FAILED')
    const { error: insertError } = await service
      .from('team_members')
      .insert({ id: data.user.id, name: name.trim(), email: email.trim(), role })
    if (insertError) {
      // Rollback: sin fila en team_members el usuario auth quedaría huérfano
      // y el email sería im-posible de re-invitar (ya existe en auth)
      await service.auth.admin.deleteUser(data.user.id).catch(() => {})
      throw new Error(insertError.message)
    }
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, 'INVITE_FAILED')
  }
}

export async function deleteLead(leadId: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    await service.from('lead_tags').delete().eq('lead_id', leadId)
    await service.from('lead_notes').delete().eq('lead_id', leadId)
    await service.from('conversations').delete().eq('lead_id', leadId)
    await service.from('deal_summaries').delete().eq('lead_id', leadId)
    await service.from('sequences').delete().eq('lead_id', leadId)
    await service.from('agent_brain').delete().eq('lead_id', leadId)
    await service.from('lead_sources').delete().eq('lead_id', leadId)
    const { error } = await service.from('leads').delete().eq('id', leadId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, 'DELETE_FAILED')
  }
}

export async function deleteLeadsBatch(leadIds: string[]): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (leadIds.length === 0) return { ok: true }
    const service = getServiceClient()
    await service.from('lead_tags').delete().in('lead_id', leadIds)
    await service.from('lead_notes').delete().in('lead_id', leadIds)
    await service.from('conversations').delete().in('lead_id', leadIds)
    await service.from('deal_summaries').delete().in('lead_id', leadIds)
    await service.from('sequences').delete().in('lead_id', leadIds)
    await service.from('agent_brain').delete().in('lead_id', leadIds)
    await service.from('lead_sources').delete().in('lead_id', leadIds)
    const { error } = await service.from('leads').delete().in('id', leadIds)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error, 'DELETE_FAILED')
  }
}

export async function setMemberActive(memberId: string, active: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (memberId === admin.id) return { ok: false, error: 'CANT_DEACTIVATE_SELF' }
    const service = getServiceClient()
    if (!active) {
      const { data: target } = await service
        .from('team_members')
        .select('role')
        .eq('id', memberId)
        .maybeSingle()
      if (target?.role === 'admin') {
        const { count } = await service
          .from('team_members')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin')
          .eq('active', true)
        if ((count ?? 0) <= 1) return { ok: false, error: 'LAST_ADMIN' }
      }
    }
    const { error } = await service
      .from('team_members')
      .update({ active })
      .eq('id', memberId)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Brain CRUD ──────────────────────────────────────

const VALID_CATEGORIES = ['observation', 'pattern', 'correction', 'metric'] as const

export async function getBrainEntries(): Promise<BrainEntry[]> {
  await requireAdmin()
  const { data, error } = await getServiceClient()
    .from('agent_brain')
    .select('*')
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as BrainEntry[]) ?? []
}

export async function createBrainEntry(
  category: string, topic: string, content: string, confidence: number,
): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (!VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) return { ok: false, error: 'INVALID_CATEGORY' }
    if (!topic.trim() || !content.trim()) return { ok: false, error: 'EMPTY' }
    const { error } = await getServiceClient().from('agent_brain').insert({
      category, topic: topic.trim(), content: content.trim(),
      source: 'team', lead_id: null, confidence: Math.min(1, Math.max(0, confidence)), active: true,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updateBrainEntry(
  id: string, updates: { topic?: string; content?: string; confidence?: number; active?: boolean; category?: string },
): Promise<ActionResult> {
  try {
    await requireAdmin()
    const patch: Record<string, unknown> = {}
    if (updates.topic !== undefined) patch.topic = updates.topic.trim()
    if (updates.content !== undefined) patch.content = updates.content.trim()
    if (updates.confidence !== undefined) patch.confidence = Math.min(1, Math.max(0, updates.confidence))
    if (updates.active !== undefined) patch.active = updates.active
    if (updates.category !== undefined) {
      if (!VALID_CATEGORIES.includes(updates.category as typeof VALID_CATEGORIES[number])) return { ok: false, error: 'INVALID_CATEGORY' }
      patch.category = updates.category
    }
    if (Object.keys(patch).length === 0) return { ok: true }
    const { error } = await getServiceClient().from('agent_brain').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteBrainEntry(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const { error } = await getServiceClient().from('agent_brain').delete().eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Escalation Rules CRUD ──────────────────────────────

const VALID_TRIGGER_TYPES: EscalationTriggerType[] = ['keyword', 'topic', 'condition']
const VALID_ACTIONS: EscalationAction[] = ['escalate_ceo', 'consult_team']

export async function getEscalationRules(): Promise<EscalationRule[]> {
  await requireAdmin()
  const { data, error } = await getServiceClient()
    .from('escalation_rules')
    .select('*')
    .order('trigger_type')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as EscalationRule[]) ?? []
}

export async function createEscalationRule(
  triggerType: EscalationTriggerType, triggerValue: string, description: string | null, action: EscalationAction,
): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (!VALID_TRIGGER_TYPES.includes(triggerType)) return { ok: false, error: 'INVALID_TRIGGER_TYPE' }
    if (!VALID_ACTIONS.includes(action)) return { ok: false, error: 'INVALID_ACTION' }
    if (!triggerValue.trim()) return { ok: false, error: 'EMPTY' }
    const { error } = await getServiceClient().from('escalation_rules').insert({
      trigger_type: triggerType, trigger_value: triggerValue.trim(),
      description: description?.trim() || null, action, active: true,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updateEscalationRule(
  id: string, updates: { trigger_type?: EscalationTriggerType; trigger_value?: string; description?: string | null; action?: EscalationAction; active?: boolean },
): Promise<ActionResult> {
  try {
    await requireAdmin()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.trigger_type !== undefined) {
      if (!VALID_TRIGGER_TYPES.includes(updates.trigger_type)) return { ok: false, error: 'INVALID_TRIGGER_TYPE' }
      patch.trigger_type = updates.trigger_type
    }
    if (updates.trigger_value !== undefined) {
      if (!updates.trigger_value.trim()) return { ok: false, error: 'EMPTY' }
      patch.trigger_value = updates.trigger_value.trim()
    }
    if (updates.description !== undefined) patch.description = updates.description?.trim() || null
    if (updates.action !== undefined) {
      if (!VALID_ACTIONS.includes(updates.action)) return { ok: false, error: 'INVALID_ACTION' }
      patch.action = updates.action
    }
    if (updates.active !== undefined) patch.active = updates.active
    const { error } = await getServiceClient().from('escalation_rules').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteEscalationRule(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const { error } = await getServiceClient().from('escalation_rules').delete().eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function toggleEscalationRule(id: string, active: boolean): Promise<ActionResult> {
  return updateEscalationRule(id, { active })
}
