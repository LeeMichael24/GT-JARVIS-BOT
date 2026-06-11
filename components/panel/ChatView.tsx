'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { sendHumanMessage, setBotActive } from '@/app/panel/actions'
import { LeadSheet } from '@/components/panel/LeadSheet'
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

export function ChatView({ bundle, member }: { bundle: LeadBundle; member: SessionMember }) {
  const router = useRouter()
  const [messages, setMessages] = useState<Conversation[]>(bundle.messages)
  const [botActive, setBotActiveState] = useState(bundle.lead.bot_active)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showSheet, setShowSheet] = useState(false)
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const wasDisconnected = useRef(false)

  // La ventana se recalcula en vivo: un mensaje entrante del cliente la reabre
  const within24h = useMemo(() => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    return isWithin24h(lastUser?.created_at ?? null)
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Tras un refresh del server (p.ej. reconexión), mezclar mensajes sin perder
  // los que llegaron por realtime y aún no están en el payload del server
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
          router.refresh() // re-trae lo perdido; el merge effect lo integra
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
    })
  }

  const memberName = (id: string | null) =>
    bundle.team.find(t => t.id === id)?.name ?? 'Equipo'

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
          <div className="flex items-center gap-3">
            <Link href="/panel" className="text-zinc-400 hover:text-white">←</Link>
            <div>
              <p className="font-medium text-white">{bundle.lead.name ?? bundle.lead.phone}</p>
              <p className="text-xs text-zinc-500">{bundle.lead.phone}</p>
            </div>
          </div>
          <button onClick={() => setShowSheet(s => !s)} className="text-sm text-zinc-400 hover:text-white lg:hidden">
            Ficha
          </button>
        </div>

        {!botActive && (
          <div className="flex items-center justify-between gap-2 bg-amber-950 px-4 py-2 text-sm text-amber-300">
            <span>✋ Daniela pausada — atiendes tú</span>
            <button
              onClick={() => startTransition(async () => {
                const res = await setBotActive(bundle.lead.id, true)
                if (res.ok) setBotActiveState(true)
              })}
              className="rounded-lg bg-amber-800 px-3 py-1 text-amber-100 hover:bg-amber-700"
            >
              Reactivar a Daniela
            </button>
          </div>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-zinc-800 text-zinc-100' : 'bg-emerald-900 text-emerald-50'
              }`}>
                {m.role !== 'user' && (
                  <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide opacity-60">
                    {m.role === 'assistant' ? 'Daniela' : memberName(m.sent_by)}
                  </p>
                )}
                {m.content}
                <p className="mt-1 text-right text-[10px] opacity-50">
                  {new Date(m.created_at).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-zinc-800 p-3">
          {!within24h && (
            <p className="mb-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-amber-400">
              Fuera de la ventana de 24h: WhatsApp solo permite plantillas (llega en Fase 5).
            </p>
          )}
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              rows={1}
              disabled={!within24h || isPending}
              placeholder={within24h ? 'Escribe como humano…' : 'Ventana de 24h cerrada'}
              aria-label="Mensaje"
              className="flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!within24h || isPending || !draft.trim()}
              className="rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {isPending ? '…' : 'Enviar'}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">Enviar un mensaje pausa a Daniela automáticamente.</p>
        </div>
      </div>

      <aside className={`${showSheet ? 'block' : 'hidden'} w-full max-w-xs border-l border-zinc-800 lg:block`}>
        <LeadSheet bundle={bundle} member={member} />
      </aside>
    </div>
  )
}
