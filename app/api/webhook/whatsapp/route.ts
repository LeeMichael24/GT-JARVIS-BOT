import { waitUntil } from '@vercel/functions'
import { parseWebhook, verifySignature } from '@/services/whatsapp/webhook'
import { callClaude, parseClaudeResponse } from '@/services/claude/client'
import { buildSystemPrompt } from '@/services/claude/prompts'
import { classifyIntent, extractLastBotMessage } from '@/services/claude/intent'
import { getAllProjects, detectProjectFromMessage } from '@/services/projects/gt-api'
import { createCalendarEvent } from '@/services/google/calendar'
import { getPlaybook, formatPlaybookForPrompt } from '@/lib/knowledge-base'
import { downloadMedia, sendText, sendInteractiveButtons, sendInternalNotification } from '@/services/whatsapp/client'
import { transcribeAudio } from '@/services/openai/whisper'
import {
  upsertLead,
  updateLead,
  saveConversation,
  getConversationHistory,
  isMessageProcessed,
  getUnprocessedUserMessages,
  getLeadById,
  getDealSummary,
  upsertDealSummary,
} from '@/lib/supabase'
import { calculateAdaptiveDebounce, computeBurstPattern } from '@/lib/debounce'
import { createSequence, pauseLeadSequences } from '@/lib/sequences'
import { saveBrainObservations, getHighConfidenceLearnings, formatLearningsForPrompt } from '@/lib/agent-brain'

// Configure max execution time — requires Vercel Pro plan for 60s
// On Hobby plan, default is 10s (sufficient for most responses)
export const maxDuration = 60

