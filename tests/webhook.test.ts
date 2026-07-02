import { describe, it, expect } from 'vitest'
import { parseWebhook, parseWebhookMessages, verifySignature } from '@/services/whatsapp/webhook'
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

describe('parseWebhookMessages — batches de Meta', () => {
  it('extrae TODOS los mensajes cuando Meta agrupa varios en un webhook', () => {
    const batchPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages: [
              { id: 'wamid.m1', from: '50312345678', type: 'text', text: { body: 'Hola' }, timestamp: '1716556800' },
              { id: 'wamid.m2', from: '50312345678', type: 'text', text: { body: 'Info de Portacelli porfa' }, timestamp: '1716556801' },
            ]
          }
        }]
      }]
    }
    const results = parseWebhookMessages(batchPayload)
    expect(results).toHaveLength(2)
    expect(results[0].messageId).toBe('wamid.m1')
    expect(results[1].messageId).toBe('wamid.m2')
    expect(results[1].body).toBe('Info de Portacelli porfa')
  })

  it('extrae mensajes de múltiples entries y changes', () => {
    const multiEntry = {
      object: 'whatsapp_business_account',
      entry: [
        { changes: [{ value: { messages: [{ id: 'wamid.e1', from: '503111', type: 'text', text: { body: 'a' }, timestamp: '1' }] } }] },
        { changes: [
          { value: { messages: [{ id: 'wamid.e2', from: '503222', type: 'text', text: { body: 'b' }, timestamp: '2' }] } },
          { value: { statuses: [{ id: 'wamid.x', status: 'delivered' }] } },
        ] },
      ]
    }
    const results = parseWebhookMessages(multiEntry)
    expect(results.map(r => r.messageId)).toEqual(['wamid.e1', 'wamid.e2'])
  })

  it('devuelve array vacío para payloads sin mensajes o malformados', () => {
    expect(parseWebhookMessages({ entry: [] })).toEqual([])
    expect(parseWebhookMessages(null)).toEqual([])
    expect(parseWebhookMessages('basura')).toEqual([])
  })

  it('parseWebhook (legacy) devuelve el primero del batch', () => {
    const result = parseWebhook(textPayload)
    expect(result?.messageId).toBe('wamid.abc123')
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
