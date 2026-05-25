import { waitUntil } from '@vercel/functions'
import { parseWebhook, verifySignature } from '@/services/whatsapp/webhook'
import { callClaude, parseClaudeResponse } from '@/services/claude/client'
import { buildSystemPrompt } from '@/services/claude/prompts'
import { getAllProjects, detectProjectFromMessage } from '@/services/projects/gt-api'
import { sendText } from '@/services/whatsapp/client'
import {
  upsertLead,
  updateLead,
  saveConversation,
  getConversationHistory,
  isMessageProcessed,
} from '@/lib/supabase'

// Configure max execution time — requires Vercel Pro plan for 60s
// On Hobby plan, default is 10s (sufficient for most responses)
export const maxDuration = 60

// GET: WhatsApp webhook verification handshake
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WA_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// POST: Incoming WhatsApp messages
export async function POST(request: Request): Promise<Response> {
  const body = await request.text()
  const signature = request.headers.get('x-hub-signature-256') ?? ''

  if (!verifySignature(body, signature, process.env.WA_APP_SECRET!)) {
    console.warn('[webhook] Invalid signature — rejected')
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = JSON.parse(body) as unknown
  waitUntil(processMessage(payload))

  return new Response('OK', { status: 200 })
}

async function processMessage(payload: unknown): Promise<void> {
  try {
    // 1. Parse the incoming webhook
    const parsed = parseWebhook(payload)
    if (!parsed) return
    if (parsed.messageType !== 'text' || !parsed.body.trim()) return

    // 2. Deduplicate: ignore already-processed messages
    if (await isMessageProcessed(parsed.messageId)) {
      console.log(`[processMessage] Duplicate message ${parsed.messageId}, skipping`)
      return
    }

    // 3. Upsert lead — create if new, update last_message_at if existing
    const lead = await upsertLead(parsed.from)
    if (!lead.bot_active) {
      console.log(`[processMessage] Bot paused for lead ${lead.id}`)
      return
    }

    // 4. Save the incoming user message
    await saveConversation({
      leadId: lead.id,
      role: 'user',
      content: parsed.body,
      waMessageId: parsed.messageId,
    })

    // 5. Load conversation history (last 15 messages for Claude context)
    const history = await getConversationHistory(lead.id, 15)

    // 6. Detect which GT project the lead is asking about
    let projects: Awaited<ReturnType<typeof getAllProjects>> = []
    try {
      projects = await getAllProjects()
    } catch (err) {
      console.warn('[processMessage] Could not fetch GT projects, continuing without context:', err)
    }
    const project = detectProjectFromMessage(parsed.body, projects)

    // 7. Update project interest on the lead if detected for the first time
    if (project && !lead.project_interest) {
      await updateLead(lead.id, { project_interest: project.name })
    }

    // 8. Build the Daniela system prompt and call Claude
    const systemPrompt = buildSystemPrompt({ lead, project })
    const rawResponse = await callClaude(systemPrompt, history)
    const claudeResponse = parseClaudeResponse(rawResponse)

    // 9. Update lead with Claude's analysis
    await updateLead(lead.id, {
      stage: claudeResponse.stage,
      ...(claudeResponse.name_captured ? { name: claudeResponse.name_captured } : {}),
      qualification_data: claudeResponse.qualification_data,
      last_message_at: new Date().toISOString(),
    })

    // 10. Save the bot's response
    await saveConversation({
      leadId: lead.id,
      role: 'assistant',
      content: claudeResponse.reply,
    })

    // 11. Send the reply to WhatsApp (with human-like typing delay)
    await sendText(parsed.from, claudeResponse.reply)

    console.log(`[processMessage] Done — lead ${lead.id} | stage: ${claudeResponse.stage} | qualified: ${claudeResponse.qualified}`)
  } catch (error) {
    // Log but don't rethrow — we already sent 200 OK to WhatsApp
    console.error('[processMessage] Unhandled error:', error)
  }
}
