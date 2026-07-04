'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { sendHumanMessage, setBotActive } from '@/app/panel/actions'
import { LeadSheet } from '@/components/panel/LeadSheet'
import { ExpandableText } from '@/components/panel/ExpandableText'
import type { LeadBundle } from '@/lib/panel-data'
import type { SessionMember } from '@/lib/auth'
import type { Conversation } from '@/types'
import { isWithin24h } from '@/lib/wa-window'

const ERROR_TEXT: Record<string, string> = {
  WINDOW_EXPIRED: 'Fuera de la ventana de 24h — se necesita plantilla (Fase 5).',
  SEND_FAILED: 'No se pudo enviar. Revisa la conexión y reintenta.',
  FORBIDDEN: 'No tienes acceso a este chat.',
  UNAUTHORIZED: 'Sesión expirada. Vuelve a entrar.',
  EMPTY: 'Escribe un mensaje.',
}

function formatMsgTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
}

function formatMsgDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoy'
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-SV', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function ChatView({ bundle, member }: { bundle: LeadBundle; member: SessionMember }) {
  const router = useRouter()
  const [messages, setMessages] = useState<Conversation[]>(bundle.messages)
  const [botActive, setBotActiveState] = useState(bundle.lead.bot_active)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showSheet, setShowSheet] = useState(false)
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wasDisconnected = useRef(false)

  const within24h = useMemo(() => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    return isWithin24h(lastUser?.created_at ?? null)
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    setMessages(prev => {
      const byId = new Map(prev.map(m => [m.id, m]))
      for (const m of bundle.messages) byId.set(m.id, m)
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
  }, [bundle.messages])

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`chat-${bundle.lead.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversations',
        filter: `lead_id=eq.${bundle.lead.id}`,
      }, payload => {
        const msg = payload.new as Conversation
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'leads',
        filter: `id=eq.${bundle.lead.id}`,
      }, payload => {
        setBotActiveState((payload.new as { bot_active: boolean }).bot_active)
        router.refresh()
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED' && wasDisconnected.current) {
          wasDisconnected.current = false
          router.refresh()
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          wasDisconnected.current = true
        }
      })
    return () => { supabase.removeChannel(channel) }
  }, [bundle.lead.id, router])

  function handleSend() {
    const text = draft.trim()
    if (!text || isPending) return
    setError(null)
    startTransition(async () => {
      const res = await sendHumanMessage(bundle.lead.id, text)
      if (!res.ok) {
        setError(ERROR_TEXT[res.error] ?? 'Error inesperado.')
        return
      }
      setDraft('')
      setBotActiveState(false)
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.focus()
      }
    })
  }

  const memberName = (id: string | null) =>
    bundle.team.find(t => t.id === id)?.name ?? 'Equipo'

  let lastDate = ''

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Chat header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/panel" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3L5 8l5 5" />
              </svg>
            </Link>
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{bundle.lead.name ?? bundle.lead.phone}</p>
              <p className="truncate text-xs text-zinc-500">{bundle.lead.phone}</p>
            </div>
          </div>
          <button
            onClick={() => setShowSheet(s => !s)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-400 transition-colors hover:text-white lg:hidden"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 7v4M8 5h0" />
            </svg>
            Ficha
          </button>
        </div>

        {/* Bot paused bar */}
        {!botActive && (
          <div className="flex shrink-0 items-center justify-between gap-2 bg-amber-950/80 px-3 py-2 text-sm text-amber-300 sm:px-4">
            <span>Daniela pausada</span>
            <button
              onClick={() => startTransition(async () => {
                const res = await setBotActive(bundle.lead.id, true)
                if (res.ok) setBotActiveState(true)
              })}
              className="shrink-0 rounded-lg bg-amber-800 px-3 py-1 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-700"
            >
              Reactivar
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-4">
          {messages.map(m => {
            const msgDate = formatMsgDate(m.created_at)
            const showDateSep = msgDate !== lastDate
            lastDate = msgDate
            return (
              <div key={m.id}>
                {showDateSep && (
                  <div className="flex items-center justify-center py-2">
                    <span className="rounded-full bg-zinc-800/80 px-3 py-0.5 text-[11px] text-zinc-400">
                      {msgDate}
                    </span>
                  </div>
                )}
                <div className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[75%] ${
                    m.role === 'user'
                      ? 'rounded-tl-md bg-zinc-800 text-zinc-100'
                      : 'rounded-tr-md bg-emerald-900 text-emerald-50'
                  }`}>
                    {m.role !== 'user' && (
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-60">
                        {m.role === 'assistant' ? 'Daniela' : memberName(m.sent_by)}
                      </p>
                    )}
                    <ExpandableText text={m.content} limit={350} />
                    <p className="mt-1 text-right text-[10px] opacity-40">
                      {formatMsgTime(m.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 p-3 safe-bottom sm:p-4">
          {!within24h && (
            <p className="mb-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-amber-400">
              Fuera de la ventana de 24h: WhatsApp solo permite plantillas.
            </p>
          )}
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => {
                setDraft(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              rows={1}
              disabled={!within24h || isPending}
              placeholder={within24h ? 'Escribe un mensaje...' : 'Ventana cerrada'}
              aria-label="Mensaje"
              className="flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-emerald-600 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!within24h || isPending || !draft.trim()}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 sm:h-auto sm:w-auto sm:px-4 sm:py-2.5"
            >
              <svg className="h-5 w-5 sm:hidden" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.94 17.24l14.82-6.47a1 1 0 000-1.84L2.94.46a1 1 0 00-1.4 1.1L3.45 8.5H9a.5.5 0 010 1H3.45l-1.9 6.94a1 1 0 001.4 1.1z" />
              </svg>
              <span className="hidden text-sm font-medium sm:inline">
                {isPending ? '...' : 'Enviar'}
              </span>
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-600">Enviar pausa a Daniela</p>
        </div>
      </div>

      {/* Side sheet overlay */}
      {showSheet && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setShowSheet(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-sm transform flex-col border-l border-zinc-800 bg-zinc-950 transition-transform duration-200 ${
          showSheet
            ? 'translate-x-0'
            : 'translate-x-full invisible pointer-events-none lg:visible lg:pointer-events-auto'
        } lg:static lg:z-auto lg:w-72 lg:max-w-none lg:translate-x-0 lg:transition-none`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 p-3 lg:hidden">
          <span className="text-sm font-medium text-zinc-400">Ficha del lead</span>
          <button
            onClick={() => setShowSheet(false)}
            aria-label="Cerrar ficha"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <LeadSheet bundle={bundle} member={member} />
        </div>
      </aside>
    </div>
  )
}
