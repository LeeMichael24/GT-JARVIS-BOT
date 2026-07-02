import { createHmac, timingSafeEqual } from 'crypto'
import type { ParsedWebhook, MessageType, WaReferral } from '@/types'

// Meta puede agrupar varios mensajes (y varios entries/changes) en un solo
// webhook bajo carga. Extraemos TODOS — procesar solo messages[0] pierde el resto.
export function parseWebhookMessages(raw: unknown): ParsedWebhook[] {
  const results: ParsedWebhook[] = []
  try {
    const payload = raw as Record<string, unknown>
    const entries = (payload?.entry as unknown[]) ?? []
    for (const entryRaw of entries) {
      const entry = entryRaw as Record<string, unknown>
      const changes = (entry?.changes as unknown[]) ?? []
      for (const changeRaw of changes) {
        const change = changeRaw as Record<string, unknown>
        const value = change?.value as Record<string, unknown>
        const messages = (value?.messages as unknown[]) ?? []
        for (const msgRaw of messages) {
          const parsed = parseSingleMessage(msgRaw as Record<string, unknown>)
          if (parsed) results.push(parsed)
        }
      }
    }
  } catch {
    // Malformed payload — return whatever was parsed before the failure
  }
  return results
}

export function parseWebhook(raw: unknown): ParsedWebhook | null {
  return parseWebhookMessages(raw)[0] ?? null
}

function parseSingleMessage(msg: Record<string, unknown>): ParsedWebhook | null {
  try {
    const type = (msg.type as string) as MessageType
    const body = type === 'text'
      ? ((msg.text as Record<string, string>)?.body ?? '')
      : type === 'interactive'
      ? ((msg.interactive as Record<string, Record<string, string>>)?.button_reply?.title ?? '')
      : ''

    let mediaId: string | null = null
    if (type === 'audio') {
      mediaId = (msg.audio as Record<string, string>)?.id ?? null
    } else if (type === 'image') {
      mediaId = (msg.image as Record<string, string>)?.id ?? null
    } else if (type === 'video') {
      mediaId = (msg.video as Record<string, string>)?.id ?? null
    } else if (type === 'document') {
      mediaId = (msg.document as Record<string, string>)?.id ?? null
    }

    const rawReferral = msg.referral as Record<string, string> | undefined
    const referral: WaReferral | null = rawReferral
      ? {
          source_url: rawReferral.source_url,
          source_type: rawReferral.source_type,
          source_id: rawReferral.source_id,
          headline: rawReferral.headline,
          body: rawReferral.body,
          media_type: rawReferral.media_type,
          media_url: rawReferral.media_url,
        }
      : null

    return {
      messageId: msg.id as string,
      from: msg.from as string,
      body,
      messageType: type,
      timestamp: parseInt(msg.timestamp as string, 10),
      mediaId,
      referral,
    }
  } catch {
    return null
  }
}

export function verifySignature(body: string, signature: string, secret: string): boolean {
  if (!signature) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length) return false
  return timingSafeEqual(sigBuf, expBuf)
}
