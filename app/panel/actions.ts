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
import { logActivity, getRecentActivity } from '@/lib/activity-log'
import { PROMPT_BLOCK_DEFS, PROMPT_BLOCK_KEYS, DEFAULT_PROMPT_BLOCKS } from '@/lib/prompt-blocks'
import { analyzeTrainingText, type TrainingAnalysis } from '@/lib/training'
import { runNightlyReflection } from '@/lib/reflection'
import { runDailyRadar, runRecontactRules } from '@/lib/proactive/engine'
import { aggregateDailyMetrics } from '@/lib/agent-brain'
import { syncProjectMediaFromEcosystem } from '@/lib/media-sync'
import { getAgentSettings } from '@/lib/agent-settings'
import { recordCronRun, getRecentCronRuns } from '@/lib/cron-log'
import type { ActivityLogEntry, AgentObjective, BrainEntry, CronRun, EscalationAction, EscalationRule, EscalationTriggerType, Lead, LeadStage, ObjectiveScope, TeamRole } from '@/types'
import type { ProjectScript } from '@/lib/project-scripts'

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

// ── Guiones de venta por proyecto (project_scripts) ─────────

export async function getProjectScripts(): Promise<ProjectScript[]> {
  await requireAdmin()
  const { data, error } = await getServiceClient()
    .from('project_scripts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    // Tabla aun no migrada — el tab muestra vacio en vez de romper la pagina
    console.warn('[panel] project_scripts no disponible:', error.message)
    return []
  }
  return (data as ProjectScript[]) ?? []
}

function parseKeywords(raw: string): string[] {
  return Array.from(new Set(
    raw.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0),
  ))
}

