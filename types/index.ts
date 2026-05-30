export type LeadStage = 'new' | 'warm' | 'hot' | 'cold'
export type ConversationRole = 'user' | 'assistant'
export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'video' | 'unknown'

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
  created_at: string
}

export interface ParsedWebhook {
  messageId: string
  from: string
  body: string
  messageType: MessageType
  timestamp: number
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

export interface ClaudeResponse {
  reply: string
  stage: LeadStage
  name_captured: string | null
  qualification_data: QualificationData
  qualified: boolean
  schedule_meeting: MeetingRequest | null
}
