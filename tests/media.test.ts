import { describe, it, expect } from 'vitest'
import { parseWebhook } from '@/services/whatsapp/webhook'

describe('parseWebhook — media messages', () => {
  function makePayload(type: string, mediaField: Record<string, unknown>) {
    return {
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'wamid_audio1',
              from: '50312345678',
              type,
              timestamp: '1719500000',
              [type]: mediaField,
            }],
          },
        }],
      }],
    }
  }

  it('extracts mediaId from audio message', () => {
    const result = parseWebhook(makePayload('audio', { id: 'media_123', mime_type: 'audio/ogg' }))
    expect(result).not.toBeNull()
    expect(result!.messageType).toBe('audio')
    expect(result!.mediaId).toBe('media_123')
    expect(result!.body).toBe('')
  })

  it('extracts mediaId from image message', () => {
    const result = parseWebhook(makePayload('image', { id: 'media_456', mime_type: 'image/jpeg' }))
    expect(result).not.toBeNull()
    expect(result!.messageType).toBe('image')
    expect(result!.mediaId).toBe('media_456')
  })

  it('extracts mediaId from video message', () => {
    const result = parseWebhook(makePayload('video', { id: 'media_789', mime_type: 'video/mp4' }))
    expect(result).not.toBeNull()
    expect(result!.messageType).toBe('video')
    expect(result!.mediaId).toBe('media_789')
  })

  it('extracts mediaId from document message', () => {
    const result = parseWebhook(makePayload('document', { id: 'media_doc1', mime_type: 'application/pdf' }))
    expect(result).not.toBeNull()
    expect(result!.messageType).toBe('document')
    expect(result!.mediaId).toBe('media_doc1')
  })

  it('text messages have null mediaId', () => {
    const result = parseWebhook({
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'wamid_text1',
              from: '50312345678',
              type: 'text',
              timestamp: '1719500000',
              text: { body: 'Hola' },
            }],
          },
        }],
      }],
    })
    expect(result!.mediaId).toBeNull()
  })
})
