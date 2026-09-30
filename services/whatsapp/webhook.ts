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

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function parseSingleMessage(msg: Record<string, unknown>): ParsedWebhook | null {
  try {
    const conocidos: MessageType[] = ['text', 'image', 'audio', 'document', 'video', 'interactive', 'location', 'sticker', 'reaction', 'contacts']
    const type: MessageType = conocidos.includes(msg.type as MessageType) ? (msg.type as MessageType) : 'unknown'
    const interactive = msg.interactive as Record<string, Record<string, string>> | undefined
    const body = type === 'text'
      ? ((msg.text as Record<string, string>)?.body ?? '')
      : type === 'interactive'
      ? (interactive?.button_reply?.title ?? interactive?.list_reply?.title ?? '')
      : ''

    const media = (type === 'audio' || type === 'image' || type === 'video' || type === 'document' || type === 'sticker')
      ? (msg[type] as Record<string, string> | undefined)
      : undefined
    const mediaId = media?.id ?? null

    const loc = msg.location as Record<string, unknown> | undefined
    const reaction = msg.reaction as Record<string, string> | undefined
    const contacts = msg.contacts as { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[] | undefined

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
      caption: texto(media?.caption),
      filename: texto(media?.filename),
      mimeType: texto(media?.mime_type),
      contextId: texto((msg.context as Record<string, string> | undefined)?.id),
      location: loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
        ? { latitude: loc.latitude, longitude: loc.longitude, name: texto(loc.name), address: texto(loc.address) }
        : null,
      reaction: reaction ? { messageId: reaction.message_id ?? null, emoji: texto(reaction.emoji) } : null,
      contacts: (contacts ?? []).map(c => ({ name: texto(c.name?.formatted_name), phone: texto(c.phones?.[0]?.phone) })),
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
