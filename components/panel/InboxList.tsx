'use client'

import Link from 'next/link'
import type { InboxLead } from '@/lib/panel-data'

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

export function InboxList({ items }: { items: InboxLead[] }) {
  return (
    <ul className="mx-auto w-full max-w-3xl flex-1 space-y-0.5 overflow-y-auto">
      {items.map(({ lead, snippet, snippetRole, tags, assignedName }) => (
        <li key={lead.id}>
          <Link
            href={`/panel/chat/${lead.id}`}
            className="flex flex-col gap-1.5 rounded-xl px-3 py-3 transition-colors active:bg-zinc-800 sm:rounded-lg sm:hover:bg-zinc-900"
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
            <div className="flex flex-wrap items-center gap-1.5 pl-[46px] sm:pl-[42px]">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STAGE_STYLES[lead.stage] ?? STAGE_STYLES.cold}`}>
                {STAGE_LABEL[lead.stage] ?? lead.stage}
              </span>
              {tags.map(t => (
                <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: `${t.color}33`, color: t.color }}>
                  {t.name}
                </span>
              ))}
              {assignedName && <span className="text-[11px] text-zinc-500">{assignedName}</span>}
            </div>
          </Link>
        </li>
      ))}
      {items.length === 0 && (
        <li className="py-16 text-center">
          <p className="text-sm text-zinc-500">Sin conversaciones</p>
          <p className="mt-1 text-xs text-zinc-600">Los nuevos chats de WhatsApp aparecerán aquí</p>
        </li>
      )}
    </ul>
  )
}
