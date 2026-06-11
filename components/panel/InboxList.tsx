'use client'

import Link from 'next/link'
import type { InboxLead } from '@/lib/panel-data'

const STAGE_STYLES: Record<string, string> = {
  new: 'bg-sky-900 text-sky-300',
  warm: 'bg-amber-900 text-amber-300',
  hot: 'bg-red-900 text-red-300',
  cold: 'bg-zinc-800 text-zinc-400',
}

export function InboxList({ items }: { items: InboxLead[] }) {
  return (
    <ul className="mx-auto w-full max-w-3xl flex-1 divide-y divide-zinc-900 overflow-y-auto">
      {items.map(({ lead, snippet, snippetRole, tags, assignedName }) => (
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
              {tags.map(t => (
                <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: `${t.color}33`, color: t.color }}>
                  {t.name}
                </span>
              ))}
              {assignedName && <span className="text-[11px] text-zinc-500">→ {assignedName}</span>}
            </div>
          </Link>
        </li>
      ))}
      {items.length === 0 && (
        <li className="py-10 text-center text-sm text-zinc-500">Sin conversaciones que coincidan</li>
      )}
    </ul>
  )
}
