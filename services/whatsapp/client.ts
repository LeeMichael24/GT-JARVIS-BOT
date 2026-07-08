import type { AgentAction } from '@/types'

// v23.0: v19 ya expiró (Meta la sirve con fallback) y el typing_indicator
// requiere versión reciente de la Cloud API
const WA_API_VERSION = 'v23.0'
const WA_BASE = `https://graph.facebook.com/${WA_API_VERSION}`

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

function messagesUrl(): string {
  return `${WA_BASE}/${process.env.WA_PHONE_NUMBER_ID}/messages`
}

async function postWithRetry(
  body: Record<string, unknown>,
  attempt = 1
): Promise<unknown> {
  try {
    const res = await fetch(messagesUrl(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`WhatsApp API ${res.status}: ${err}`)
    }
    try {
      return await res.json()
    } catch {
      // 200 sin cuerpo JSON: el mensaje YA salió — no reintentar (duplicaría el envío)
      return null
    }
  } catch (error) {
    if (attempt >= 3) throw error
    await new Promise(r => setTimeout(r, 1000 * attempt))
    return postWithRetry(body, attempt + 1)
  }
}

export async function markAsRead(
  messageId: string,
  opts: { typing?: boolean } = {}
): Promise<void> {
  try {
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }
    // typing_indicator muestra "escribiendo..." en el chat del cliente.
    // Dura hasta 25s o hasta que se envía el siguiente mensaje.
    if (opts.typing) body.typing_indicator = { type: 'text' }
    const res = await fetch(messagesUrl(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      // Non-critical, pero SÍ visible: si el visto/typing falla queremos saber por qué
      console.warn(`[whatsapp] markAsRead${opts.typing ? '+typing' : ''} failed (${res.status}):`, (await res.text()).slice(0, 300))
    }
  } catch (err) {
    console.warn('[whatsapp] markAsRead error:', err instanceof Error ? err.message : err)
  }
}

// "Escribiendo..." mientras Daniela genera y redacta la respuesta.
// Se apaga solo al enviar el mensaje (o a los 25s).
export async function sendTypingIndicator(messageId: string): Promise<void> {
  return markAsRead(messageId, { typing: true })
}

export function calculateTypingDelay(text: string): number {
  return Math.min(Math.max(text.length * 30, 1500), 4000)
}

export async function sendText(
  to: string,
  body: string,
  opts: { typingDelay?: boolean } = {}
): Promise<string | null> {
  if (opts.typingDelay !== false) {
    await new Promise(r => setTimeout(r, calculateTypingDelay(body)))
  }
  const response = await postWithRetry({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body, preview_url: false },
  }) as { messages?: { id?: string }[] } | null
  return response?.messages?.[0]?.id ?? null
}

export interface NotificationParams {
  leadName: string
  leadPhone: string
  action: AgentAction
  botReply: string
  dealSummary: string | null
}

export function formatNotification(params: NotificationParams): string {
  const { leadName, leadPhone, action, botReply, dealSummary } = params
  const isEscalation = action.type === 'escalate_ceo'
  const clientLabel = action.client_type === 'corporate' ? 'CORPORATIVO' : 'Individual'

  if (isEscalation) {
    const lines = [
      '🚨 LEAD HOT — Acción inmediata',
      '',
      `Cliente: ${leadName} (+${leadPhone})`,
      `Tipo: ${clientLabel}`,
    ]
    if (action.reason) lines.push(`Contexto: ${action.reason}`)
    if (dealSummary) lines.push(`Deal: ${dealSummary}`)
    lines.push(`Daniela le dijo: "${botReply.slice(0, 200)}"`)
    lines.push('', '⚡ Este cliente está listo para cerrar.')
    return lines.join('\n')
  }

  const lines = [
    '🔔 Daniela necesita tu apoyo',
    '',
    `Cliente: ${leadName} (+${leadPhone})`,
  ]
  if (action.reason) lines.push(`Solicitud: ${action.reason}`)
  if (dealSummary) lines.push(`Deal: ${dealSummary}`)
  lines.push(`Daniela le dijo: "${botReply.slice(0, 200)}"`)
  lines.push('', 'Responde a este chat para darle instrucciones.')
  return lines.join('\n')
}

