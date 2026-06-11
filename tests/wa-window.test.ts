import { describe, it, expect } from 'vitest'
import { isWithin24h, WA_WINDOW_MS } from '@/lib/wa-window'

describe('isWithin24h', () => {
  const now = Date.parse('2026-06-10T12:00:00Z')

  it('true si el cliente escribió hace 1 hora', () => {
    expect(isWithin24h('2026-06-10T11:00:00Z', now)).toBe(true)
  })

  it('false si escribió hace 25 horas', () => {
    expect(isWithin24h('2026-06-09T11:00:00Z', now)).toBe(false)
  })

  it('false en el límite exacto de 24h', () => {
    expect(isWithin24h(new Date(now - WA_WINDOW_MS).toISOString(), now)).toBe(false)
  })

  it('false si nunca escribió', () => {
    expect(isWithin24h(null, now)).toBe(false)
  })
})
