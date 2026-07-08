import { describe, it, expect } from 'vitest'
import { calculateAdaptiveDebounce } from '@/lib/debounce'
import type { DealSignals } from '@/types'

describe('calculateAdaptiveDebounce', () => {
  it('returns default 3000ms when no pattern data', () => {
    expect(calculateAdaptiveDebounce(null)).toBe(3000)
    expect(calculateAdaptiveDebounce({})).toBe(3000)
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

  it('clamps multi_message debounce between 3000 and 8000', () => {
    const fast: DealSignals = { typing_pattern: 'multi_message', avg_gap_between_burst_msgs_ms: 500 }
    expect(calculateAdaptiveDebounce(fast)).toBe(3000)

    const slow: DealSignals = { typing_pattern: 'multi_message', avg_gap_between_burst_msgs_ms: 8000 }
    expect(calculateAdaptiveDebounce(slow)).toBe(8000)
  })

  it('returns 6000ms for voice_note pattern', () => {
    const signals: DealSignals = { typing_pattern: 'voice_note' }
    expect(calculateAdaptiveDebounce(signals)).toBe(6000)
  })

  it('falls back to default if multi_message but no gap data', () => {
    const signals: DealSignals = { typing_pattern: 'multi_message' }
    expect(calculateAdaptiveDebounce(signals)).toBe(3000)
  })
})
