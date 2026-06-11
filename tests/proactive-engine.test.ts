import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRecontactRules, runDailyRadar, sendCampaign, type EngineDeps } from '@/lib/proactive/engine'
import type { Lead, MessageTemplate, RecontactRule } from '@/types'

const NOW = Date.parse('2026-06-11T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString()

const mkLead = (over: Partial<Lead> = {}): Lead => ({
  id: 'l1', phone: '503', name: 'Carlos', stage: 'hot', bot_active: true,
  project_interest: null, qualification_data: null, assigned_to: null,
  opted_out: false, last_proactive_at: null,
  first_message_at: '', last_message_at: daysAgo(10), created_at: '',
  ...over,
} as Lead)

const template: MessageTemplate = {
  id: 'tpl1', name: 'recontacto_seguimiento', language: 'es', category: 'MARKETING',
  body_preview: 'Hola {{1}}, ¿sigues interesado en {{2}}?', variables: 2, active: true, created_at: '',
}
const rule: RecontactRule = {
  id: 'r1', name: 'Calientes 5 días', active: true, stages: ['hot'], tag_ids: null,
  days_inactive: 5, template_id: 'tpl1', max_per_run: 2, created_at: '',
}

function makeDeps(over: Partial<EngineDeps> = {}): EngineDeps & { created: unknown[] } {
  const created: unknown[] = []
  return {
    created,
    leadsWithTags: vi.fn(async () => [{ lead: mkLead(), tagIds: [], lastUserMessageAt: daysAgo(10) }]),
    listActiveRules: vi.fn(async () => [rule]),
    getTemplateById: vi.fn(async () => template),
    getTemplateByName: vi.fn(async () => template),
    leadIdsInActiveCampaigns: vi.fn(async () => new Set<string>()),
    hasCampaignForRuleToday: vi.fn(async () => false),
    hasCampaignForListing: vi.fn(async () => false),
    createCampaign: vi.fn(async (c: unknown) => { created.push(c); return 'camp1' }),
    listKnownSlugs: vi.fn(async () => new Set<string>(['viejo'])),
    insertKnownListings: vi.fn(async () => {}),
    getAllProjects: vi.fn(async () => [
      { slug: 'viejo', name: 'Viejo', type: 'Casa', location: 'X', description: '', status: 'ok' },
    ]),
    getCampaignForSend: vi.fn(async () => null),
    setCampaignStatus: vi.fn(async () => {}),
    claimRecipient: vi.fn(async () => true),
    markRecipient: vi.fn(async () => {}),
    sendTemplate: vi.fn(async () => 'wamid.x'),
    saveConversation: vi.fn(async () => {}),
    updateLead: vi.fn(async () => {}),
    now: () => NOW,
    ...over,
  } as EngineDeps & { created: unknown[] }
}

beforeEach(() => vi.clearAllMocks())

describe('runRecontactRules', () => {
  it('crea campaña con destinatarios elegibles y variables renderizadas', async () => {
    const deps = makeDeps()
    const res = await runRecontactRules(deps)
    expect(res.campaignsCreated).toBe(1)
    const camp = deps.created[0] as { kind: string; recipients: { lead_id: string; variables: string[] }[] }
    expect(camp.kind).toBe('recontact')
    expect(camp.recipients[0]).toMatchObject({ lead_id: 'l1', variables: ['Carlos', 'nuestras propiedades'] })
  })

  it('excluye opted_out, bot pausado, gap reciente y leads ya en campaña activa', async () => {
    const deps = makeDeps({
      leadsWithTags: vi.fn(async () => [
        { lead: mkLead({ id: 'ok' }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'optout', opted_out: true }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'humano', bot_active: false }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'reciente', last_proactive_at: daysAgo(2) }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'encampaña' }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'bottuvolaultima' }), tagIds: [], lastUserMessageAt: daysAgo(3) },
      ]),
      leadIdsInActiveCampaigns: vi.fn(async () => new Set(['encampaña'])),
    })
    await runRecontactRules(deps)
    const camp = deps.created[0] as { recipients: { lead_id: string }[] }
    expect(camp.recipients.map(r => r.lead_id)).toEqual(['ok'])
  })

  it('respeta max_per_run priorizando hot', async () => {
    const deps = makeDeps({
      leadsWithTags: vi.fn(async () => [
        { lead: mkLead({ id: 'w', stage: 'warm' }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'h1' }), tagIds: [], lastUserMessageAt: daysAgo(10) },
        { lead: mkLead({ id: 'h2' }), tagIds: [], lastUserMessageAt: daysAgo(10) },
      ]),
      listActiveRules: vi.fn(async () => [{ ...rule, stages: null, max_per_run: 2 }]),
    })
    await runRecontactRules(deps)
    const camp = deps.created[0] as { recipients: { lead_id: string }[] }
    expect(camp.recipients.map(r => r.lead_id)).toEqual(['h1', 'h2'])
  })

  it('idempotencia: regla con campaña de hoy no duplica', async () => {
    const deps = makeDeps({ hasCampaignForRuleToday: vi.fn(async () => true) })
    const res = await runRecontactRules(deps)
    expect(res.campaignsCreated).toBe(0)
  })

  it('sin candidatos no crea campaña', async () => {
    const deps = makeDeps({ leadsWithTags: vi.fn(async () => []) })
    const res = await runRecontactRules(deps)
    expect(res.campaignsCreated).toBe(0)
  })
})

