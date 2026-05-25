import { describe, it, expect } from 'vitest'
import { parseWebhook, verifySignature } from '@/services/whatsapp/webhook'
import { createHmac } from 'crypto'

const textPayload = {
  object: 'whatsapp_business_account',
  entry: [{
    changes: [{
      value: {
        messages: [{
          id: 'wamid.abc123',
          from: '50312345678',
          type: 'text',
          text: { body: 'Hola, me interesa Portacelli' },
          timestamp: '1716556800',
        }]
      }
    }]
  }]
}

describe('parseWebhook', () => {
  it('parses a text message correctly', () => {
    const result = parseWebhook(textPayload)
    expect(result).toMatchObject({
      messageId: 'wamid.abc123',
      from: '50312345678',
      body: 'Hola, me interesa Portacelli',
      messageType: 'text',
      timestamp: 1716556800,
    })
  })

  it('returns null when no messages array present', () => {
    expect(parseWebhook({ object: 'whatsapp_business_account', entry: [] })).toBeNull()
  })

  it('returns null for status update webhooks (no messages key)', () => {
    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            statuses: [{ id: 'wamid.abc', status: 'delivered' }]
          }
        }]
      }]
    }
    expect(parseWebhook(statusPayload)).toBeNull()
  })

  it('returns empty body and correct type for audio messages', () => {
    const audioPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'wamid.audio1',
              from: '50312345678',
              type: 'audio',
              audio: { id: 'audio_id_123' },
              timestamp: '1716556800',
            }]
          }
        }]
      }]
    }
    const result = parseWebhook(audioPayload)
    expect(result?.messageType).toBe('audio')
    expect(result?.body).toBe('')
  })

  it('returns null for completely malformed payload', () => {
    expect(parseWebhook(null)).toBeNull()
    expect(parseWebhook({})).toBeNull()
    expect(parseWebhook('not an object')).toBeNull()
  })
})

describe('verifySignature', () => {
  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = '{"test":"payload"}'
    const secret = 'my_app_secret'
    const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySignature(body, sig, secret)).toBe(true)
  })

  it('returns false for an invalid signature', () => {
    expect(verifySignature('body', 'sha256=invalidsignature', 'secret')).toBe(false)
  })

  it('returns false for an empty signature', () => {
    expect(verifySignature('body', '', 'secret')).toBe(false)
  })
})
