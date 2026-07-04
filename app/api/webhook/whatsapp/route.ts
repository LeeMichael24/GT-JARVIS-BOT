import { waitUntil } from '@vercel/functions'
import { parseWebhookMessages, verifySignature } from '@/services/whatsapp/webhook'
import type { ParsedWebhook } from '@/types'
import { callClaude, parseClaudeResponse } from '@/services/claude/client'
import { buildSystemPrompt } from '@/services/claude/prompts'
import { classifyIntent, extractLastBotMessage } from '@/services/claude/intent'
import { getAllProjects, detectProjectFromMessage } from '@/services/projects/gt-api'
import { createCalendarEvent } from '@/services/google/calendar'
import { getPlaybook, formatPlaybookForPrompt } from '@/lib/knowledge-base'
import { downloadMedia, sendText, sendInteractiveButtons, sendDocument, sendImage, sendInternalNotification, markAsRead, sendTypingIndicator } from '@/services/whatsapp/client'
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
import { saveLeadSource, getLeadSource, getActiveAdCampaigns, matchAdCampaign, formatSourceContextForPrompt, formatActiveAdsForPrompt } from '@/lib/lead-sources'
import { logActivity } from '@/lib/activity-log'
import { autoTagProject, autoTagSource } from '@/lib/auto-tag'
import { getActiveEscalationRules, matchKeywordRules, formatEscalationRulesForPrompt } from '@/lib/escalation-rules'
import { getProjectMedia } from '@/lib/project-media'

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

  // Meta puede agrupar varios mensajes en un webhook — procesamos todos.
  // Run synchronously in dev to avoid waitUntil issues with Turbopack
  const messages = parseWebhookMessages(payload)
  if (process.env.NODE_ENV === 'development') {
    for (const parsed of messages) await processMessage(parsed)
  } else {
    for (const parsed of messages) waitUntil(processMessage(parsed))
  }

  return new Response('OK', { status: 200 })
}

