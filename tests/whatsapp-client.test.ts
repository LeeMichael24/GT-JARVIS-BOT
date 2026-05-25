import { describe, it, expect } from 'vitest'
import { calculateTypingDelay } from '@/services/whatsapp/client'

describe('calculateTypingDelay', () => {
  it('returns minimum 1500ms for very short messages', () => {
    expect(calculateTypingDelay('Hola')).toBe(1500)
    expect(calculateTypingDelay('')).toBe(1500)
  })

  it('returns maximum 4000ms for very long messages', () => {
    expect(calculateTypingDelay('a'.repeat(500))).toBe(4000)
  })

  it('scales proportionally for medium-length messages (80 chars = 2400ms)', () => {
    expect(calculateTypingDelay('a'.repeat(80))).toBe(2400)
  })

  it('returns exactly 1500 for messages up to 50 chars', () => {
    expect(calculateTypingDelay('a'.repeat(50))).toBe(1500)
  })
})
