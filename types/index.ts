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
}

export interface ClaudeResponse {
  reply: string
  stage: LeadStage
  name_captured: string | null
  qualification_data: QualificationData
  qualified: boolean
}
