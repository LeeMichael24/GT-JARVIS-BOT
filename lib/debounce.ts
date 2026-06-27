import type { DealSignals } from '@/types'

const DEFAULT_DEBOUNCE_MS = 4000
const MIN_MULTI_DEBOUNCE_MS = 3000
const MAX_MULTI_DEBOUNCE_MS = 10000
const VOICE_DEBOUNCE_MS = 8000
const SINGLE_DEBOUNCE_MS = 2000

export function calculateAdaptiveDebounce(signals: DealSignals | null | undefined): number {
  if (!signals?.typing_pattern) return DEFAULT_DEBOUNCE_MS

  switch (signals.typing_pattern) {
    case 'single_message':
      return SINGLE_DEBOUNCE_MS
    case 'voice_note':
      return VOICE_DEBOUNCE_MS
    case 'multi_message': {
      const gap = signals.avg_gap_between_burst_msgs_ms
      if (!gap) return DEFAULT_DEBOUNCE_MS
      return Math.min(Math.max(Math.round(gap * 2.5), MIN_MULTI_DEBOUNCE_MS), MAX_MULTI_DEBOUNCE_MS)
    }
    default:
      return DEFAULT_DEBOUNCE_MS
  }
}

export function computeBurstPattern(
  burstTimestamps: number[],
  existingSignals: DealSignals | null | undefined,
): Partial<DealSignals> {
  const count = burstTimestamps.length
  if (count <= 1) {
    return mergePattern(existingSignals, 1, null, 'single_message')
  }

  const gaps: number[] = []
  for (let i = 1; i < burstTimestamps.length; i++) {
    gaps.push(burstTimestamps[i] - burstTimestamps[i - 1])
  }
  const avgGap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)

  return mergePattern(existingSignals, count, avgGap, 'multi_message')
}

function mergePattern(
  existing: DealSignals | null | undefined,
  burstSize: number,
  gapMs: number | null,
  pattern: DealSignals['typing_pattern'],
): Partial<DealSignals> {
  const prev = existing ?? {}
  const prevBurst = prev.messages_per_burst ?? burstSize
  const newBurst = Math.round((prevBurst + burstSize) / 2)
  const result: Partial<DealSignals> = {
    messages_per_burst: newBurst,
    typing_pattern: newBurst <= 1.3 ? 'single_message' : pattern,
  }
  if (gapMs !== null) {
    const prevGap = prev.avg_gap_between_burst_msgs_ms ?? gapMs
    result.avg_gap_between_burst_msgs_ms = Math.round((prevGap + gapMs) / 2)
  }
  return result
}
