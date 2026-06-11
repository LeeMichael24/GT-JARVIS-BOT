import type { InboxLead } from '@/lib/panel-data'
import type { LeadStage } from '@/types'

export interface InboxFilters {
  search: string
  stage: string
  tagId: string
  assigned: string
  botState: string
}

export const EMPTY_FILTERS: InboxFilters = {
  search: '',
  stage: '',
  tagId: '',
  assigned: '',
  botState: '',
}

export function filterInboxLeads(items: InboxLead[], f: InboxFilters): InboxLead[] {
  return items.filter(({ lead, tags }) => {
    const q = f.search.trim().toLowerCase()
    if (q && !(lead.name ?? '').toLowerCase().includes(q) && !lead.phone.includes(q)) return false
    if (f.stage && lead.stage !== f.stage) return false
    if (f.tagId && !tags.some(t => t.id === f.tagId)) return false
    if (f.assigned && lead.assigned_to !== f.assigned) return false
    if (f.botState === 'on' && !lead.bot_active) return false
    if (f.botState === 'off' && lead.bot_active) return false
    return true
  })
}

export const KANBAN_STAGES: { value: LeadStage; label: string }[] = [
  { value: 'new', label: 'Nuevo' },
  { value: 'warm', label: 'Tibio' },
  { value: 'hot', label: 'Caliente' },
  { value: 'cold', label: 'Frío' },
]

export function groupByStage(items: InboxLead[]): Record<LeadStage, InboxLead[]> {
  const groups: Record<LeadStage, InboxLead[]> = { new: [], warm: [], hot: [], cold: [] }
  for (const item of items) {
    const bucket = groups[item.lead.stage] ?? groups.cold
    bucket.push(item)
  }
  return groups
}
