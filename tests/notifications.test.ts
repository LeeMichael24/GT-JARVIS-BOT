import { describe, it, expect } from 'vitest'
import { formatNotification } from '@/services/whatsapp/client'
import type { AgentAction } from '@/types'

describe('formatNotification', () => {
  const baseParams = {
    leadName: 'Carlos',
    leadPhone: '50378901234',
    action: {
      type: 'consult_team' as const,
      reason: 'Client wants furnished apartment, not in catalog',
      urgency: 'normal' as const,
      client_type: 'individual' as const,
      follow_up_hint: null,
    } satisfies AgentAction,
    botReply: 'Déjame verificar con mi equipo.',
    dealSummary: 'Carlos busca inversión $400k',
  }

  it('formats consultation notification', () => {
    const msg = formatNotification(baseParams)
    expect(msg).toContain('Daniela necesita tu apoyo')
    expect(msg).toContain('Carlos')
    expect(msg).toContain('50378901234')
    expect(msg).toContain('furnished apartment')
  })

  it('formats escalation notification with urgency markers', () => {
    const msg = formatNotification({
      ...baseParams,
      action: { ...baseParams.action, type: 'escalate_ceo', urgency: 'critical', client_type: 'corporate' },
    })
    expect(msg).toContain('LEAD HOT')
    expect(msg).toContain('CORPORATIVO')
  })

  it('includes deal summary when available', () => {
    const msg = formatNotification(baseParams)
    expect(msg).toContain('inversión $400k')
  })

  it('works without deal summary', () => {
    const msg = formatNotification({ ...baseParams, dealSummary: null })
    expect(msg).toContain('Carlos')
    expect(msg).not.toContain('Deal:')
  })
})
