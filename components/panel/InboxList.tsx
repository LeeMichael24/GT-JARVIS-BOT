'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { InboxLead } from '@/lib/panel-data'
import type { Tag, TeamMember } from '@/types'

const STAGE_STYLES: Record<string, string> = {
  new: 'bg-sky-900 text-sky-300',
  warm: 'bg-amber-900 text-amber-300',
  hot: 'bg-red-900 text-red-300',
  cold: 'bg-zinc-800 text-zinc-400',
}

export function InboxList({ items, tags, team, isAdmin }: {
  items: InboxLead[]
  tags: Tag[]
  team: TeamMember[]
  isAdmin: boolean
}) {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')
  const [tagId, setTagId] = useState('')
  const [assigned, setAssigned] = useState('')
  const [botState, setBotState] = useState('')

  const filtered = useMemo(() => items.filter(({ lead, tags: leadTags }) => {
    const q = search.trim().toLowerCase()
    if (q && !(lead.name ?? '').toLowerCase().includes(q) && !lead.phone.includes(q)) return false
    if (stage && lead.stage !== stage) return false
    if (tagId && !leadTags.some(t => t.id === tagId)) return false
    if (assigned && lead.assigned_to !== assigned) return false
    if (botState === 'on' && !lead.bot_active) return false
    if (botState === 'off' && lead.bot_active) return false
    return true
  }), [items, search, stage, tagId, assigned, botState])

  const selectCls = 'rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 py-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar nombre o teléfono…"
          className="min-w-40 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600"
        />
        <select value={stage} onChange={e => setStage(e.target.value)} className={selectCls}>
          <option value="">Etapa</option>
          <option value="new">Nuevo</option>
          <option value="warm">Tibio</option>
          <option value="hot">Caliente</option>
          <option value="cold">Frío</option>
        </select>
        <select value={tagId} onChange={e => setTagId(e.target.value)} className={selectCls}>
          <option value="">Tag</option>
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {isAdmin && (
          <select value={assigned} onChange={e => setAssigned(e.target.value)} className={selectCls}>
            <option value="">Asesor</option>
            {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <select value={botState} onChange={e => setBotState(e.target.value)} className={selectCls}>
          <option value="">Bot</option>
          <option value="on">Daniela activa</option>
          <option value="off">Pausado</option>
        </select>
      </div>

      <ul className="mt-4 divide-y divide-zinc-900">
        {filtered.map(({ lead, snippet, snippetRole, tags: leadTags, assignedName }) => (
          <li key={lead.id}>
            <Link href={`/panel/chat/${lead.id}`} className="flex flex-col gap-1 rounded-lg px-3 py-3 hover:bg-zinc-900">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white">{lead.name ?? lead.phone}</span>
                <span className="text-xs text-zinc-500">
                  {new Date(lead.last_message_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm text-zinc-400">
                  {snippet
                    ? (snippetRole === 'user' ? '' : '↩ ') + snippet
                    : 'Sin mensajes'}
                </p>
                {!lead.bot_active && <span title="Daniela pausada">✋</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${STAGE_STYLES[lead.stage] ?? STAGE_STYLES.cold}`}>
                  {lead.stage}
                </span>
                {leadTags.map(t => (
                  <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: `${t.color}33`, color: t.color }}>
                    {t.name}
                  </span>
                ))}
                {assignedName && <span className="text-[11px] text-zinc-500">→ {assignedName}</span>}
              </div>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="py-10 text-center text-sm text-zinc-500">Sin conversaciones que coincidan</li>
        )}
      </ul>
    </div>
  )
}
