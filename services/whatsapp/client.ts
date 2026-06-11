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
