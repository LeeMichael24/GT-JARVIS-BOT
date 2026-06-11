'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { updateLeadStage } from '@/app/panel/actions'
import { groupByStage, KANBAN_STAGES } from '@/components/panel/inbox-filtering'
import type { InboxLead } from '@/lib/panel-data'
import type { LeadStage } from '@/types'

const ERROR_TEXT: Record<string, string> = {
  FORBIDDEN: 'No tienes acceso a este lead.',
  UNAUTHORIZED: 'Sesión expirada. Vuelve a entrar.',
}

const COLUMN_ACCENT: Record<LeadStage, string> = {
  new: 'border-sky-800',
  warm: 'border-amber-800',
  hot: 'border-red-800',
  cold: 'border-zinc-700',
}

export function KanbanBoard({ items }: { items: InboxLead[] }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Override optimista: leadId → etapa destino; se limpia cuando llegan items frescos
  const [overrides, setOverrides] = useState<Record<string, LeadStage>>({})

  useEffect(() => { setOverrides({}) }, [items])

  const effective = items.map(it =>
    overrides[it.lead.id]
      ? { ...it, lead: { ...it.lead, stage: overrides[it.lead.id] } }
      : it
  )
  const groups = groupByStage(effective)

  function move(leadId: string, stage: LeadStage) {
    setError(null)
    setOverrides(o => ({ ...o, [leadId]: stage }))
    startTransition(async () => {
      const res = await updateLeadStage(leadId, stage)
      if (!res.ok) {
        setOverrides(o => {
          const { [leadId]: _drop, ...rest } = o
          return rest
        })
        setError(ERROR_TEXT[res.error] ?? 'No se pudo mover. Reintenta.')
      }
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && <p className="mb-2 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}
      <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {KANBAN_STAGES.map(({ value, label }) => (
          <section
            key={value}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const leadId = e.dataTransfer.getData('text/lead-id')
              if (leadId) move(leadId, value)
            }}
            aria-label={`Columna ${label}`}
            className={`flex min-h-0 w-[85vw] shrink-0 snap-center flex-col rounded-xl border-t-2 bg-zinc-900/40 sm:w-72 lg:w-auto lg:flex-1 lg:shrink ${COLUMN_ACCENT[value]}`}
          >
            <h3 className="flex items-center justify-between px-3 py-2 text-sm font-medium text-zinc-300">
              {label}
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                {groups[value].length}
              </span>
            </h3>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {groups[value].map(({ lead, snippet, tags, assignedName }) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/lead-id', lead.id)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/panel/chat/${lead.id}`} className="font-medium text-white hover:underline">
                      {lead.name ?? lead.phone}
                    </Link>
                    {!lead.bot_active && <span title="Daniela pausada">✋</span>}
                  </div>
                  {snippet && <p className="mt-1 truncate text-xs text-zinc-500">{snippet}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {tags.map(t => (
                      <span
                        key={t.id}
                        className="rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ backgroundColor: `${t.color}33`, color: t.color }}
                      >
                        {t.name}
                      </span>
                    ))}
                    {assignedName && <span className="text-[10px] text-zinc-600">→ {assignedName}</span>}
                  </div>
                  <select
                    value=""
                    disabled={isPending}
                    aria-label={`Mover ${lead.name ?? lead.phone} de etapa`}
                    onChange={e => {
                      const s = e.target.value as LeadStage
                      if (s) move(lead.id, s)
                    }}
                    className="mt-2 w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] text-zinc-400"
                  >
                    <option value="">Mover a…</option>
                    {KANBAN_STAGES.filter(s => s.value !== lead.stage).map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              ))}
              {groups[value].length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-zinc-600">Vacío</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
