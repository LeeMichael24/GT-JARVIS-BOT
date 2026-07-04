'use client'

import { useState, useTransition } from 'react'
import {
  approveCampaign, rejectCampaign, retryFailedRecipients, toggleRecipient,
} from '@/app/panel/proactive-actions'
import { renderTemplate } from '@/lib/proactive/render'
import type { PendingCampaign } from '@/lib/proactive/data'
import type { Campaign } from '@/types'

const ERROR_TEXT: Record<string, string> = {
  NOT_PENDING: 'Esta campaña ya fue procesada. Recarga la página.',
  SEND_FAILED: 'Falló el envío. Revisa el historial y reintenta los fallidos.',
  TEMPLATE_INACTIVE: 'La plantilla de esta campaña está desactivada. Reactívala en Configuración.',
  UNAUTHORIZED: 'Sesión expirada. Vuelve a entrar.',
  FORBIDDEN: 'Solo un admin puede gestionar campañas.',
}

export function CampaignsView({ pending, history, costPerSend }: {
  pending: PendingCampaign[]
  history: (Campaign & { sent: number; failed: number })[]
  costPerSend: number
}) {
  const [tab, setTab] = useState<'pendientes' | 'historial'>('pendientes')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean } & { error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) setError(ERROR_TEXT[(res as { error: string }).error] ?? 'Error inesperado.')
    })
  }

  const tabCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${active ? 'bg-emerald-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        <button onClick={() => setTab('pendientes')} className={tabCls(tab === 'pendientes')}>
          Por aprobar ({pending.length})
        </button>
        <button onClick={() => setTab('historial')} className={tabCls(tab === 'historial')}>
          Historial
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      {tab === 'pendientes' && (
        <div className="space-y-4">
          {pending.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              Nada por aprobar. El sistema propone campañas cada mañana a las 10:00.
            </p>
          )}
          {pending.map(({ campaign, template, recipients }) => {
            const included = recipients.filter(r => r.included)
            return (
              <section key={campaign.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium text-white">{campaign.title}</h2>
                    {campaign.reason && <p className="text-xs text-zinc-500">{campaign.reason}</p>}
                  </div>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                    {campaign.kind === 'recontact' ? 'Recontacto' : 'Oportunidad'}
                  </span>
                </div>

                <p className="mt-3 line-clamp-4 rounded-lg bg-zinc-950 p-3 text-sm text-zinc-300">
                  {recipients[0]
                    ? renderTemplate(template.body_preview, recipients[0].variables)
                    : template.body_preview}
                </p>

                <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
                  {recipients.map(r => (
                    <li key={r.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.included}
                        disabled={isPending}
                        onChange={e => run(() => toggleRecipient(r.id, e.target.checked))}
                        aria-label={`Incluir a ${r.lead.name ?? r.lead.phone}`}
                      />
                      <span className="text-zinc-200">{r.lead.name ?? r.lead.phone}</span>
                      {r.match_reason && <span className="truncate text-xs text-zinc-500">· {r.match_reason}</span>}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <p className="text-xs text-zinc-500">
                    {included.length} destinatario{included.length === 1 ? '' : 's'} ·
                    costo estimado <span className="text-zinc-300">${(included.length * costPerSend).toFixed(2)} USD</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={isPending}
                      onClick={() => run(() => rejectCampaign(campaign.id))}
                      className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                    >
                      Rechazar
                    </button>
                    <button
                      disabled={isPending || included.length === 0}
                      onClick={() => {
                        if (!window.confirm(`¿Enviar a ${included.length} cliente(s)? Costo estimado $${(included.length * costPerSend).toFixed(2)} USD.`)) return
                        run(() => approveCampaign(campaign.id))
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                    >
                      {isPending ? 'Enviando…' : 'Aprobar y enviar'}
                    </button>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {tab === 'historial' && (
        <ul className="divide-y divide-zinc-900 rounded-xl border border-zinc-900">
          {history.length === 0 && (
            <li className="py-8 text-center text-sm text-zinc-500">Sin campañas todavía</li>
          )}
          {history.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <div>
                <p className="text-zinc-200">{c.title}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(c.created_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}
                  {' · '}{c.status === 'rejected' ? 'Rechazada' : `${c.sent} enviados${c.failed ? `, ${c.failed} fallidos` : ''}`}
                </p>
              </div>
              {c.failed > 0 && c.status === 'done' && (
                <button
                  disabled={isPending}
                  onClick={() => run(() => retryFailedRecipients(c.id))}
                  className="rounded-lg bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                >
                  Reintentar fallidos
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
