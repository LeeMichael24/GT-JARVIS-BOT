import { createHmac } from 'crypto'
import type { ParsedWebhook, MessageType } from '@/types'

export function parseWebhook(raw: unknown): ParsedWebhook | null {
  try {
    const payload = raw as Record<string, unknown>
    const entry = (payload?.entry as unknown[])?.[0] as Record<string, unknown>
    const changes = (entry?.changes as unknown[])?.[0] as Record<string, unknown>
    const value = changes?.value as Record<string, unknown>
    const messages = value?.messages as unknown[]

    if (!messages?.length) return null

    const msg = messages[0] as Record<string, unknown>
    const type = (msg.type as string) as MessageType
    const body = type === 'text'
      ? ((msg.text as Record<string, string>)?.body ?? '')
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

    return {
      messageId: msg.id as string,
      from: msg.from as string,
      body,
      messageType: type,
      timestamp: parseInt(msg.timestamp as string, 10),
      mediaId,
    }
  } catch {
    return null
  }
}

export function verifySignature(body: string, signature: string, secret: string): boolean {
  if (!signature) return false
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  return signature === expected
}
