import { waitUntil } from '@vercel/functions'
import { parseWebhook, verifySignature } from '@/services/whatsapp/webhook'
import { callClaude, parseClaudeResponse } from '@/services/claude/client'
import { buildSystemPrompt } from '@/services/claude/prompts'
import { classifyIntent, extractLastBotMessage } from '@/services/claude/intent'
import { getAllProjects, detectProjectFromMessage } from '@/services/projects/gt-api'
import { createCalendarEvent } from '@/services/google/calendar'
import { getPlaybook, formatPlaybookForPrompt } from '@/lib/knowledge-base'
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

// Detects a GT website URL and returns the section ('inversiones' | 'propiedades' | null)
const GT_URL_RE = /grupoterranovasv\.com\/(inversiones|propiedades)\/[a-zA-Z0-9]+/i

function detectGTUrlSection(text: string): 'inversiones' | 'propiedades' | null {
  const m = text.match(GT_URL_RE)
  if (!m) return null
  return m[1].toLowerCase() as 'inversiones' | 'propiedades'
}

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

    // 5. Load conversation history — last 15 messages, most recent (descending then reversed)
    const history = await getConversationHistory(lead.id, 15)

    // 6. Classify intent early so we can optimize the API call
    const intent = classifyIntent(parsed.body, history)
    const lastBotMessage = extractLastBotMessage(history)
    const gtUrlSection = detectGTUrlSection(parsed.body)

    // 7. Fetch GT project catalog + sales playbook in parallel
    let projects: Awaited<ReturnType<typeof getAllProjects>> = []
    let salesPlaybook: string | null = null
    try {
      const [projectsResult, playbookEntries] = await Promise.all([
        getAllProjects(),
        getPlaybook(),
      ])
      projects = projectsResult
      salesPlaybook = formatPlaybookForPrompt(playbookEntries)
    } catch (err) {
      console.warn('[processMessage] Could not fetch GT projects or playbook, continuing without context:', err)
    }

    console.log(`[processMessage] Intent: ${intent} | GT URL: ${gtUrlSection ?? 'none'} | History: ${history.length} msgs`)

    // 8. Detect which project the lead is asking about in this message
    const detectedProject = detectProjectFromMessage(parsed.body, projects)

    // Fallback: if nothing detected in this message but lead has a prior interest, restore it
    let project =
      detectedProject ??
      (lead.project_interest
        ? (projects.find(p => p.name === lead.project_interest) ?? null)
        : null)

    // When client is asking about investments, don't lock onto a non-investment property
    // (e.g. residential "Foresta Townhomes" must not steal focus from investment entities)
    if (intent === 'investment_query' && project?.entityType !== 'investment') {
      project = null
    }

    // Update project interest when a new project is explicitly detected
    // Skip if the detected project is residential but the current topic is investments
    if (detectedProject && detectedProject.name !== lead.project_interest) {
      const skipUpdate = intent === 'investment_query' && detectedProject.entityType !== 'investment'
      if (!skipUpdate) {
        await updateLead(lead.id, { project_interest: detectedProject.name })
      }
    }

    console.log(`[processMessage] Project: ${project?.name ?? 'none'} | Detected: ${detectedProject?.name ?? 'none'}`)

    // 9. Build the Daniela system prompt with full catalog and call GPT-4o
    const systemPrompt = buildSystemPrompt({ lead, project, projects, intent, lastBotMessage, gtUrlSection, salesPlaybook })
    const rawResponse = await callClaude(systemPrompt, history)
    const claudeResponse = parseClaudeResponse(rawResponse)

    // 10. Create Google Calendar event if Daniela scheduled a meeting
    const mtg = claudeResponse.schedule_meeting
    if (mtg?.requested && mtg.datetime_iso) {
      try {
        const event = await createCalendarEvent({
          leadName:    lead.name ?? claudeResponse.name_captured ?? 'Cliente',
          leadPhone:   lead.phone,
          datetimeIso: mtg.datetime_iso,
          meetingType: mtg.meeting_type,
          projectName: mtg.project_name ?? lead.project_interest ?? null,
          notes:       mtg.notes,
        })
        console.log(`[processMessage] Calendar event created: ${event.htmlLink}`)
      } catch (err) {
        console.error('[processMessage] Failed to create calendar event:', err instanceof Error ? err.message : err)
      }
    }

    // 11. Update lead with GPT-4o's analysis
    await updateLead(lead.id, {
      stage: claudeResponse.stage,
      ...(claudeResponse.name_captured ? { name: claudeResponse.name_captured } : {}),
      qualification_data: claudeResponse.qualification_data,
      last_message_at: new Date().toISOString(),
    })

    // 12. Save the bot's response
    await saveConversation({
      leadId: lead.id,
      role: 'assistant',
      content: claudeResponse.reply,
    })

    // 13. Send the reply to WhatsApp
    await sendText(parsed.from, claudeResponse.reply)

    console.log(`[processMessage] Done — lead ${lead.id} | stage: ${claudeResponse.stage} | qualified: ${claudeResponse.qualified}`)
  } catch (error) {
    // Log but don't rethrow — we already sent 200 OK to WhatsApp
    console.error('[processMessage] Unhandled error:', error instanceof Error ? error.message : error)
    if (error instanceof Error) console.error('[processMessage] Stack:', error.stack)
  }
}
