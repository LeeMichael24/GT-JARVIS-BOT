import type { AgentAction } from '@/types'

const WA_API_VERSION = 'v19.0'
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
  await sendText(ceoPhone, message, { typingDelay: false })
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
