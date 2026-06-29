import { describe, it, expect } from 'vitest'
import {
  EMPTY_FILTERS,
  filterInboxLeads,
  groupByStage,
  KANBAN_STAGES,
} from '@/components/panel/inbox-filtering'
import type { InboxLead } from '@/lib/panel-data'
import type { LeadStage } from '@/types'

function makeItem(over: {
  id?: string; name?: string | null; phone?: string; stage?: LeadStage
  botActive?: boolean; assignedTo?: string | null; tagIds?: string[]
}): InboxLead {
  return {
    lead: {
      id: over.id ?? 'l1',
      phone: over.phone ?? '50311112222',
      name: over.name === undefined ? 'Carlos' : over.name,
      stage: over.stage ?? 'new',
      bot_active: over.botActive ?? true,
      project_interest: null,
      qualification_data: null,
      assigned_to: over.assignedTo ?? null,
      first_message_at: '',
      last_message_at: '2026-06-11T10:00:00Z',
      created_at: '',
    } as InboxLead['lead'],
    snippet: 'hola',
    snippetRole: 'user',
    tags: (over.tagIds ?? []).map(id => ({ id, name: `tag-${id}`, color: '#fff', created_at: '' })),
    assignedName: null,
    sourceType: null,
  }
}

describe('filterInboxLeads', () => {
  it('sin filtros devuelve todo', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })]
    expect(filterInboxLeads(items, EMPTY_FILTERS)).toHaveLength(2)
  })

  it('busca por nombre (case-insensitive)', () => {
    const items = [makeItem({ id: 'a', name: 'María López' }), makeItem({ id: 'b', name: 'Pedro' })]
    const out = filterInboxLeads(items, { ...EMPTY_FILTERS, search: 'maría' })
    expect(out.map(i => i.lead.id)).toEqual(['a'])
  })

  it('busca por teléfono', () => {
    const items = [makeItem({ id: 'a', phone: '50377778888' }), makeItem({ id: 'b' })]
    const out = filterInboxLeads(items, { ...EMPTY_FILTERS, search: '7777' })
    expect(out.map(i => i.lead.id)).toEqual(['a'])
  })

  it('busca aunque el nombre sea null', () => {
    const items = [makeItem({ id: 'a', name: null, phone: '50399990000' })]
    const out = filterInboxLeads(items, { ...EMPTY_FILTERS, search: '9999' })
    expect(out).toHaveLength(1)
  })

  it('filtra por etapa', () => {
    const items = [makeItem({ id: 'a', stage: 'hot' }), makeItem({ id: 'b', stage: 'cold' })]
    const out = filterInboxLeads(items, { ...EMPTY_FILTERS, stage: 'hot' })
    expect(out.map(i => i.lead.id)).toEqual(['a'])
  })

  it('filtra por tag', () => {
    const items = [makeItem({ id: 'a', tagIds: ['t1'] }), makeItem({ id: 'b', tagIds: ['t2'] })]
    const out = filterInboxLeads(items, { ...EMPTY_FILTERS, tagId: 't1' })
    expect(out.map(i => i.lead.id)).toEqual(['a'])
  })

  it('filtra por asesor asignado', () => {
    const items = [makeItem({ id: 'a', assignedTo: 'm1' }), makeItem({ id: 'b', assignedTo: 'm2' })]
    const out = filterInboxLeads(items, { ...EMPTY_FILTERS, assigned: 'm1' })
    expect(out.map(i => i.lead.id)).toEqual(['a'])
  })

  it('filtra bot activo y pausado', () => {
    const items = [makeItem({ id: 'a', botActive: true }), makeItem({ id: 'b', botActive: false })]
    expect(filterInboxLeads(items, { ...EMPTY_FILTERS, botState: 'on' }).map(i => i.lead.id)).toEqual(['a'])
    expect(filterInboxLeads(items, { ...EMPTY_FILTERS, botState: 'off' }).map(i => i.lead.id)).toEqual(['b'])
  })

  it('combina filtros (AND)', () => {
    const items = [
      makeItem({ id: 'a', stage: 'hot', tagIds: ['t1'] }),
      makeItem({ id: 'b', stage: 'hot', tagIds: ['t2'] }),
      makeItem({ id: 'c', stage: 'cold', tagIds: ['t1'] }),
    ]
    const out = filterInboxLeads(items, { ...EMPTY_FILTERS, stage: 'hot', tagId: 't1' })
    expect(out.map(i => i.lead.id)).toEqual(['a'])
  })
})

describe('groupByStage', () => {
  it('agrupa en las 4 etapas preservando el orden', () => {
    const items = [
      makeItem({ id: 'a', stage: 'hot' }),
      makeItem({ id: 'b', stage: 'new' }),
      makeItem({ id: 'c', stage: 'hot' }),
    ]
    const g = groupByStage(items)
    expect(g.hot.map(i => i.lead.id)).toEqual(['a', 'c'])
    expect(g.new.map(i => i.lead.id)).toEqual(['b'])
    expect(g.warm).toEqual([])
    expect(g.cold).toEqual([])
  })

  it('una etapa desconocida cae al bucket cold (defensivo)', () => {
    const weird = makeItem({ id: 'x' })
    ;(weird.lead as { stage: string }).stage = 'rarisima'
    const g = groupByStage([weird])
    expect(g.cold.map(i => i.lead.id)).toEqual(['x'])
  })

  it('KANBAN_STAGES define las 4 columnas en orden', () => {
    expect(KANBAN_STAGES.map(s => s.value)).toEqual(['new', 'warm', 'hot', 'cold'])
  })
})
