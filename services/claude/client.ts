import OpenAI from 'openai'
import type { ClaudeResponse, Conversation, MeetingRequest, QualificationData } from '@/types'

const MODEL = 'gpt-4o'
const MAX_TOKENS = 1024

export async function callClaude(
  systemPrompt: string,
  history: Conversation[]
): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
  ]

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
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
