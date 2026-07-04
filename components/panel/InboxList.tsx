'use client'

import Link from 'next/link'
import type { InboxLead } from '@/lib/panel-data'
import { scoreLead, SCORE_STYLES } from '@/lib/lead-scoring'

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  meta_ad: { label: 'Meta Ad', cls: 'bg-purple-900/60 text-purple-300' },
  google_ad: { label: 'Google Ad', cls: 'bg-blue-900/60 text-blue-300' },
  referral: { label: 'Referido', cls: 'bg-teal-900/60 text-teal-300' },
  website: { label: 'Web', cls: 'bg-cyan-900/60 text-cyan-300' },
}

const STAGE_STYLES: Record<string, string> = {
  new: 'bg-sky-900/60 text-sky-300',
  warm: 'bg-amber-900/60 text-amber-300',
  hot: 'bg-red-900/60 text-red-300',
  cold: 'bg-zinc-800 text-zinc-500',
}

const STAGE_LABEL: Record<string, string> = {
  new: 'Nuevo',
  warm: 'Tibio',
  hot: 'Caliente',
  cold: 'Frío',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(dateStr).toLocaleDateString('es-SV', { day: 'numeric', month: 'short' })
}

export function InboxList({ items, selectMode = false, selected, onToggle }: {
  items: InboxLead[]
  selectMode?: boolean
  selected?: Set<string>
  onToggle?: (id: string) => void
}) {
  return (
    <ul className="mx-auto w-full max-w-3xl flex-1 space-y-0.5 overflow-y-auto">
      {items.map(({ lead, snippet, snippetRole, tags, assignedName, sourceType }) => {
        const isSelected = selected?.has(lead.id) ?? false
        const scored = scoreLead(lead)

        if (selectMode) {
          return (
            <li key={lead.id}>
              <button
                onClick={() => onToggle?.(lead.id)}
                className={`flex h-[72px] w-full flex-col justify-center gap-1 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  isSelected ? 'bg-red-950/40 ring-1 ring-red-700/50' : 'hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    isSelected ? 'border-red-500 bg-red-600' : 'border-zinc-700 bg-zinc-900'
                  }`}>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="truncate font-medium text-white">{lead.name ?? lead.phone}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{lead.phone}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 overflow-hidden pl-8">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_STYLES[lead.stage] ?? STAGE_STYLES.cold}`}>
                    {STAGE_LABEL[lead.stage] ?? lead.stage}
                  </span>
                  {snippet && <p className="truncate text-xs text-zinc-500">{snippet}</p>}
                </div>
              </button>
            </li>
          )
        }

        return (
          <li key={lead.id}>
            <Link
              href={`/panel/chat/${lead.id}`}
              className="flex h-[88px] flex-col justify-center gap-1 rounded-xl px-3 py-2.5 transition-colors active:bg-zinc-800 sm:h-[80px] sm:rounded-lg sm:hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-300 sm:h-8 sm:w-8 sm:text-xs">
                    {(lead.name ?? lead.phone).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-white">{lead.name ?? lead.phone}</span>
                    <p className="truncate text-xs text-zinc-500 sm:hidden">{lead.phone}</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-zinc-500">
                  {timeAgo(lead.last_message_at)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pl-[46px] sm:pl-[42px]">
                <p className="truncate text-sm text-zinc-400">
                  {snippet
                    ? (snippetRole === 'user' ? '' : '↩ ') + snippet
                    : 'Sin mensajes'}
                </p>
                {!lead.bot_active && <span className="shrink-0 text-xs" title="Daniela pausada">✋</span>}
              </div>
              <div className="flex items-center gap-1.5 overflow-hidden pl-[46px] sm:pl-[42px]">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${SCORE_STYLES[scored.score]}`}
                  title={scored.reasons.join(' · ') || 'Sin señales aún'}
                >
                  {scored.score}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_STYLES[lead.stage] ?? STAGE_STYLES.cold}`}>
                  {STAGE_LABEL[lead.stage] ?? lead.stage}
                </span>
                {sourceType && SOURCE_BADGE[sourceType] && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${SOURCE_BADGE[sourceType].cls}`}>
                    {SOURCE_BADGE[sourceType].label}
                  </span>
                )}
                {tags.slice(0, 2).map(t => (
                  <span key={t.id} className="shrink-0 truncate rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: `${t.color}33`, color: t.color, maxWidth: '100px' }}>
                    {t.name}
                  </span>
                ))}
                {tags.length > 2 && <span className="shrink-0 text-[11px] text-zinc-500">+{tags.length - 2}</span>}
                {assignedName && <span className="shrink-0 text-[11px] text-zinc-500">{assignedName}</span>}
              </div>
            </Link>
          </li>
        )
      })}
      {items.length === 0 && (
        <li className="py-16 text-center">
          <p className="text-sm text-zinc-500">Sin conversaciones</p>
          <p className="mt-1 text-xs text-zinc-600">Los nuevos chats de WhatsApp aparecerán aquí</p>
        </li>
      )}
    </ul>
  )
}
