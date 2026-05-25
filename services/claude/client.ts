import Anthropic from '@anthropic-ai/sdk'
import type { ClaudeResponse, Conversation, QualificationData } from '@/types'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1024

export async function callClaude(
  systemPrompt: string,
  history: Conversation[]
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const messages = history.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }))

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Claude returned non-text response')
  return block.text
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
  }
}
