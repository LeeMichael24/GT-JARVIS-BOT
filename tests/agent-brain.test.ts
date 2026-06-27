import { describe, it, expect } from 'vitest'
import { formatLearningsForPrompt } from '@/lib/agent-brain'
import type { BrainEntry } from '@/types'

describe('formatLearningsForPrompt', () => {
  it('formats entries grouped by topic', () => {
    const entries: BrainEntry[] = [
      { id: '1', category: 'pattern', topic: 'closing', content: 'Mentioning scarcity works', source: 'agent', lead_id: null, confidence: 0.8, active: true, created_at: '', updated_at: '' },
      { id: '2', category: 'correction', topic: 'pricing', content: 'Never offer discounts without CEO approval', source: 'team', lead_id: null, confidence: 1.0, active: true, created_at: '', updated_at: '' },
    ]
    const result = formatLearningsForPrompt(entries)
    expect(result).toContain('scarcity')
    expect(result).toContain('CEO approval')
  })

  it('returns empty string for no entries', () => {
    expect(formatLearningsForPrompt([])).toBe('')
  })

  it('prioritizes team corrections over agent observations', () => {
    const entries: BrainEntry[] = [
      { id: '1', category: 'observation', topic: 'test', content: 'Agent note', source: 'agent', lead_id: null, confidence: 0.5, active: true, created_at: '', updated_at: '' },
      { id: '2', category: 'correction', topic: 'test', content: 'Team override', source: 'team', lead_id: null, confidence: 1.0, active: true, created_at: '', updated_at: '' },
    ]
    const result = formatLearningsForPrompt(entries)
    const teamIdx = result.indexOf('Team override')
    const agentIdx = result.indexOf('Agent note')
    expect(teamIdx).toBeLessThan(agentIdx)
  })
})
