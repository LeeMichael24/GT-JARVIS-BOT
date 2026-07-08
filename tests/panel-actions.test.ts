import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  member: null as { id: string; name: string; email: string; role: string } | null,
  lead: null as Record<string, unknown> | null,
  lastUserAt: null as string | null,
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
  getLeadById: vi.fn(async () => null as unknown),
  getLatestUserMessageAt: vi.fn(async () => null as string | null),
  updateLead: vi.fn(async () => {}),
  saveConversation: vi.fn(async () => {}),
  getServiceClient: vi.fn(() => serviceChain),
}))
vi.mock('@/lib/supabase', () => db)

const wa = vi.hoisted(() => ({ sendText: vi.fn(async () => 'wamid.h1' as string | null) }))
vi.mock('@/services/whatsapp/client', () => wa)

vi.mock('next/cache', () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }))

import { sendHumanMessage, assignLead, setBotActive, addLeadTag, addNote, updateLeadStage, deleteTag, setMemberActive, createProjectScript, updateProjectScript } from '@/app/panel/actions'

const admin = { id: 'adm1', name: 'Michael', email: 'm@gt.com', role: 'admin' }
const asesor = { id: 'ase1', name: 'Ana', email: 'a@gt.com', role: 'asesor' }
const leadOfAna = {
  id: 'lead-1', phone: '50312345678', bot_active: true, assigned_to: 'ase1',
  stage: 'warm', name: 'Carlos',
}

beforeEach(() => {
  vi.clearAllMocks()
  state.member = null
  state.lead = null
  state.lastUserAt = null
  db.getLeadById.mockImplementation(async () => state.lead)
  db.getLatestUserMessageAt.mockImplementation(async () => state.lastUserAt)
  wa.sendText.mockImplementation(async () => 'wamid.h1')
  // reset chainable service mock
  for (const k of Object.keys(serviceChain)) delete serviceChain[k]
  const methods = ['from', 'insert', 'update', 'delete', 'eq', 'select', 'maybeSingle'] as const
  for (const m of methods) {
    serviceChain[m] = vi.fn(() => Object.assign(Promise.resolve({ error: null, data: null, count: 0 }), serviceChain))
  }
})

describe('sendHumanMessage', () => {
  it('rechaza sin sesión', async () => {
    const res = await sendHumanMessage('lead-1', 'hola')
    expect(res).toEqual({ ok: false, error: 'UNAUTHORIZED' })
    expect(wa.sendText).not.toHaveBeenCalled()
  })

  it('rechaza a un asesor sin acceso al lead', async () => {
    state.member = asesor
    state.lead = { ...leadOfAna, assigned_to: 'otro' }
    state.lastUserAt = new Date().toISOString()
    const res = await sendHumanMessage('lead-1', 'hola')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(wa.sendText).not.toHaveBeenCalled()
  })

  it('rechaza fuera de la ventana de 24h', async () => {
    state.member = admin
    state.lead = { ...leadOfAna }
    state.lastUserAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const res = await sendHumanMessage('lead-1', 'hola')
    expect(res).toEqual({ ok: false, error: 'WINDOW_EXPIRED' })
    expect(wa.sendText).not.toHaveBeenCalled()
  })

  it('pausa el bot ANTES de enviar, envía sin delay y guarda con sent_by', async () => {
    state.member = admin
    state.lead = { ...leadOfAna, assigned_to: null }
    state.lastUserAt = new Date().toISOString()
    const calls: string[] = []
    db.updateLead.mockImplementation(async () => { calls.push('pause') })
    wa.sendText.mockImplementation(async () => { calls.push('send'); return 'wamid.h1' })

    const res = await sendHumanMessage('lead-1', 'Hola, le atiende Michael')
    expect(res).toEqual({ ok: true })
    expect(calls).toEqual(['pause', 'send'])
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { bot_active: false, assigned_to: 'adm1' })
    expect(wa.sendText).toHaveBeenCalledWith('50312345678', 'Hola, le atiende Michael', { typingDelay: false })
    expect(db.saveConversation).toHaveBeenCalledWith({
      leadId: 'lead-1', role: 'human', content: 'Hola, le atiende Michael',
      waMessageId: 'wamid.h1', sentBy: 'adm1',
    })
  })

  it('no re-asigna si el lead ya tiene asesor', async () => {
    state.member = admin
    state.lead = { ...leadOfAna, assigned_to: 'ase1' }
    state.lastUserAt = new Date().toISOString()
    await sendHumanMessage('lead-1', 'hola')
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { bot_active: false })
  })

  it('rechaza texto vacío', async () => {
    state.member = admin
    state.lead = { ...leadOfAna }
    state.lastUserAt = new Date().toISOString()
    const res = await sendHumanMessage('lead-1', '   ')
    expect(res).toEqual({ ok: false, error: 'EMPTY' })
  })
})