async function processMessage(parsed: ParsedWebhook): Promise<void> {
  try {
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

    // 2a. Mark as read immediately (blue checkmarks in WhatsApp)
    markAsRead(parsed.messageId)

    // 3. Upsert lead — create if new, update last_message_at if existing
    const lead = await upsertLead(parsed.from)

    // 3a. Track lead source from Meta Ads referral data
    if (parsed.referral) {
      try {
        await saveLeadSource(lead.id, parsed.referral)
        const matchedCampaign = parsed.referral.source_id
          ? await matchAdCampaign(parsed.referral.source_id)
          : null
        await logActivity({
          actorType: 'system',
          action: 'lead_from_ad',
          entityType: 'lead',
          entityId: lead.id,
          details: {
            ad_headline: parsed.referral.headline,
            campaign: matchedCampaign?.name,
            source_id: parsed.referral.source_id,
          },
        })
        await autoTagSource(lead.id, parsed.referral.source_type === 'ad' ? 'meta_ad' : 'organic')
        console.log(`[processMessage] Lead ${lead.id} from Meta Ad: ${parsed.referral.headline ?? parsed.referral.source_id}`)
      } catch (err) {
        console.warn('[processMessage] Failed to save lead source:', err instanceof Error ? err.message : err)
      }
    }

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

    // 4d. "Escribiendo..." — a partir de aquí SÍ vamos a responder. Los puntos
    //     se muestran mientras GPT genera + el typing delay redacta, y se apagan
    //     solos al enviar el mensaje. El cliente ve a Daniela leyendo y tecleando.
    sendTypingIndicator(parsed.messageId).catch(() => {})

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

    // 7. Fetch GT project catalog + sales playbook + lead source + escalation rules in parallel
    let projects: Awaited<ReturnType<typeof getAllProjects>> = []
    let salesPlaybook: string | null = null
    let brainLearnings: string = ''
    let adContext: string | null = null
    let escalationOverride: string | null = null
    const existingDeal = existingDealForDebounce
    try {
      const [projectsResult, playbookEntries, brainEntries, leadSource, activeAds, escalationRules] = await Promise.all([
        getAllProjects(),
        getPlaybook(),
        getHighConfidenceLearnings(),
        getLeadSource(lead.id),
        getActiveAdCampaigns(),
        getActiveEscalationRules(),
      ])
      projects = projectsResult
      salesPlaybook = formatPlaybookForPrompt(playbookEntries)
      brainLearnings = formatLearningsForPrompt(brainEntries)

      if (leadSource && leadSource.source_type !== 'organic') {
        const matchedCampaign = leadSource.campaign_id
          ? await matchAdCampaign(leadSource.campaign_id)
          : null
        adContext = formatSourceContextForPrompt(leadSource, matchedCampaign)
      } else {
        adContext = formatActiveAdsForPrompt(activeAds)
      }

      // 7b. Check escalation rules against the user's message
      const matchedRules = matchKeywordRules(combinedBody, escalationRules)
      if (matchedRules.length > 0) {
        escalationOverride = formatEscalationRulesForPrompt(matchedRules)
        console.log(`[processMessage] Escalation rules matched: ${matchedRules.map(r => r.trigger_value).join(', ')}`)
      }
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
        try { await autoTagProject(lead.id, detectedProject.name) } catch {}
      }
    }

    console.log(`[processMessage] Project: ${project?.name ?? 'none'} | Detected: ${detectedProject?.name ?? 'none'}`)

    // 9. Build the Daniela system prompt with full catalog and call GPT-4o
    const systemPrompt = buildSystemPrompt({
      lead, project, projects, intent, lastBotMessage, gtUrlSection, salesPlaybook,
      dealSummary: existingDeal ? { summary: existingDeal.summary, next_action: existingDeal.next_action } : null,
      brainLearnings: brainLearnings || null,
      adContext,
      escalationOverride,
    })
    let claudeResponse: ReturnType<typeof parseClaudeResponse>
    try {
      let rawResponse: string
      try {
        rawResponse = await callClaude(systemPrompt, history)
        console.log('[processMessage] Raw GPT-4o response:', rawResponse.slice(0, 300))
        claudeResponse = parseClaudeResponse(rawResponse)
      } catch (firstErr) {
        // GPT-4o a veces devuelve {} u JSON inválido con prompts grandes.
        // Reintentamos UNA vez con corrección explícita antes de rendirnos.
        console.warn('[processMessage] Respuesta inválida de GPT-4o — reintentando:', firstErr instanceof Error ? firstErr.message : firstErr)
        const nudgedPrompt = systemPrompt + '\n\n# ATENCIÓN — REINTENTO\nTu respuesta anterior fue un JSON vacío o inválido. Responde AHORA con el JSON COMPLETO del formato especificado arriba. El campo "reply" es OBLIGATORIO: contiene tu mensaje de WhatsApp para el cliente, con tu personalidad de siempre.'
        rawResponse = await callClaude(nudgedPrompt, history)
        console.log('[processMessage] Raw GPT-4o response (retry):', rawResponse.slice(0, 300))
        claudeResponse = parseClaudeResponse(rawResponse)
      }
    } catch (err) {
      // Dos intentos fallidos — NUNCA dejar al cliente en visto. Puente humano
      // variado (no repetir siempre la misma línea) y salimos; el mensaje del
      // cliente ya está guardado y el próximo mensaje reintenta el flujo.
      console.error('[processMessage] GPT-4o failed twice — sending fallback reply:', err instanceof Error ? err.message : err)
      const fallbacks = [
        'Dame un momento, estoy confirmando ese detalle y ya te escribo 🙌',
        'Déjame revisar eso bien y te respondo en un momentito 😊',
        'Buena pregunta — déjame confirmarlo y ya te cuento 🙌',
      ]
      const fallback = fallbacks[Date.now() % fallbacks.length]
      try {
        const fallbackWaId = await sendText(parsed.from, fallback)
        await saveConversation({ leadId: lead.id, role: 'assistant', content: fallback, waMessageId: fallbackWaId ?? undefined })
      } catch (sendErr) {
        console.error('[processMessage] Fallback send also failed:', sendErr instanceof Error ? sendErr.message : sendErr)
      }
      return
    }
    console.log('[processMessage] Parsed action:', JSON.stringify(claudeResponse.agent_action))

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
        await logActivity({
          actorType: 'bot', action: 'meeting_scheduled', entityType: 'lead', entityId: lead.id,
          details: { type: mtg.meeting_type, project: mtg.project_name, datetime: mtg.datetime_iso },
        })
        console.log(`[processMessage] Calendar event created: ${event.htmlLink}`)
      } catch (err) {
        console.error('[processMessage] Failed to create calendar event:', err instanceof Error ? err.message : err)
      }
    }

    // 10b. Route agent actions — notify CEO for consultations and escalations
    const action = claudeResponse.agent_action
    if (action && (action.type === 'consult_team' || action.type === 'escalate_ceo')) {
      await logActivity({
        actorType: 'bot', action: action.type, entityType: 'lead', entityId: lead.id,
        details: { reason: action.reason, urgency: action.urgency, client_type: action.client_type },
      }).catch(err => console.error('[processMessage] logActivity failed:', err instanceof Error ? err.message : err))

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
        console.error('[processMessage] Failed to send WA notification to CEO:', err instanceof Error ? err.message : err)
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
    if (claudeResponse.stage !== lead.stage) {
      await logActivity({
        actorType: 'bot', action: 'stage_change', entityType: 'lead', entityId: lead.id,
        details: { from: lead.stage, to: claudeResponse.stage },
      })
    }
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
    let waMessageId: string | null = null
    const buttons = claudeResponse.interactive_buttons
    try {
      waMessageId = buttons.length > 0
        ? await sendInteractiveButtons(parsed.from, claudeResponse.reply, buttons)
        : await sendText(parsed.from, claudeResponse.reply)
    } catch (err) {
      console.error(`[processMessage] Failed to send WA reply to ${parsed.from}:`, err instanceof Error ? err.message : err)
    }

    // 12b. Send media attachment if GPT-4o requested it
    if (claudeResponse.send_media) {
      const media = getProjectMedia(claudeResponse.send_media.project)
      if (media) {
        try {
          if (claudeResponse.send_media.type === 'document' && media.brochureUrl) {
            await sendDocument(parsed.from, media.brochureUrl, `${claudeResponse.send_media.project}.pdf`, claudeResponse.send_media.description || undefined)
          } else if (claudeResponse.send_media.type === 'image' && media.galleryUrls.length > 0) {
            await sendImage(parsed.from, media.galleryUrls[0], claudeResponse.send_media.description || undefined)
          }
          console.log(`[processMessage] Sent ${claudeResponse.send_media.type} for "${claudeResponse.send_media.project}"`)
        } catch (err) {
          console.error('[processMessage] Failed to send media:', err instanceof Error ? err.message : err)
        }
      }
    }

    // 13. Save the bot's response (even if WA send failed — the reply is still valid context)
    try {
      await saveConversation({
        leadId: lead.id,
        role: 'assistant',
        content: claudeResponse.reply,
        waMessageId: waMessageId ?? undefined,
      })
    } catch (err) {
      console.error(
        `[processMessage] saveConversation failed — history will miss this reply:`,
        err instanceof Error ? err.message : err
      )
    }

    console.log(`[processMessage] Done — lead ${lead.id} | stage: ${claudeResponse.stage} | qualified: ${claudeResponse.qualified}`)
  } catch (error) {
    console.error('[processMessage] Unhandled error:', error instanceof Error ? error.message : error)
    if (error instanceof Error) console.error('[processMessage] Stack:', error.stack)
  }
}
