import type { Lead, LeadStage, RecontactRule } from '@/types'

export const MIN_PROACTIVE_GAP_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

// Un lead puede recibir proactivos si: no pidió silencio, no lo atiende un
// humano, y no recibió otro proactivo hace menos del gap mínimo.
export function isLeadEligible(
  lead: Pick<Lead, 'opted_out' | 'bot_active' | 'last_proactive_at'>,
  nowMs = Date.now()
): boolean {
  if (lead.opted_out) return false
  if (!lead.bot_active) return false
  if (lead.last_proactive_at) {
    const last = Date.parse(lead.last_proactive_at)
    if (!Number.isNaN(last) && nowMs - last < MIN_PROACTIVE_GAP_DAYS * DAY_MS) return false
  }
  return true
}

export function matchesRule(
  lead: Pick<Lead, 'stage'>,
  leadTagIds: string[],
  rule: Pick<RecontactRule, 'stages' | 'tag_ids' | 'days_inactive'>,
  lastUserMessageAt: string | null,
  nowMs = Date.now()
): boolean {
  if (rule.stages && rule.stages.length > 0 && !rule.stages.includes(lead.stage)) return false
  if (rule.tag_ids && rule.tag_ids.length > 0 && !rule.tag_ids.some(t => leadTagIds.includes(t))) return false
  // días sin conversación = días desde el último mensaje DEL CLIENTE
  // (last_message_at no sirve: lo actualizan también las respuestas del bot)
  if (!lastUserMessageAt) return false
  const lastMsg = Date.parse(lastUserMessageAt)
  if (Number.isNaN(lastMsg)) return false
  return nowMs - lastMsg >= rule.days_inactive * DAY_MS
}

const STAGE_PRIORITY: Record<LeadStage, number> = { hot: 0, warm: 1, new: 2, cold: 3 }

export function rankByStage<T extends { stage: LeadStage }>(leads: T[]): T[] {
  return [...leads].sort((a, b) => STAGE_PRIORITY[a.stage] - STAGE_PRIORITY[b.stage])
}