export async function sendInternalNotification(params: NotificationParams): Promise<void> {
  const ceoPhone = process.env.CEO_PHONE_NUMBER
  if (!ceoPhone) {
    console.warn('[notification] CEO_PHONE_NUMBER not configured — skipping notification')
    return
  }
  const message = formatNotification(params)
  try {
    await sendText(ceoPhone, message, { typingDelay: false })
  } catch (err) {
    // El texto libre falla si el CEO no le ha escrito al bot en 24h (error 131047).
    // Fallback: plantilla HSM aprobada — llega SIEMPRE, con o sin ventana.
    const tpl = process.env.WA_TEMPLATE_CEO_ALERT
    if (!tpl) {
      console.error('[notification] Free-form al CEO rechazado y WA_TEMPLATE_CEO_ALERT no está configurada — la alerta NO llegó:', err instanceof Error ? err.message : err)
      throw err
    }
    console.warn(`[notification] Free-form al CEO rechazado — reintentando con plantilla "${tpl}"`)
    await sendTemplate(ceoPhone, tpl, 'es', [
      params.leadName,
      `+${params.leadPhone}`,
      params.action.reason ?? (params.action.type === 'escalate_ceo' ? 'Cliente listo para cerrar' : 'Daniela necesita apoyo'),
    ])
  }
}

export async function sendDocument(
  to: string,
  documentUrl: string,
  filename: string,
  caption?: string
): Promise<string | null> {
  const document: Record<string, string> = { link: documentUrl, filename }
  if (caption) document.caption = caption
  const response = await postWithRetry({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'document',
    document,
  }) as { messages?: { id?: string }[] } | null
  return response?.messages?.[0]?.id ?? null
}

export async function sendImage(
  to: string,
  imageUrl: string,
  caption?: string
): Promise<string | null> {
  const image: Record<string, string> = { link: imageUrl }
  if (caption) image.caption = caption
  const response = await postWithRetry({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image,
  }) as { messages?: { id?: string }[] } | null
  return response?.messages?.[0]?.id ?? null
}

export async function sendVideo(
  to: string,
  videoUrl: string,
  caption?: string
): Promise<string | null> {
  const video: Record<string, string> = { link: videoUrl }
  if (caption) video.caption = caption
  const response = await postWithRetry({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'video',
    video,
  }) as { messages?: { id?: string }[] } | null
  return response?.messages?.[0]?.id ?? null
}

export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`${WA_BASE}/${mediaId}`, { headers: headers() })
  if (!metaRes.ok) throw new Error(`Media meta ${metaRes.status}`)
  const meta = await metaRes.json() as { url: string; mime_type: string }

  const dataRes = await fetch(meta.url, { headers: headers() })
  if (!dataRes.ok) throw new Error(`Media download ${dataRes.status}`)
  const arrayBuf = await dataRes.arrayBuffer()
  return { buffer: Buffer.from(arrayBuf), mimeType: meta.mime_type }
}

export async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[],
): Promise<string | null> {
  if (buttons.length === 0) return sendText(to, bodyText)
  const response = await postWithRetry({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  }) as { messages?: { id?: string }[] } | null
  return response?.messages?.[0]?.id ?? null
}

// Mensajes de plantilla (fuera de la ventana de 24h). Sin typing delay:
// son envíos programados/aprobados, no conversación en vivo.
export async function sendTemplate(
  to: string,
  templateName: string,
  language: string,
  bodyParams: string[]
): Promise<string | null> {
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: language },
  }
  if (bodyParams.length > 0) {
    template.components = [{
      type: 'body',
      parameters: bodyParams.map(text => ({ type: 'text', text })),
    }]
  }
  const response = await postWithRetry({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template,
  }) as { messages?: { id?: string }[] } | null
  return response?.messages?.[0]?.id ?? null
}