describe('assignLead', () => {
  it('solo admin puede asignar', async () => {
    state.member = asesor
    const res = await assignLead('lead-1', 'ase1')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('admin asigna', async () => {
    state.member = admin
    state.lead = { ...leadOfAna }
    const res = await assignLead('lead-1', 'ase1')
    expect(res).toEqual({ ok: true })
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { assigned_to: 'ase1' })
  })
})

describe('setBotActive', () => {
  it('asesor con acceso puede reactivar a Daniela', async () => {
    state.member = asesor
    state.lead = { ...leadOfAna, bot_active: false }
    const res = await setBotActive('lead-1', true)
    expect(res).toEqual({ ok: true })
    expect(db.updateLead).toHaveBeenCalledWith('lead-1', { bot_active: true })
  })

  it('asesor sin acceso no puede', async () => {
    state.member = asesor
    state.lead = { ...leadOfAna, assigned_to: 'otro' }
    const res = await setBotActive('lead-1', true)
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})

describe('autorización de acciones restantes', () => {
  it('asesor sin acceso no puede etiquetar', async () => {
    state.member = asesor
    state.lead = { ...leadOfAna, assigned_to: 'otro' }
    const res = await addLeadTag('lead-1', 'tag-1')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(serviceChain.insert).not.toHaveBeenCalled()
  })

  it('asesor sin acceso no puede agregar notas', async () => {
    state.member = asesor
    state.lead = { ...leadOfAna, assigned_to: 'otro' }
    const res = await addNote('lead-1', 'nota')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(serviceChain.insert).not.toHaveBeenCalled()
  })

  it('asesor sin acceso no puede cambiar etapa', async () => {
    state.member = asesor
    state.lead = { ...leadOfAna, assigned_to: 'otro' }
    const res = await updateLeadStage('lead-1', 'hot')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(db.updateLead).not.toHaveBeenCalled()
  })

  it('asesor no puede borrar tags (solo admin)', async () => {
    state.member = asesor
    const res = await deleteTag('tag-1')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(serviceChain.delete).not.toHaveBeenCalled()
  })

  it('admin no puede desactivarse a sí mismo', async () => {
    state.member = admin
    const res = await setMemberActive('adm1', false)
    expect(res).toEqual({ ok: false, error: 'CANT_DEACTIVATE_SELF' })
    expect(serviceChain.update).not.toHaveBeenCalled()
  })
})

describe('guiones por proyecto (project_scripts)', () => {
  it('crear requiere admin', async () => {
    state.member = asesor
    const res = await createProjectScript('Portacelli', 'portacelli', 'PASO 1...')
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(serviceChain.insert).not.toHaveBeenCalled()
  })

  it('rechaza guion sin nombre o sin texto', async () => {
    state.member = admin
    expect(await createProjectScript('  ', 'portacelli', 'PASO 1')).toEqual({ ok: false, error: 'EMPTY' })
    expect(await createProjectScript('Portacelli', 'portacelli', '   ')).toEqual({ ok: false, error: 'EMPTY' })
  })

  it('rechaza guion sin keywords', async () => {
    state.member = admin
    const res = await createProjectScript('Portacelli', ' ,  , ', 'PASO 1...')
    expect(res).toEqual({ ok: false, error: 'NO_KEYWORDS' })
  })

  it('crea normalizando keywords (minúsculas, sin duplicados, trim)', async () => {
    state.member = admin
    const res = await createProjectScript('Portacelli', ' Portacelli, PORTA CELLI , portacelli ', 'PASO 1 — SALUDO\n"Buen día!"')
    expect(res).toEqual({ ok: true })
    expect(serviceChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      project_name: 'Portacelli',
      trigger_keywords: ['portacelli', 'porta celli'],
      active: true,
    }))
  })

  it('update parcial: keywords vacías rechazadas sin tocar DB', async () => {
    state.member = admin
    const res = await updateProjectScript('s1', { keywordsRaw: '  ' })
    expect(res).toEqual({ ok: false, error: 'NO_KEYWORDS' })
    expect(serviceChain.update).not.toHaveBeenCalled()
  })
})

