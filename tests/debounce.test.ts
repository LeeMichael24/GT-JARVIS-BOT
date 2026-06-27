import { describe, it, expect } from 'vitest'
import { calculateAdaptiveDebounce } from '@/lib/debounce'
import type { DealSignals } from '@/types'

describe('calculateAdaptiveDebounce', () => {
  it('returns default 4000ms when no pattern data', () => {
    expect(calculateAdaptiveDebounce(null)).toBe(4000)
    expect(calculateAdaptiveDebounce({})).toBe(4000)
  })

  it('returns 2000ms for single_message pattern', () => {
    const signals: DealSignals = { typing_pattern: 'single_message' }
    expect(calculateAdaptiveDebounce(signals)).toBe(2000)
  })

  it('uses avg_gap * 2.5 for multi_message pattern', () => {
    const signals: DealSignals = {
      typing_pattern: 'multi_message',
      avg_gap_between_burst_msgs_ms: 2000,
    }
    expect(calculateAdaptiveDebounce(signals)).toBe(5000)
  })

  it('clamps multi_message debounce between 3000 and 10000', () => {
    const fast: DealSignals = { typing_pattern: 'multi_message', avg_gap_between_burst_msgs_ms: 500 }
    expect(calculateAdaptiveDebounce(fast)).toBe(3000)

    const slow: DealSignals = { typing_pattern: 'multi_message', avg_gap_between_burst_msgs_ms: 8000 }
    expect(calculateAdaptiveDebounce(slow)).toBe(10000)
  })

  it('returns 8000ms for voice_note pattern', () => {
    const signals: DealSignals = { typing_pattern: 'voice_note' }
    expect(calculateAdaptiveDebounce(signals)).toBe(8000)
  })

  it('falls back to default if multi_message but no gap data', () => {
    const signals: DealSignals = { typing_pattern: 'multi_message' }
    expect(calculateAdaptiveDebounce(signals)).toBe(4000)
  })
})
