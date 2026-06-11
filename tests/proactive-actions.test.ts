import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  member: null as { id: string; role: string } | null,
  campaign: null as Record<string, unknown> | null,
  lead: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/auth', () => ({
  requireMember: vi.fn(async () => {
    if (!state.member) throw new Error('UNAUTHORIZED')
    return state.member
  }),
  requireAdmin: vi.fn(async () => {
    if (!state.member) throw new Error('UNAUTHORIZED')
    if (state.member.role !== 'admin') throw new Error('FORBIDDEN')
    return state.member
  }),
}))

const serviceChain = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  return chain
})
const db = vi.hoisted(() => ({
  getServiceClient: vi.fn(() => serviceChain),
  getLeadById: vi.fn(async () => state.lead),
  updateLead: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase', () => db)

const engine = vi.hoisted(() => ({
  sendCampaign: vi.fn(async () => ({ sent: 2, failed: 0 })),
}))
vi.mock('@/lib/proactive/engine', () => engine)

const pdata = vi.hoisted(() => ({
  // Espeja el claim real: true solo si el estado actual coincide con fromStatus
  claimCampaign: vi.fn(async (_id: string, fromStatus: string) => state.campaign?.status === fromStatus),
  markRecipient: vi.fn(async () => {}),
}))
vi.mock('@/lib/proactive/data', () => pdata)

vi.mock('next/cache', () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }))

import {
  approveCampaign, rejectCampaign, setLeadOptOut, createRecontactRule,
} from '@/app/panel/proactive-actions'

const admin = { id: 'adm1', role: 'admin' }
const asesor = { id: 'ase1', role: 'asesor' }

beforeEach(() => {
  vi.clearAllMocks()
  state.member = null
  state.campaign = { status: 'pending_approval' }
  state.lead = { id: 'lead-1', assigned_to: 'ase1' }
  for (const k of Object.keys(serviceChain)) delete serviceChain[k]
  const methods = ['from', 'insert', 'update', 'delete', 'eq', 'select', 'maybeSingle'] as const
  for (const m of methods) {
    serviceChain[m] = vi.fn(() => Object.assign(Promise.resolve({ error: null, data: null, count: 0 }), serviceChain))
  }
})

describe('approveCampaign', () => {
  it('solo admin', async () => {
    state.member = asesor
    const res = await approveCampaign('camp1')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(engine.sendCampaign).not.toHaveBeenCalled()
  })

  it('admin aprueba: claim atómico sending+aprobador y envía', async () => {
    state.member = admin
    const res = await approveCampaign('camp1')
    expect(res).toEqual({ ok: true })
    expect(pdata.claimCampaign).toHaveBeenCalledWith('camp1', 'pending_approval', expect.objectContaining({
      status: 'sending', approved_by: 'adm1',
    }))
    expect(engine.sendCampaign).toHaveBeenCalledWith('camp1')
  })

  it('no aprueba campañas que no están pendientes', async () => {
    state.member = admin
    state.campaign = { status: 'done' }
    const res = await approveCampaign('camp1')
    expect(res).toEqual({ ok: false, error: 'NOT_PENDING' })
    expect(engine.sendCampaign).not.toHaveBeenCalled()
  })
})

describe('rejectCampaign', () => {
  it('admin rechaza', async () => {
    state.member = admin
    const res = await rejectCampaign('camp1')
    expect(res).toEqual({ ok: true })
    expect(pdata.claimCampaign).toHaveBeenCalledWith('camp1', 'pending_approval', { status: 'rejected' })
  })
})

describe('setLeadOptOut', () => {
  it('asesor con acceso puede marcar opt-out manual', async () => {
    state.member = asesor
    const res = await setLeadOptOut('lead-1', true)
    expect(res).toEqual({ ok: true })
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { opted_out: true })
  })
  it('asesor sin acceso no puede', async () => {
    state.member = asesor
    state.lead = { id: 'lead-1', assigned_to: 'otro' }
    const res = await setLeadOptOut('lead-1', true)
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})

describe('createRecontactRule', () => {
  it('valida días y tope', async () => {
    state.member = admin
    expect(await createRecontactRule({ name: 'x', stages: null, tag_ids: null, days_inactive: 0, template_id: 't', max_per_run: 10 }))
      .toEqual({ ok: false, error: 'INVALID_DAYS' })
    expect(await createRecontactRule({ name: 'x', stages: null, tag_ids: null, days_inactive: 5, template_id: 't', max_per_run: 99 }))
      .toEqual({ ok: false, error: 'INVALID_MAX' })
  })
  it('solo admin', async () => {
    state.member = asesor
    expect(await createRecontactRule({ name: 'x', stages: null, tag_ids: null, days_inactive: 5, template_id: 't', max_per_run: 10 }))
      .toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})
