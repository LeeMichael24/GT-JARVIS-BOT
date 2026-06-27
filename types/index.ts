export type LeadStage = 'new' | 'warm' | 'hot' | 'cold'
export type ConversationRole = 'user' | 'assistant' | 'human'
export type TeamRole = 'admin' | 'asesor'
export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'video' | 'interactive' | 'unknown'

export interface QualificationData {
  purpose: 'vivienda_propia' | 'inversion' | 'ambos' | null
  budget_ok: boolean | null
  timeline: 'inmediato' | '3_meses' | '6_meses' | 'explorando' | null
  financing_needed: boolean | null
  decision_maker: boolean | null
}

export interface Lead {
  id: string
  phone: string
  name: string | null
  stage: LeadStage
  bot_active: boolean
  project_interest: string | null
  qualification_data: QualificationData | null
  assigned_to: string | null
  opted_out: boolean
  last_proactive_at: string | null
  first_message_at: string
  last_message_at: string
  created_at: string
}

export interface Conversation {
  id: string
  lead_id: string
  role: ConversationRole
  content: string
  wa_message_id: string | null
  sent_by: string | null
  created_at: string
}

export interface ParsedWebhook {
  messageId: string
  from: string
  body: string
  messageType: MessageType
  timestamp: number
  mediaId: string | null
}

export interface GTSubInvestment {
  name: string
  modality?: string           // full modality name
  description?: string
  investorProfile?: string    // e.g. "Conservador", "Moderado", "Agresivo"
  minInvestment?: number
  maxInvestment?: number
  expectedROI?: number        // annual %, e.g. 10 = 10%/year
  investmentPeriodMonths?: number  // e.g. 24
  paymentType?: string        // e.g. "Trimestral", "Mensual", "Al vencimiento"
  riskLevel?: string          // e.g. "Conservador", "Moderado", "Alto"
  startDate?: string
  endDate?: string
}

export interface GTProjectModel {
  name: string
  dimensions?: string
  spaces?: string
  price?: number
  availability?: string
  amenities?: string[]
}

export interface GTProject {
  slug: string
  name: string
  type: string
  priceFrom?: number
  priceTo?: number
  currency?: string
  location: string
  deliveryDate?: string
  description: string
  status: string
  entityType?: 'project' | 'residency' | 'investment'
  // Enriched fields from backend
  developer?: string
  constructionStatus?: string
  address?: string
  area?: number
  transactionType?: string
  bedrooms?: number
  bathrooms?: number
  parkings?: number
  amenities?: string[]
  models?: GTProjectModel[]
  // Investment-specific fields
  expectedROI?: number
  investmentPeriodMonths?: number
  riskLevel?: string
  subInvestments?: GTSubInvestment[]
}

export interface MeetingRequest {
  requested: boolean
  datetime_iso: string | null      // ISO 8601 in America/El_Salvador (UTC-6); null if date not yet confirmed
  meeting_type: 'visita_proyecto' | 'llamada' | 'videollamada'
  project_name: string | null
  notes: string | null
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: TeamRole
  wa_phone: string | null
  active: boolean
  created_at: string
}

export interface Tag {
  id: string
  name: string
  color: string
  created_at: string
}

export interface LeadNote {
  id: string
  lead_id: string
  author: string
  content: string
  created_at: string
}

export interface ClaudeResponse {
  reply: string
  stage: LeadStage
  name_captured: string | null
  qualification_data: QualificationData
  qualified: boolean
  schedule_meeting: MeetingRequest | null
  opt_out: boolean
  agent_action: AgentAction | null
  deal_summary: DealSummary | null
  brain_observations: BrainObservation[]
  interactive_buttons: InteractiveButton[]
}

// ── SDR Agent types ──────────────────────────────────────────

export type AgentActionType = 'sell' | 'consult_team' | 'escalate_ceo' | 'schedule' | 'follow_up_needed'
export type ClientType = 'individual' | 'corporate'
export type Urgency = 'normal' | 'high' | 'critical'

export interface AgentAction {
  type: AgentActionType
  reason: string | null
  urgency: Urgency
  client_type: ClientType
  follow_up_hint: string | null
}

export interface DealSignals {
  buying_signals?: string[]
  objections?: string[]
  client_profile?: ClientType
  budget_mentioned?: number | null
  preferred_zone?: string | null
  family_mentioned?: boolean
  engagement_level?: 'low' | 'medium' | 'high'
  messages_per_burst?: number
  avg_gap_between_burst_msgs_ms?: number
  typing_pattern?: 'single_message' | 'multi_message' | 'voice_note'
}

export interface DealSummary {
  summary: string
  signals: DealSignals
  next_action: string | null
}

export interface DealSummaryRow {
  id: string
  lead_id: string
  summary: string
  signals: DealSignals
  next_action: string | null
  updated_at: string
}

export type SequenceType = 'post_conversation' | 'nurture' | 'hot_close' | 'cold_reactivation'
export type SequenceStatus = 'active' | 'paused' | 'completed' | 'cancelled'

export interface Sequence {
  id: string
  lead_id: string
  sequence_type: SequenceType
  current_step: number
  status: SequenceStatus
  context: Record<string, unknown>
  next_fire_at: string | null
  last_fired_at: string | null
  created_at: string
}

export interface BrainObservation {
  category: 'observation' | 'pattern' | 'correction' | 'metric'
  topic: string
  content: string
}

export interface BrainEntry {
  id: string
  category: string
  topic: string
  content: string
  source: 'agent' | 'team'
  lead_id: string | null
  confidence: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface InteractiveButton {
  id: string
  title: string
}

export type TemplateCategory = 'MARKETING' | 'UTILITY'
export type CampaignKind = 'recontact' | 'opportunity'
export type CampaignStatus = 'pending_approval' | 'sending' | 'done' | 'rejected'
export type RecipientStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'

export interface MessageTemplate {
  id: string
  name: string
  language: string
  category: TemplateCategory
  body_preview: string
  variables: number
  active: boolean
  created_at: string
}

export interface RecontactRule {
  id: string
  name: string
  active: boolean
  stages: LeadStage[] | null
  tag_ids: string[] | null
  days_inactive: number
  template_id: string
  max_per_run: number
  created_at: string
}

export interface Campaign {
  id: string
  kind: CampaignKind
  status: CampaignStatus
  title: string
  reason: string | null
  rule_id: string | null
  listing_slug: string | null
  template_id: string
  approved_by: string | null
  created_at: string
  approved_at: string | null
}

export interface CampaignRecipient {
  id: string
  campaign_id: string
  lead_id: string
  included: boolean
  variables: string[]
  match_reason: string | null
  status: RecipientStatus
  wa_message_id: string | null
  error: string | null
  sent_at: string | null
}