describe('runDailyRadar', () => {
  it('primera ejecución: siembra el catálogo SIN campañas', async () => {
    const deps = makeDeps({
      listKnownSlugs: vi.fn(async () => new Set<string>()),
      getAllProjects: vi.fn(async () => [
        { slug: 'a', name: 'A', type: 'Casa', location: 'X', description: '', status: 'ok' },
        { slug: 'b', name: 'B', type: 'Casa', location: 'X', description: '', status: 'ok' },
      ]),
    })
    const res = await runDailyRadar(deps)
    expect(res).toEqual({ newListings: 2, campaignsCreated: 0 })
    expect(deps.insertKnownListings).toHaveBeenCalledTimes(1)
    expect(deps.createCampaign).not.toHaveBeenCalled()
  })

  it('listing nuevo con matches crea campaña de oportunidad', async () => {
    const deps = makeDeps({
      getAllProjects: vi.fn(async () => [
        { slug: 'viejo', name: 'Viejo', type: 'Casa', location: 'X', description: '', status: 'ok' },
        { slug: 'nuevo', name: 'Torre Nueva', type: 'Apartamentos', location: 'Cuscatlán', description: '', status: 'ok', entityType: 'investment' as const },
      ]),
      leadsWithTags: vi.fn(async () => [{
        lead: mkLead({ qualification_data: { purpose: 'inversion', budget_ok: null, timeline: null, financing_needed: null, decision_maker: null } }),
        tagIds: [],
        lastUserMessageAt: daysAgo(10),
      }]),
    })
    const res = await runDailyRadar(deps)
    expect(res.newListings).toBe(1)
    expect(res.campaignsCreated).toBe(1)
    const camp = deps.created[0] as { kind: string; listing_slug: string; recipients: { variables: string[] }[] }
    expect(camp.kind).toBe('opportunity')
    expect(camp.listing_slug).toBe('nuevo')
    expect(camp.recipients[0].variables).toEqual(['Carlos', 'Torre Nueva'])
  })

  it('listing nuevo sin matches solo se registra', async () => {
    const deps = makeDeps({
      getAllProjects: vi.fn(async () => [
        { slug: 'viejo', name: 'Viejo', type: 'Casa', location: 'X', description: '', status: 'ok' },
        { slug: 'nuevo', name: 'Bodega', type: 'Industrial', location: 'Z', description: '', status: 'ok' },
      ]),
      leadsWithTags: vi.fn(async () => []),
    })
    const res = await runDailyRadar(deps)
    expect(res.newListings).toBe(1)
    expect(res.campaignsCreated).toBe(0)
  })
})

