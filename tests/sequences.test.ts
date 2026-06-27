import { describe, it, expect } from 'vitest'
import {
  SEQUENCE_DEFINITIONS,
  getNextFireAt,
  isWithinBusinessHours,
} from '@/lib/sequences'

describe('sequence definitions', () => {
  it('post_conversation has 3 steps', () => {
    expect(SEQUENCE_DEFINITIONS.post_conversation.steps).toHaveLength(3)
  })

  it('hot_close has 3 steps', () => {
    expect(SEQUENCE_DEFINITIONS.hot_close.steps).toHaveLength(3)
  })

  it('cold_reactivation has 2 steps', () => {
    expect(SEQUENCE_DEFINITIONS.cold_reactivation.steps).toHaveLength(2)
  })

  it('all steps have delay_hours and purpose', () => {
    for (const [, def] of Object.entries(SEQUENCE_DEFINITIONS)) {
      for (const step of def.steps) {
        expect(step.delay_hours).toBeGreaterThan(0)
        expect(step.purpose).toBeTruthy()
      }
    }
  })
})

describe('getNextFireAt', () => {
  it('adds delay hours to current time', () => {
    const now = new Date('2026-06-27T10:00:00-06:00')
    const result = getNextFireAt(now, 24)
    expect(new Date(result).getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000)
  })
})

describe('isWithinBusinessHours', () => {
  it('returns true during business hours (8am-6pm El Salvador)', () => {
    const workday = new Date('2026-06-27T14:00:00Z') // 8am El Salvador
    expect(isWithinBusinessHours(workday)).toBe(true)
  })

  it('returns false before 8am', () => {
    const early = new Date('2026-06-27T13:00:00Z') // 7am El Salvador
    expect(isWithinBusinessHours(early)).toBe(false)
  })

  it('returns false after 6pm', () => {
    const late = new Date('2026-06-28T01:00:00Z') // 7pm El Salvador
    expect(isWithinBusinessHours(late)).toBe(false)
  })
})
