'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { InboxList } from '@/components/panel/InboxList'
import { KanbanBoard } from '@/components/panel/KanbanBoard'
import { EMPTY_FILTERS, filterInboxLeads, type InboxFilters } from '@/components/panel/inbox-filtering'
import { deleteLeadsBatch } from '@/app/panel/actions'
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
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.localStorage.getItem('panel-vista') === 'kanban') setVista('kanban')
  }, [])

  function cambiarVista(v: Vista) {
    setVista(v)
    window.localStorage.setItem('panel-vista', v)
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filtered.map(i => i.lead.id)))
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  function handleDelete() {
    if (selected.size === 0) return
    const count = selected.size
    if (!window.confirm(`Eliminar ${count} lead${count > 1 ? 's' : ''}? Esto borra todas sus conversaciones y datos.`)) return
    startTransition(async () => {
      await deleteLeadsBatch(Array.from(selected))
      exitSelectMode()
    })
  }

  const filtered = useMemo(() => filterInboxLeads(items, filters), [items, filters])
  const set = (patch: Partial<InboxFilters>) => setFilters(f => ({ ...f, ...patch }))

  const hasActiveFilters = filters.stage || filters.tagId || filters.assigned || filters.botState
  const activeFilterCount = [filters.stage, filters.tagId, filters.assigned, filters.botState].filter(Boolean).length

  const selectCls = 'w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-300 sm:w-auto sm:py-1.5'
  const toggleCls = (active: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:py-1.5 ${active ? 'bg-emerald-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4">
      {/* Selection bar */}
      {selectMode ? (
        <div className="flex items-center gap-2">
          <button onClick={exitSelectMode} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:text-white sm:py-1.5">
            Cancelar
          </button>
          <button onClick={selectAll} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:text-white sm:py-1.5">
            Todos ({filtered.length})
          </button>
          <span className="flex-1 text-center text-sm text-zinc-400">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleDelete}
            disabled={selected.size === 0 || isPending}
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40 sm:py-1.5"
          >
            {isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 gap-1" role="tablist" aria-label="Vista">
            <button role="tab" aria-selected={vista === 'lista'} onClick={() => cambiarVista('lista')} className={toggleCls(vista === 'lista')}>
              Lista
            </button>
            <button role="tab" aria-selected={vista === 'kanban'} onClick={() => cambiarVista('kanban')} className={toggleCls(vista === 'kanban')}>
              Kanban
            </button>
          </div>
          <input
            value={filters.search}
            onChange={e => set({ search: e.target.value })}
            placeholder="Buscar..."
            aria-label="Buscar"
            className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600 sm:py-1.5"
          />
          {isAdmin && (
            <button
              onClick={() => { if (vista === 'kanban') cambiarVista('lista'); setSelectMode(true) }}
              title="Seleccionar para eliminar"
              className="shrink-0 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-900/40 sm:py-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="inline-block sm:hidden">
                <path d="M2 4h12M5.3 4V2.7a.7.7 0 01.7-.7h4a.7.7 0 01.7.7V4M6.5 7v4.5M9.5 7v4.5M3.5 4l.7 9.3a1 1 0 001 .7h5.6a1 1 0 001-.7L12.5 4" />
              </svg>
              <span className="hidden sm:inline">Eliminar</span>
            </button>
          )}
          <button
            onClick={() => setShowFilters(f => !f)}
            aria-label="Filtros"
            className={`relative flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors sm:hidden ${
              hasActiveFilters ? 'border-emerald-700 bg-emerald-950 text-emerald-400' : 'border-zinc-800 bg-zinc-900 text-zinc-400'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 2h14M3 6h10M5 10h6M7 14h2" />
            </svg>
            {activeFilterCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Desktop filters */}
      {!selectMode && (
        <div className="mt-2 hidden flex-wrap items-center gap-2 sm:flex">
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
          {hasActiveFilters && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-zinc-500 hover:text-zinc-300">
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Mobile filters */}
      {!selectMode && showFilters && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 sm:hidden">
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
          {hasActiveFilters && (
            <button onClick={() => { setFilters(EMPTY_FILTERS); setShowFilters(false) }} className="col-span-2 rounded-lg bg-zinc-800 py-1.5 text-xs text-zinc-400 hover:text-white">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-zinc-500">
        {filtered.length} de {items.length} conversaciones
      </p>

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        {vista === 'kanban'
          ? <KanbanBoard items={filtered} />
          : <InboxList items={filtered} selectMode={selectMode} selected={selected} onToggle={toggleSelect} />}
      </div>
    </div>
  )
}