// Adaptive debounce: waits for the user to finish typing.
// Duration is learned from each lead's typing pattern via calculateAdaptiveDebounce.
// Overridable per-lead via WA_DEBOUNCE_MS env var (tests use 0).

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

    // 1a. Resolve message body — transcribe audio, describe image, or skip unsupported types
    let messageBody = parsed.body
    if (parsed.messageType === 'audio' && parsed.mediaId) {
      try {
        const { buffer, mimeType } = await downloadMedia(parsed.mediaId)
        messageBody = await transcribeAudio(buffer, mimeType)
        console.log(`[processMessage] Transcribed audio: "${messageBody.slice(0, 100)}..."`)
      } catch (err) {
        console.error('[processMessage] Audio transcription failed:', err instanceof Error ? err.message : err)
        messageBody = '[Nota de voz — no se pudo transcribir]'
      }
    } else if (parsed.messageType === 'image' && parsed.mediaId) {
      messageBody = '[El cliente envió una imagen]'
    } else if (parsed.messageType === 'interactive') {
      // Button reply — body was already extracted by parseWebhook; skip if somehow empty
      if (!parsed.body.trim()) return
    } else if (parsed.messageType !== 'text' || !parsed.body.trim()) {
      return
    }

    // 2. Deduplicate: ignore already-processed messages
    if (await isMessageProcessed(parsed.messageId)) {
      console.log(`[processMessage] Duplicate message ${parsed.messageId}, skipping`)
      return
    }

    // 3. Upsert lead — create if new, update last_message_at if existing
    const lead = await upsertLead(parsed.from)

    // 4. Save the incoming user message ALWAYS and immediately: it must survive
    //    a human takeover, and other workers in the same burst need to see it
    //    during the debounce window.
    await saveConversation({
      leadId: lead.id,
      role: 'user',
      content: messageBody,
      waMessageId: parsed.messageId,
    })

    // 4a. Client responded — pause any active follow-up sequences
    try {
      const paused = await pauseLeadSequences(lead.id)
      if (paused > 0) console.log(`[processMessage] Paused ${paused} active sequence(s) for lead ${lead.id}`)
    } catch (err) {
      console.warn('[processMessage] Failed to pause sequences:', err instanceof Error ? err.message : err)
    }

    // 4b. If a human took over, stop here: the message is stored, Daniela stays quiet
    if (!lead.bot_active) {
      console.log(`[processMessage] Bot paused for lead ${lead.id} — message saved, no AI reply`)
      return
    }

    // ── ADAPTIVE DEBOUNCE ──────────────────────────────────────────
    // Use learned typing pattern for this lead, fall back to env/default.
    // Fetch existing deal signals BEFORE sleeping so we can learn from them.
    const existingDealForDebounce = await getDealSummary(lead.id).catch(() => null)
    const adaptiveMs = calculateAdaptiveDebounce(existingDealForDebounce?.signals)
    const debounceMs = Number(process.env.WA_DEBOUNCE_MS ?? adaptiveMs)
    await new Promise<void>(resolve => setTimeout(resolve, debounceMs))

    const pending = await getUnprocessedUserMessages(lead.id)
    const latestPending = pending.at(-1)

    if (!latestPending || latestPending.wa_message_id !== parsed.messageId) {
      console.log(`[processMessage] Not the latest in burst — exiting (${parsed.messageId})`)
      return
    }

    // 4c. Re-check takeover AFTER the debounce: a human may have taken the chat
    //     while we slept (their send pauses the bot before sending)
    const freshLead = await getLeadById(lead.id)
    if (freshLead && !freshLead.bot_active) {
      console.log(`[processMessage] Bot paused during debounce for lead ${lead.id} — no AI reply`)
      return
    }

    // Combine all pending messages into a single body for intent/project detection
    const combinedBody = pending.map(m => m.content).join('\n')
    console.log(`[processMessage] Processing burst of ${pending.length} message(s) for lead ${lead.id}`)

    // Record burst pattern for adaptive debounce learning
    const burstTimestamps = pending.map(m => new Date(m.created_at).getTime())
    const burstPatternUpdate = computeBurstPattern(burstTimestamps, existingDealForDebounce?.signals)
    // ── END DEBOUNCE ─────────────────────────────────────────────────────────

    // 5. Load conversation history — last 15 messages, most recent (descending then reversed)
    const history = await getConversationHistory(lead.id, 15)

    // 6. Classify intent early so we can optimize the API call
    const intent = classifyIntent(combinedBody, history)
    const lastBotMessage = extractLastBotMessage(history)
    const gtUrlSection = detectGTUrlSection(combinedBody)

    // 7. Fetch GT project catalog + sales playbook in parallel; deal memory already fetched pre-debounce
    let projects: Awaited<ReturnType<typeof getAllProjects>> = []
    let salesPlaybook: string | null = null
    let brainLearnings: string = ''
    const existingDeal = existingDealForDebounce
    try {
      const [projectsResult, playbookEntries, brainEntries] = await Promise.all([
        getAllProjects(),
        getPlaybook(),
        getHighConfidenceLearnings(),
      ])
      projects = projectsResult
      salesPlaybook = formatPlaybookForPrompt(playbookEntries)
      brainLearnings = formatLearningsForPrompt(brainEntries)
    } catch (err) {
      console.warn('[processMessage] Could not fetch GT projects/playbook:', err)
    }

    console.log(`[processMessage] Intent: ${intent} | GT URL: ${gtUrlSection ?? 'none'} | History: ${history.length} msgs`)

    // 8. Detect which project the lead is asking about in this burst of messages
    const detectedProject = detectProjectFromMessage(combinedBody, projects)

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
    const systemPrompt = buildSystemPrompt({
      lead, project, projects, intent, lastBotMessage, gtUrlSection, salesPlaybook,
      dealSummary: existingDeal ? { summary: existingDeal.summary, next_action: existingDeal.next_action } : null,
      brainLearnings: brainLearnings || null,
    })
    const rawResponse = await callClaude(systemPrompt, history)
    const claudeResponse = parseClaudeResponse(rawResponse)

    // 9b. Save deal summary for future conversations, merging in the burst pattern update
    if (claudeResponse.deal_summary) {
      try {
        const mergedSignals: typeof claudeResponse.deal_summary.signals = {
          ...claudeResponse.deal_summary.signals,
          ...burstPatternUpdate,
        }
        await upsertDealSummary(lead.id, { ...claudeResponse.deal_summary, signals: mergedSignals })
      } catch (err) {
        console.warn('[processMessage] Failed to save deal summary:', err instanceof Error ? err.message : err)
      }
    }

    // 9c. Save brain observations
    if (claudeResponse.brain_observations.length > 0) {
      try {
        await saveBrainObservations(lead.id, claudeResponse.brain_observations)
      } catch (err) {
        console.warn('[processMessage] Failed to save brain observations:', err instanceof Error ? err.message : err)
      }
    }

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

    // 10b. Route agent actions — notify CEO for consultations and escalations
    const action = claudeResponse.agent_action
    if (action && (action.type === 'consult_team' || action.type === 'escalate_ceo')) {
      try {
        await sendInternalNotification({
          leadName: lead.name ?? claudeResponse.name_captured ?? 'Cliente',
          leadPhone: lead.phone,
          action,
          botReply: claudeResponse.reply,
          dealSummary: claudeResponse.deal_summary?.summary ?? null,
        })
        console.log(`[processMessage] CEO notified: ${action.type} for lead ${lead.id}`)
      } catch (err) {
        console.error('[processMessage] Failed to notify CEO:', err instanceof Error ? err.message : err)
      }
    }

    // 10c. Create follow-up sequence if agent decided one is needed
    if (action?.type === 'follow_up_needed') {
      try {
        const seqType = claudeResponse.stage === 'hot' ? 'hot_close' as const
          : claudeResponse.stage === 'cold' ? 'cold_reactivation' as const
          : 'post_conversation' as const
        await createSequence(lead.id, seqType, {
          summary: claudeResponse.deal_summary?.summary ?? claudeResponse.reply.slice(0, 200),
          hint: action.follow_up_hint,
          project: project?.name ?? lead.project_interest,
        })
        console.log(`[processMessage] Created ${seqType} sequence for lead ${lead.id}`)
      } catch (err) {
        console.warn('[processMessage] Failed to create sequence:', err instanceof Error ? err.message : err)
      }
    }

    // 11. Update lead with GPT-4o's analysis
    await updateLead(lead.id, {
      stage: claudeResponse.stage,
      ...(claudeResponse.name_captured ? { name: claudeResponse.name_captured } : {}),
      qualification_data: claudeResponse.qualification_data,
      last_message_at: new Date().toISOString(),
    })

    // Marcamos opt-out ANTES de enviar: si el envío de la despedida falla,
    // preferimos respetar el opt-out aunque no llegue el adiós (no al revés)
    // 11b. Opt-out: el cliente pidió no ser contactado — fuera de campañas para siempre
    if (claudeResponse.opt_out) {
      await updateLead(lead.id, { opted_out: true })
      console.log(`[processMessage] Lead ${lead.id} opted out de mensajes proactivos`)
    }

    // 12. Send the reply — use interactive buttons if GPT-4o provided them
    const buttons = claudeResponse.interactive_buttons
    const waMessageId = buttons.length > 0
      ? await sendInteractiveButtons(parsed.from, claudeResponse.reply, buttons)
      : await sendText(parsed.from, claudeResponse.reply)

    // 13. Save the bot's response
    try {
      await saveConversation({
        leadId: lead.id,
        role: 'assistant',
        content: claudeResponse.reply,
        waMessageId: waMessageId ?? undefined,
      })
    } catch (err) {
      console.error(
        `[processMessage] Reply DELIVERED (wa_message_id=${waMessageId ?? 'none'}) but saveConversation failed — history will miss this reply:`,
        err instanceof Error ? err.message : err
      )
    }

    console.log(`[processMessage] Done — lead ${lead.id} | stage: ${claudeResponse.stage} | qualified: ${claudeResponse.qualified}`)
  } catch (error) {
    // Log but don't rethrow — we already sent 200 OK to WhatsApp
    console.error('[processMessage] Unhandled error:', error instanceof Error ? error.message : error)
    if (error instanceof Error) console.error('[processMessage] Stack:', error.stack)
  }
}
