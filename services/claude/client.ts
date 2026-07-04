import OpenAI from 'openai'
import type {
  ClaudeResponse, Conversation, MeetingRequest, QualificationData,
  AgentAction, AgentActionType, DealSummary, DealSignals,
  BrainObservation, InteractiveButton, SendMedia,
} from '@/types'

const MODEL = 'gpt-4o'
const MAX_TOKENS = 2048

export async function callClaude(
  systemPrompt: string,
  history: Conversation[]
): Promise<string> {
  // timeout 30s: sin esto una llamada colgada consume los 60s de maxDuration
  // y el cliente queda sin respuesta. 1 retry automático del SDK.
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 })
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({
      // 'human' = mensaje del equipo enviado desde el panel; para el modelo es
      // indistinguible de Daniela (mismo número), así que va como assistant
      role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: msg.content,
    })),
  ]

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.85,
    messages,
    response_format: { type: 'json_object' },
  })

  const choice = response.choices[0]
  // 'length' = JSON truncado; cualquier cosa distinta de 'stop' es sospechosa
  if (choice?.finish_reason && choice.finish_reason !== 'stop') {
    console.warn(`[claude] finish_reason inesperado: ${choice.finish_reason}`)
  }
  const content = choice?.message?.content
  if (!content) throw new Error('OpenAI returned empty response')
  return content
}

export function parseClaudeResponse(raw: string): ClaudeResponse {
  const cleaned = raw
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim()

  const parsed = JSON.parse(cleaned) as Partial<ClaudeResponse>

  if (!parsed.reply || typeof parsed.reply !== 'string') {
    throw new Error('Invalid Claude response: missing or invalid reply field')
  }

  const emptyQual: QualificationData = {
    purpose: null,
    budget_ok: null,
    timeline: null,
    financing_needed: null,
    decision_maker: null,
  }

  return {
    reply: parsed.reply,
    stage: parsed.stage ?? 'new',
    name_captured: parsed.name_captured ?? null,
    qualification_data: parsed.qualification_data ?? emptyQual,
    qualified: parsed.qualified ?? false,
    schedule_meeting: parseMeetingRequest(parsed.schedule_meeting),
    opt_out: parsed.opt_out ?? false,
    agent_action: parseAgentAction((parsed as Record<string, unknown>).agent_action),
    deal_summary: parseDealSummary((parsed as Record<string, unknown>).deal_summary),
    brain_observations: parseBrainObservations((parsed as Record<string, unknown>).brain_observations),
    interactive_buttons: parseInteractiveButtons((parsed as Record<string, unknown>).interactive_buttons),
    send_media: parseSendMedia((parsed as Record<string, unknown>).send_media),
  }
}

function parseAgentAction(raw: unknown): AgentAction | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const validTypes: AgentActionType[] = ['sell', 'consult_team', 'escalate_ceo', 'schedule', 'follow_up_needed']
  const type = validTypes.includes(a.type as AgentActionType) ? (a.type as AgentActionType) : 'sell'
  const validUrgency = ['normal', 'high', 'critical'] as const
  const urgency = validUrgency.includes(a.urgency as typeof validUrgency[number])
    ? (a.urgency as AgentAction['urgency']) : 'normal'
  const validClient = ['individual', 'corporate'] as const
  const clientType = validClient.includes(a.client_type as typeof validClient[number])
    ? (a.client_type as AgentAction['client_type']) : 'individual'
  return {
    type,
    reason: typeof a.reason === 'string' ? a.reason : null,
    urgency,
    client_type: clientType,
    follow_up_hint: typeof a.follow_up_hint === 'string' ? a.follow_up_hint : null,
  }
}

function parseDealSummary(raw: unknown): DealSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (typeof d.summary !== 'string') return null
  return {
    summary: d.summary,
    signals: (typeof d.signals === 'object' && d.signals !== null ? d.signals : {}) as DealSignals,
    next_action: typeof d.next_action === 'string' ? d.next_action : null,
  }
}

function parseBrainObservations(raw: unknown): BrainObservation[] {
  if (!Array.isArray(raw)) return []
  const validCategories = ['observation', 'pattern', 'correction', 'metric']
  return raw
    .filter((o): o is Record<string, unknown> =>
      typeof o === 'object' && o !== null &&
      typeof (o as Record<string, unknown>).content === 'string' &&
      typeof (o as Record<string, unknown>).topic === 'string')
    .map(o => ({
      category: validCategories.includes(o.category as string)
        ? (o.category as BrainObservation['category']) : 'observation',
      topic: o.topic as string,
      content: o.content as string,
    }))
}

function parseInteractiveButtons(raw: unknown): InteractiveButton[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((b): b is Record<string, unknown> =>
      typeof b === 'object' && b !== null &&
      typeof (b as Record<string, unknown>).title === 'string')
    .slice(0, 3) // WhatsApp max 3 buttons
    .map((b, i) => ({
      id: typeof b.id === 'string' ? b.id : `btn_${i + 1}`,
      title: (b.title as string).slice(0, 20), // WhatsApp max 20 chars per button
    }))
}

function parseSendMedia(raw: unknown): SendMedia | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const validTypes = ['document', 'image'] as const
  if (!validTypes.includes(m.type as typeof validTypes[number])) return null
  if (typeof m.project !== 'string' || typeof m.description !== 'string') return null
  return {
    type: m.type as SendMedia['type'],
    project: m.project,
    description: m.description,
  }
}

function parseMeetingRequest(raw: unknown): MeetingRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (!m.requested) return null

  const validTypes = ['visita_proyecto', 'llamada', 'videollamada'] as const
  const meetingType = validTypes.includes(m.meeting_type as typeof validTypes[number])
    ? (m.meeting_type as MeetingRequest['meeting_type'])
    : 'visita_proyecto'

  return {
    requested: true,
    datetime_iso: typeof m.datetime_iso === 'string' ? m.datetime_iso : null,
    meeting_type: meetingType,
    project_name: typeof m.project_name === 'string' ? m.project_name : null,
    notes: typeof m.notes === 'string' ? m.notes : null,
  }
}
