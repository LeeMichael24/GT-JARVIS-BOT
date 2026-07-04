'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { updateLeadStage } from '@/app/panel/actions'
import { groupByStage, KANBAN_STAGES } from '@/components/panel/inbox-filtering'
import { scoreLead, SCORE_STYLES } from '@/lib/lead-scoring'
import type { InboxLead } from '@/lib/panel-data'
import type { LeadStage } from '@/types'

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  meta_ad: { label: 'Meta Ad', cls: 'bg-purple-900/60 text-purple-300' },
  google_ad: { label: 'Google Ad', cls: 'bg-blue-900/60 text-blue-300' },
  referral: { label: 'Referido', cls: 'bg-teal-900/60 text-teal-300' },
  website: { label: 'Web', cls: 'bg-cyan-900/60 text-cyan-300' },
}

const ERROR_TEXT: Record<string, string> = {
  FORBIDDEN: 'No tienes acceso a este lead.',
  UNAUTHORIZED: 'Sesión expirada. Vuelve a entrar.',
}

const COLUMN_ACCENT: Record<LeadStage, string> = {
  new: 'border-sky-700',
  warm: 'border-amber-700',
  hot: 'border-red-700',
  cold: 'border-zinc-600',
}

const COLUMN_BG: Record<LeadStage, string> = {
  new: 'bg-sky-950/20',
  warm: 'bg-amber-950/20',
  hot: 'bg-red-950/20',
  cold: 'bg-zinc-900/30',
}

export function KanbanBoard({ items }: { items: InboxLead[] }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Override optimista: leadId → etapa destino; se limpia cuando llegan items frescos
  const [overrides, setOverrides] = useState<Record<string, LeadStage>>({})

  // Items frescos del server ya traen la etapa real: limpiar overrides optimistas
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
          const rest = { ...o }
          delete rest[leadId]
          return rest
        })
        setError(ERROR_TEXT[res.error] ?? 'No se pudo mover. Reintenta.')
      }
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && <p className="mb-2 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}
      <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
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
            className={`flex min-h-0 w-[80vw] shrink-0 snap-center flex-col rounded-xl border-t-2 sm:w-64 lg:w-auto lg:flex-1 lg:shrink ${COLUMN_ACCENT[value]} ${COLUMN_BG[value]}`}
          >
            <h3 className="flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-zinc-300">
              {label}
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-800 px-1.5 text-[11px] text-zinc-400">
                {groups[value].length}
              </span>
            </h3>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {groups[value].map(({ lead, snippet, tags, assignedName, sourceType }) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/lead-id', lead.id)}
                  className="flex h-[140px] cursor-grab flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-3 transition-shadow active:cursor-grabbing active:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/panel/chat/${lead.id}`} className="truncate font-medium text-white hover:underline">
                      {lead.name ?? lead.phone}
                    </Link>
                    <span className="flex shrink-0 items-center gap-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${SCORE_STYLES[scoreLead(lead).score]}`}
                        title={scoreLead(lead).reasons.join(' · ') || 'Sin señales aún'}
                      >
                        {scoreLead(lead).score}
                      </span>
                      {!lead.bot_active && <span className="text-xs" title="Daniela pausada">✋</span>}
                    </span>
                  </div>
                  {snippet && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{snippet}</p>}
                  <div className="mt-auto flex items-center gap-1 overflow-hidden">
                    {sourceType && SOURCE_BADGE[sourceType] && (
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_BADGE[sourceType].cls}`}>
                        {SOURCE_BADGE[sourceType].label}
                      </span>
                    )}
                    {tags.slice(0, 2).map(t => (
                      <span
                        key={t.id}
                        className="shrink-0 truncate rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ backgroundColor: `${t.color}33`, color: t.color, maxWidth: '80px' }}
                      >
                        {t.name}
                      </span>
                    ))}
                    {tags.length > 2 && <span className="shrink-0 text-[10px] text-zinc-500">+{tags.length - 2}</span>}
                    {assignedName && <span className="shrink-0 text-[10px] text-zinc-600">{assignedName}</span>}
                  </div>
                  <select
                    value=""
                    disabled={isPending}
                    aria-label={`Mover ${lead.name ?? lead.phone} de etapa`}
                    onChange={e => {
                      const s = e.target.value as LeadStage
                      if (s) move(lead.id, s)
                    }}
                    className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-400"
                  >
                    <option value="">Mover a...</option>
                    {KANBAN_STAGES.filter(s => s.value !== lead.stage).map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              ))}
              {groups[value].length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-zinc-600">Sin leads</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