export async function createProjectScript(
  projectName: string, keywordsRaw: string, script: string,
): Promise<ActionResult> {
  try {
    await requireAdmin()
    const keywords = parseKeywords(keywordsRaw)
    if (!projectName.trim() || !script.trim()) return { ok: false, error: 'EMPTY' }
    if (keywords.length === 0) return { ok: false, error: 'NO_KEYWORDS' }
    const { error } = await getServiceClient().from('project_scripts').insert({
      project_name: projectName.trim(),
      trigger_keywords: keywords,
      script: script.trim(),
      active: true,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updateProjectScript(
  id: string,
  updates: { project_name?: string; keywordsRaw?: string; script?: string; active?: boolean },
): Promise<ActionResult> {
  try {
    await requireAdmin()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.project_name !== undefined) {
      if (!updates.project_name.trim()) return { ok: false, error: 'EMPTY' }
      patch.project_name = updates.project_name.trim()
    }
    if (updates.keywordsRaw !== undefined) {
      const keywords = parseKeywords(updates.keywordsRaw)
      if (keywords.length === 0) return { ok: false, error: 'NO_KEYWORDS' }
      patch.trigger_keywords = keywords
    }
    if (updates.script !== undefined) {
      if (!updates.script.trim()) return { ok: false, error: 'EMPTY' }
      patch.script = updates.script.trim()
    }
    if (updates.active !== undefined) patch.active = updates.active
    const { error } = await getServiceClient().from('project_scripts').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteProjectScript(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const { error } = await getServiceClient().from('project_scripts').delete().eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function toggleProjectScript(id: string, active: boolean): Promise<ActionResult> {
  return updateProjectScript(id, { active })
}

// ── Ajustes vivos del agente (agent_settings) ─────────────────

// Validador numérico con rango — espejo de los rangos en lib/agent-settings.ts
const inRange = (min: number, max: number) => (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max
}

const SETTINGS_WHITELIST: Record<string, (v: string) => boolean> = {
  emoji_policy: v => ['minimal', 'moderate', 'none'].includes(v),
  learning_sensitivity: v => ['high', 'normal'].includes(v),
  formality_default: v => ['tu', 'usted'].includes(v),
  custom_instructions: v => v.length <= 3000,
  reflection_enabled: v => ['true', 'false'].includes(v),
  agent_enabled: v => ['true', 'false'].includes(v),
  ceo_name: v => v.length > 0 && v.length <= 80,
  escalation_budget_usd: inRange(1_000, 100_000_000),
  escalation_units: inRange(2, 1_000),
  reply_max_chars: inRange(100, 2_000),
  llm_temperature: inRange(0, 1.5),
  reflection_temperature: inRange(0, 1.5),
  business_hours_start: inRange(0, 23),
  business_hours_end: inRange(1, 24),
  rental_threshold_usd: inRange(0, 1_000_000),
  history_window: inRange(4, 50),
  brain_min_confidence: inRange(0.1, 1),
  auto_promote_enabled: v => ['true', 'false'].includes(v),
  auto_promote_threshold: inRange(2, 50),
}

export interface AgentSettingRow {
  key: string
  value: string
  description: string | null
}

export async function getAgentSettingsPanel(): Promise<{ rows: AgentSettingRow[]; tableReady: boolean }> {
  await requireAdmin()
  const { data, error } = await getServiceClient()
    .from('agent_settings')
    .select('key, value, description')
    .order('key')
  if (error) {
    console.warn('[panel] agent_settings no disponible:', error.message)
    return { rows: [], tableReady: false }
  }
  return { rows: (data as AgentSettingRow[]) ?? [], tableReady: true }
}

export async function saveAgentSettings(updates: Record<string, string>): Promise<ActionResult> {
  try {
    await requireAdmin()
    const service = getServiceClient()
    for (const [key, raw] of Object.entries(updates)) {
      const validator = SETTINGS_WHITELIST[key]
      if (!validator) return { ok: false, error: 'INVALID_KEY' }
      const value = raw.trim()
      if (!validator(value)) return { ok: false, error: 'INVALID_VALUE' }
      const { error } = await service
        .from('agent_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw new Error(error.message)
    }
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Media por proyecto (project_media) — CRUD del panel ───────

const MEDIA_TYPES = ['brochure', 'image', 'video', 'link', 'price_list', 'floor_plan'] as const

export async function getProjectMediaAll(): Promise<import('@/lib/project-media').ProjectMediaItem[]> {
  await requireAdmin()
  const { data, error } = await getServiceClient()
    .from('project_media')
    .select('*')
    .order('project_key')
    .order('media_type')
    .order('sort_order')
  if (error) {
    console.warn('[panel] project_media no disponible:', error.message)
    return []
  }
  return (data as import('@/lib/project-media').ProjectMediaItem[]) ?? []
}

function validateMedia(projectKey: string, mediaType: string, url: string): string | null {
  if (!projectKey.trim()) return 'EMPTY'
  if (!(MEDIA_TYPES as readonly string[]).includes(mediaType)) return 'INVALID_TYPE'
  if (!url.trim().startsWith('https://')) return 'INVALID_URL'
  return null
}

export async function createProjectMediaItem(
  projectKey: string, mediaType: string, url: string, caption: string | null, sortOrder: number,
): Promise<ActionResult> {
  try {
    await requireAdmin()
    const invalid = validateMedia(projectKey, mediaType, url)
    if (invalid) return { ok: false, error: invalid }
    // No especificamos source/project_slug: compatibles pre y post migración 008
    const { error } = await getServiceClient().from('project_media').insert({
      project_key: projectKey.trim().toLowerCase(),
      media_type: mediaType,
      url: url.trim(),
      caption: caption?.trim() || null,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      active: true,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updateProjectMediaItem(
  id: string,
  updates: { project_key?: string; media_type?: string; url?: string; caption?: string | null; sort_order?: number; active?: boolean },
): Promise<ActionResult> {
  try {
    await requireAdmin()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.project_key !== undefined) {
      if (!updates.project_key.trim()) return { ok: false, error: 'EMPTY' }
      patch.project_key = updates.project_key.trim().toLowerCase()
    }
    if (updates.media_type !== undefined) {
      if (!(MEDIA_TYPES as readonly string[]).includes(updates.media_type)) return { ok: false, error: 'INVALID_TYPE' }
      patch.media_type = updates.media_type
    }
    if (updates.url !== undefined) {
      if (!updates.url.trim().startsWith('https://')) return { ok: false, error: 'INVALID_URL' }
      patch.url = updates.url.trim()
    }
    if (updates.caption !== undefined) patch.caption = updates.caption?.trim() || null
    if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order
    if (updates.active !== undefined) patch.active = updates.active
    const { error } = await getServiceClient().from('project_media').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteProjectMediaItem(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const { error } = await getServiceClient().from('project_media').delete().eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Playbook de ventas (knowledge_base) — CRUD del panel ──────

const KB_CATEGORIES = ['sales_playbook', 'objection', 'closing_technique', 'project_pitch', 'faq'] as const

export interface PlaybookRow {
  id: string
  category: string
  topic: string
  title: string
  content: string
  project_slug: string | null
  priority: number
  active: boolean
}

export async function getPlaybookEntries(): Promise<PlaybookRow[]> {
  await requireAdmin()
  const { data, error } = await getServiceClient()
    .from('knowledge_base')
    .select('id, category, topic, title, content, project_slug, priority, active')
    .order('priority', { ascending: false })
    .order('title')
  if (error) {
    console.warn('[panel] knowledge_base no disponible:', error.message)
    return []
  }
  return (data as PlaybookRow[]) ?? []
}

export async function createPlaybookEntry(
  category: string, title: string, content: string, projectSlug: string | null, priority: number,
): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (!(KB_CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: 'INVALID_CATEGORY' }
    if (!title.trim() || !content.trim()) return { ok: false, error: 'EMPTY' }
    const { error } = await getServiceClient().from('knowledge_base').insert({
      category,
      topic: title.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60),
      title: title.trim(),
      content: content.trim(),
      project_slug: projectSlug?.trim() || null,
      priority: Number.isFinite(priority) ? priority : 0,
      active: true,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updatePlaybookEntry(
  id: string,
  updates: { category?: string; title?: string; content?: string; project_slug?: string | null; priority?: number; active?: boolean },
): Promise<ActionResult> {
  try {
    await requireAdmin()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.category !== undefined) {
      if (!(KB_CATEGORIES as readonly string[]).includes(updates.category)) return { ok: false, error: 'INVALID_CATEGORY' }
      patch.category = updates.category
    }
    if (updates.title !== undefined) {
      if (!updates.title.trim()) return { ok: false, error: 'EMPTY' }
      patch.title = updates.title.trim()
    }
    if (updates.content !== undefined) {
      if (!updates.content.trim()) return { ok: false, error: 'EMPTY' }
      patch.content = updates.content.trim()
    }
    if (updates.project_slug !== undefined) patch.project_slug = updates.project_slug?.trim() || null
    if (updates.priority !== undefined) patch.priority = updates.priority
    if (updates.active !== undefined) patch.active = updates.active
    const { error } = await getServiceClient().from('knowledge_base').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deletePlaybookEntry(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const { error } = await getServiceClient().from('knowledge_base').delete().eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── PAUSA GLOBAL de Daniela (agent_settings.agent_enabled) ────

export async function setAgentEnabled(enabled: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    const { error } = await getServiceClient()
      .from('agent_settings')
      .upsert(
        { key: 'agent_enabled', value: enabled ? 'true' : 'false', updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    if (error) throw new Error(error.message)
    await logActivity({
      actorId: admin.id, actorType: 'team',
      action: enabled ? 'agent_resumed' : 'agent_paused',
      entityType: 'agent', details: { by: admin.name },
    })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Objetivos del negocio (agent_objectives) — CRUD ───────────

const OBJECTIVE_SCOPES: ObjectiveScope[] = ['general', 'project', 'investment']

export async function getObjectives(): Promise<AgentObjective[]> {
  await requireAdmin()
  const { data, error } = await getServiceClient()
    .from('agent_objectives')
    .select('*')
    .order('scope')
    .order('priority', { ascending: true })
  if (error) {
    // Tabla aún no migrada — el tab muestra vacío en vez de romper la página
    console.warn('[panel] agent_objectives no disponible:', error.message)
    return []
  }
  return (data as AgentObjective[]) ?? []
}

export async function createObjective(
  scope: ObjectiveScope, targetKey: string | null, objective: string, priority: number,
): Promise<ActionResult> {
  try {
    await requireAdmin()
    if (!OBJECTIVE_SCOPES.includes(scope)) return { ok: false, error: 'INVALID_SCOPE' }
    if (!objective.trim()) return { ok: false, error: 'EMPTY' }
    if (scope !== 'general' && !targetKey?.trim()) return { ok: false, error: 'TARGET_REQUIRED' }
    const { error } = await getServiceClient().from('agent_objectives').insert({
      scope,
      target_key: scope === 'general' ? null : targetKey!.trim(),
      objective: objective.trim(),
      priority: Number.isFinite(priority) ? priority : 100,
      active: true,
    })
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function updateObjective(
  id: string,
  updates: { scope?: ObjectiveScope; target_key?: string | null; objective?: string; priority?: number; active?: boolean },
): Promise<ActionResult> {
  try {
    await requireAdmin()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.scope !== undefined) {
      if (!OBJECTIVE_SCOPES.includes(updates.scope)) return { ok: false, error: 'INVALID_SCOPE' }
      patch.scope = updates.scope
    }
    if (updates.target_key !== undefined) patch.target_key = updates.target_key?.trim() || null
    if (updates.objective !== undefined) {
      if (!updates.objective.trim()) return { ok: false, error: 'EMPTY' }
      patch.objective = updates.objective.trim()
    }
    if (updates.priority !== undefined) patch.priority = updates.priority
    if (updates.active !== undefined) patch.active = updates.active
    const { error } = await getServiceClient().from('agent_objectives').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteObjective(id: string): Promise<ActionResult> {
  try {
    await requireAdmin()
    const { error } = await getServiceClient().from('agent_objectives').delete().eq('id', id)
    if (error) throw new Error(error.message)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Personalidad: bloques del prompt (prompt_blocks) ──────────

export interface PromptBlockPanelRow {
  key: string
  title: string
  description: string
  /** Texto efectivo (override de la tabla, o default del código) */
  content: string
  enabled: boolean
  /** true = existe override en la tabla (≠ default) */
  customized: boolean
  /** El texto default del código, para "Restaurar" y comparación */
  defaultContent: string
}

const PROMPT_BLOCK_MAX_CHARS = 6000

export async function getPromptBlocksPanel(): Promise<{ rows: PromptBlockPanelRow[]; tableReady: boolean }> {
  await requireAdmin()
  let overrides: Record<string, { content: string; enabled: boolean }> = {}
  let tableReady = true
  try {
    const { data, error } = await getServiceClient()
      .from('prompt_blocks')
      .select('key, content, enabled')
    if (error) {
      tableReady = false
    } else {
      for (const row of (data ?? []) as { key: string; content: string; enabled: boolean }[]) {
        overrides[row.key] = { content: row.content, enabled: row.enabled !== false }
      }
    }
  } catch {
    tableReady = false
    overrides = {}
  }

  const rows: PromptBlockPanelRow[] = PROMPT_BLOCK_DEFS.map(def => {
    const o = overrides[def.key]
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      content: o ? o.content : DEFAULT_PROMPT_BLOCKS[def.key],
      enabled: o ? o.enabled : true,
      customized: !!o,
      defaultContent: DEFAULT_PROMPT_BLOCKS[def.key],
    }
  })
  return { rows, tableReady }
}

export async function savePromptBlock(key: string, content: string, enabled: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (!PROMPT_BLOCK_KEYS.includes(key)) return { ok: false, error: 'INVALID_KEY' }
    const trimmed = content.trim()
    if (!trimmed) return { ok: false, error: 'EMPTY' }
    if (trimmed.length > PROMPT_BLOCK_MAX_CHARS) return { ok: false, error: 'TOO_LONG' }
    const { error } = await getServiceClient()
      .from('prompt_blocks')
      .upsert({ key, content: trimmed, enabled, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw new Error(error.message)
    await logActivity({
      actorId: admin.id, actorType: 'team', action: 'prompt_block_updated',
      entityType: 'prompt_block', entityId: key, details: { enabled, chars: trimmed.length },
    })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/** Borra el override → el bloque vuelve al default del código. */
export async function resetPromptBlock(key: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (!PROMPT_BLOCK_KEYS.includes(key)) return { ok: false, error: 'INVALID_KEY' }
    const { error } = await getServiceClient().from('prompt_blocks').delete().eq('key', key)
    if (error) throw new Error(error.message)
    await logActivity({
      actorId: admin.id, actorType: 'team', action: 'prompt_block_reset',
      entityType: 'prompt_block', entityId: key,
    })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Entrenamiento manual: pegar conversaciones reales ─────────

export async function analyzeTraining(text: string): Promise<
  { ok: true; analysis: TrainingAnalysis } | { ok: false; error: string }
> {
  try {
    await requireAdmin()
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'EMPTY' }
    if (trimmed.length > 60_000) return { ok: false, error: 'TOO_LONG' }
    const result = await analyzeTrainingText(trimmed)
    if ('error' in result) return { ok: false, error: result.error }
    return { ok: true, analysis: result }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'ANALYZE_FAILED'
    if (msg === 'UNAUTHORIZED' || msg === 'FORBIDDEN') return { ok: false, error: msg }
    console.error('[panel action] analyzeTraining:', msg)
    return { ok: false, error: 'ANALYZE_FAILED' }
  }
}

export async function saveTrainingLearnings(
  entries: { category: string; topic: string; content: string; confidence: number }[],
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (entries.length === 0) return { ok: false, error: 'EMPTY' }
    if (entries.length > 60) return { ok: false, error: 'TOO_MANY' }
    const rows = []
    for (const e of entries) {
      if (!VALID_CATEGORIES.includes(e.category as typeof VALID_CATEGORIES[number])) return { ok: false, error: 'INVALID_CATEGORY' }
      if (!e.topic.trim() || !e.content.trim()) return { ok: false, error: 'EMPTY' }
      rows.push({
        category: e.category,
        topic: e.topic.trim().slice(0, 80),
        content: e.content.trim().slice(0, 450),
        source: 'team' as const,
        lead_id: null,
        confidence: Math.min(1, Math.max(0, e.confidence)),
        active: true,
      })
    }
    const { error } = await getServiceClient().from('agent_brain').insert(rows)
    if (error) throw new Error(error.message)
    await logActivity({
      actorId: admin.id, actorType: 'team', action: 'training_imported',
      entityType: 'agent_brain', details: { entries: rows.length },
    })
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

// ── Ejecutar trabajos de cron bajo demanda (esquiva los límites
//    de horario de Vercel: Hobby corre crons 1 vez al día) ──────

export type ManualJob = 'reflection' | 'radar' | 'recontact' | 'metrics' | 'media_sync'

export async function runCronJobNow(job: ManualJob): Promise<
  { ok: true; result: unknown } | { ok: false; error: string }
> {
  try {
    const admin = await requireAdmin()
    const startedAt = new Date()
    let result: unknown

    switch (job) {
      case 'reflection':
        result = await runNightlyReflection()
        break
      case 'radar': {
        const settings = await getAgentSettings()
        if (!settings.agent_enabled) return { ok: false, error: 'AGENT_PAUSED' }
        result = await runDailyRadar()
        break
      }
      case 'recontact': {
        const settings = await getAgentSettings()
        if (!settings.agent_enabled) return { ok: false, error: 'AGENT_PAUSED' }
        result = await runRecontactRules()
        break
      }
      case 'metrics': {
        const yesterday = new Date()
        yesterday.setUTCDate(yesterday.getUTCDate() - 1)
        await aggregateDailyMetrics(yesterday)
        result = { aggregated: true }
        break
      }
      case 'media_sync':
        result = await syncProjectMediaFromEcosystem()
        break
      default:
        return { ok: false, error: 'INVALID_JOB' }
    }

    await recordCronRun(`manual:${job}`, startedAt, 'ok', result)
    await logActivity({
      actorId: admin.id, actorType: 'team', action: 'manual_job_run',
      entityType: 'cron', entityId: job, details: { result },
    })
    refresh()
    return { ok: true, result }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'JOB_FAILED'
    if (msg === 'UNAUTHORIZED' || msg === 'FORBIDDEN') return { ok: false, error: msg }
    console.error('[panel action] runCronJobNow:', msg)
    return { ok: false, error: 'JOB_FAILED' }
  }
}

// ── Supervisión: estado global, corridas de crons y actividad ──

export interface SupervisionData {
  agentEnabled: boolean
  settingsTableReady: boolean
  cronRuns: CronRun[]
  activity: ActivityLogEntry[]
  /** Aprendizajes de Daniela pendientes de revisión (confianza < umbral) */
  pendingLearnings: number
}

export async function getSupervisionData(): Promise<SupervisionData> {
  await requireAdmin()
  const service = getServiceClient()

  // agent_enabled FRESCO (sin el cache de 60s) — el toggle debe reflejarse al instante
  let agentEnabled = true
  let settingsTableReady = true
  try {
    const { data, error } = await service
      .from('agent_settings')
      .select('value')
      .eq('key', 'agent_enabled')
      .maybeSingle()
    if (error) settingsTableReady = false
    else if (data) agentEnabled = data.value.trim() !== 'false'
  } catch {
    settingsTableReady = false
  }

  const [cronRuns, activity, pending] = await Promise.all([
    getRecentCronRuns(30),
    getRecentActivity(50).catch(() => [] as ActivityLogEntry[]),
    (async () => {
      try {
        const { count } = await service
          .from('agent_brain')
          .select('id', { count: 'exact', head: true })
          .eq('source', 'agent')
          .eq('active', true)
          .lt('confidence', 0.7)
        return count ?? 0
      } catch {
        return 0
      }
    })(),
  ])

  return { agentEnabled, settingsTableReady, cronRuns, activity, pendingLearnings: pending }
}

