'use client'

import { useEffect, useMemo, useState } from 'react'
import { InboxList } from '@/components/panel/InboxList'
import { KanbanBoard } from '@/components/panel/KanbanBoard'
import { EMPTY_FILTERS, filterInboxLeads, type InboxFilters } from '@/components/panel/inbox-filtering'
import type { InboxLead } from '@/lib/panel-data'
import type { Tag, TeamMember } from '@/types'

type Vista = 'lista' | 'kanban'

export function InboxViews({ items, tags, team, isAdmin }: {
  items: InboxLead[]
  tags: Tag[]
  team: TeamMember[]
  isAdmin: boolean
}) {
  const [filters, setFilters] = useState<InboxFilters>(EMPTY_FILTERS)
  const [vista, setVista] = useState<Vista>('lista')

  // Leer en effect (no en init) para no romper la hidratación SSR
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.localStorage.getItem('panel-vista') === 'kanban') setVista('kanban')
  }, [])

  function cambiarVista(v: Vista) {
    setVista(v)
    window.localStorage.setItem('panel-vista', v)
  }

  const filtered = useMemo(() => filterInboxLeads(items, filters), [items, filters])
  const set = (patch: Partial<InboxFilters>) => setFilters(f => ({ ...f, ...patch }))

  const selectCls = 'rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300'
  const toggleCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-emerald-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Vista">
          <button role="tab" aria-selected={vista === 'lista'} onClick={() => cambiarVista('lista')} className={toggleCls(vista === 'lista')}>
            ☰ Lista
          </button>
          <button role="tab" aria-selected={vista === 'kanban'} onClick={() => cambiarVista('kanban')} className={toggleCls(vista === 'kanban')}>
            ▦ Kanban
          </button>
        </div>
        <input
          value={filters.search}
          onChange={e => set({ search: e.target.value })}
          placeholder="Buscar nombre o teléfono…"
          aria-label="Buscar"
          className="min-w-40 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600"
        />
        <select value={filters.stage} onChange={e => set({ stage: e.target.value })} aria-label="Filtrar por etapa" className={selectCls}>
          <option value="">Etapa</option>
          <option value="new">Nuevo</option>
          <option value="warm">Tibio</option>
          <option value="hot">Caliente</option>
          <option value="cold">Frío</option>
        </select>
        <select value={filters.tagId} onChange={e => set({ tagId: e.target.value })} aria-label="Filtrar por tag" className={selectCls}>
          <option value="">Tag</option>
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {isAdmin && (
          <select value={filters.assigned} onChange={e => set({ assigned: e.target.value })} aria-label="Filtrar por asesor" className={selectCls}>
            <option value="">Asesor</option>
            {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <select value={filters.botState} onChange={e => set({ botState: e.target.value })} aria-label="Filtrar por estado del bot" className={selectCls}>
          <option value="">Bot</option>
          <option value="on">Daniela activa</option>
          <option value="off">Pausado</option>
        </select>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        {vista === 'kanban'
          ? <KanbanBoard items={filtered} />
          : <InboxList items={filtered} />}
      </div>
    </div>
  )
}
