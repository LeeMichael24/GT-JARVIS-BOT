import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSupabase = {
  from: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  upsert: vi.fn(),
  maybeSingle: vi.fn(),
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}))

import { upsertDealSummary, getDealSummary } from '@/lib/supabase'

beforeEach(() => {
  vi.clearAllMocks()
  mockSupabase.from.mockReturnValue(mockSupabase)
  mockSupabase.select.mockReturnValue(mockSupabase)
  mockSupabase.eq.mockReturnValue(mockSupabase)
  mockSupabase.upsert.mockReturnValue(mockSupabase)
})

describe('deal memory', () => {
  it('upsertDealSummary sends correct data', async () => {
    mockSupabase.upsert.mockResolvedValue({ error: null })
    await upsertDealSummary('lead-1', {
      summary: 'Carlos busca inversión',
      signals: { engagement_level: 'high' },
      next_action: 'Send payment plan',
    })
    expect(mockSupabase.from).toHaveBeenCalledWith('deal_summaries')
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 'lead-1',
        summary: 'Carlos busca inversión',
        next_action: 'Send payment plan',
      }),
      expect.objectContaining({ onConflict: 'lead_id' })
    )
  })

  it('getDealSummary returns summary when exists', async () => {
    mockSupabase.maybeSingle.mockResolvedValue({
      data: {
        id: 'ds-1', lead_id: 'lead-1',
        summary: 'Carlos busca inversión',
        signals: { engagement_level: 'high' },
        next_action: 'Send plan',
        updated_at: '2026-06-27T00:00:00Z',
      },
      error: null,
    })
    const result = await getDealSummary('lead-1')
    expect(result).not.toBeNull()
    expect(result!.summary).toBe('Carlos busca inversión')
  })

  it('getDealSummary returns null when no summary exists', async () => {
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null })
    const result = await getDealSummary('lead-1')
    expect(result).toBeNull()
  })
})
