'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { Conversation } from '@/types'

function playBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
    osc.onended = () => { void ctx.close().catch(() => {}) }
  } catch {
    // Autoplay bloqueado hasta la primera interacción
  }
}

const IMPORTED_PREFIXES = ['import_', 'scraped_', 'bulk_']

function isImportedMessage(msg: Conversation): boolean {
  if (!msg.wa_message_id) return false
  return IMPORTED_PREFIXES.some(p => msg.wa_message_id!.startsWith(p))
}

export function RealtimeRefresher() {
  const router = useRouter()
  const [disconnected, setDisconnected] = useState(false)
  const unreadRef = useRef(0)
  const baseTitleRef = useRef('')
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasDisconnectedRef = useRef(false)

  useEffect(() => {
    baseTitleRef.current = document.title

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null
        router.refresh()
      }, 400)
    }

    const onFocus = () => {
      unreadRef.current = 0
      document.title = baseTitleRef.current
    }
    window.addEventListener('focus', onFocus)

    const mountedAt = Date.now()

    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel('panel-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, payload => {
        const msg = payload.new as Conversation

        if (isImportedMessage(msg)) return

        const commitTs = (payload as unknown as { commit_timestamp?: string }).commit_timestamp
        const commitTime = commitTs ? new Date(commitTs).getTime() : Date.now()
        if (commitTime < mountedAt - 5000) return

        if (msg.role === 'user') {
          playBeep()
          if (!document.hasFocus()) {
            unreadRef.current += 1
            document.title = `(${unreadRef.current}) ${baseTitleRef.current}`
          }
        }
        scheduleRefresh()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, () => {
        scheduleRefresh()
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          if (wasDisconnectedRef.current) scheduleRefresh()
          wasDisconnectedRef.current = false
          setDisconnected(false)
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          wasDisconnectedRef.current = true
          setDisconnected(true)
        }
      })

    return () => {
      window.removeEventListener('focus', onFocus)
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      document.title = baseTitleRef.current
      supabase.removeChannel(channel)
    }
  }, [router])

  if (!disconnected) return null
  return (
    <div className="bg-red-950 px-4 py-1.5 text-center text-xs text-red-300">
      Reconectando con el servidor…
    </div>
  )
}