describe('sendCampaign', () => {
  const recipient = (over: Record<string, unknown> = {}) => ({
    id: 'rec1', campaign_id: 'camp1', lead_id: 'l1', included: true,
    variables: ['Carlos', 'Portacelli'], match_reason: null, status: 'pending' as const,
    wa_message_id: null, error: null, sent_at: null,
    lead: { id: 'l1', phone: '50312345678', name: 'Carlos' },
    ...over,
  })

  it('envía a incluidos, guarda en historial y marca last_proactive_at', async () => {
    const deps = makeDeps({
      getCampaignForSend: vi.fn(async () => ({
        campaign: { id: 'camp1', kind: 'recontact' as const, status: 'sending' as const, title: 't', reason: null, rule_id: null, listing_slug: null, template_id: 'tpl1', approved_by: null, created_at: '', approved_at: null },
        template,
        recipients: [recipient(), recipient({ id: 'rec2', included: false, lead_id: 'l2', lead: { id: 'l2', phone: '503', name: 'B' } })],
      })),
    })
    const res = await sendCampaign('camp1', deps)
    expect(res).toEqual({ sent: 1, failed: 0 })
    expect(deps.sendTemplate).toHaveBeenCalledTimes(1)
    expect(deps.sendTemplate).toHaveBeenCalledWith('50312345678', 'recontacto_seguimiento', 'es', ['Carlos', 'Portacelli'])
    expect(deps.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'l1', role: 'assistant',
      content: 'Hola Carlos, ¿sigues interesado en Portacelli?',
      waMessageId: 'wamid.x',
    }))
    expect(deps.claimRecipient).toHaveBeenCalledWith('rec1')
    expect(deps.updateLead).toHaveBeenCalledWith('l1', expect.objectContaining({ last_proactive_at: expect.any(String) }))
    expect(deps.markRecipient).toHaveBeenCalledWith('rec2', { status: 'skipped' })
    expect(deps.setCampaignStatus).toHaveBeenLastCalledWith('camp1', { status: 'done' })
  })

  it('fallo individual marca failed y continúa', async () => {
    const deps = makeDeps({
      getCampaignForSend: vi.fn(async () => ({
        campaign: { id: 'camp1', kind: 'recontact' as const, status: 'sending' as const, title: 't', reason: null, rule_id: null, listing_slug: null, template_id: 'tpl1', approved_by: null, created_at: '', approved_at: null },
        template,
        recipients: [
          recipient({ id: 'recA', lead_id: 'a', lead: { id: 'a', phone: '1', name: 'A' } }),
          recipient({ id: 'recB', lead_id: 'b', lead: { id: 'b', phone: '2', name: 'B' } }),
        ],
      })),
      sendTemplate: vi.fn()
        .mockRejectedValueOnce(new Error('Meta 131026'))
        .mockResolvedValueOnce('wamid.ok'),
    })
    const res = await sendCampaign('camp1', deps)
    expect(res).toEqual({ sent: 1, failed: 1 })
    expect(deps.markRecipient).toHaveBeenCalledWith('recA', expect.objectContaining({ status: 'failed', error: 'Meta 131026' }))
  })

  it('si el claim falla (otra ejecución lo tomó), NO envía — sin doble gasto', async () => {
    const deps = makeDeps({
      claimRecipient: vi.fn(async () => false),
      getCampaignForSend: vi.fn(async () => ({
        campaign: { id: 'camp1', kind: 'recontact' as const, status: 'sending' as const, title: 't', reason: null, rule_id: null, listing_slug: null, template_id: 'tpl1', approved_by: null, created_at: '', approved_at: null },
        template,
        recipients: [recipient()],
      })),
    })
    const res = await sendCampaign('camp1', deps)
    expect(res).toEqual({ sent: 0, failed: 0 })
    expect(deps.sendTemplate).not.toHaveBeenCalled()
  })

  it('índice único de campaña duplicada hace skip silencioso', async () => {
    const deps = makeDeps({
      createCampaign: vi.fn(async () => { throw new Error('duplicate key value violates unique constraint "uniq_campaign_rule_day"') }),
    })
    const res = await runRecontactRules(deps)
    expect(res.campaignsCreated).toBe(0)
  })
})
