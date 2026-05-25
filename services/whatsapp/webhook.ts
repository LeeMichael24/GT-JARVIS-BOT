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

    return {
      messageId: msg.id as string,
      from: msg.from as string,
      body,
      messageType: type,
      timestamp: parseInt(msg.timestamp as string, 10),
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
