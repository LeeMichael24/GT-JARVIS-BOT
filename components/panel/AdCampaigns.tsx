'use client'

import { useState } from 'react'
import type { AdCampaign } from '@/types'

export function AdCampaigns({
  campaigns,
  addAction,
  updateNotesAction,
  toggleAction,
}: {
  campaigns: AdCampaign[]
  addAction: (form: FormData) => Promise<{ error?: string }>
  updateNotesAction: (id: string, notes: string) => Promise<{ error?: string }>
  toggleAction: (id: string, newStatus: string) => Promise<{ error?: string }>
}) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const result = await addAction(form)
    if (result.error) setError(result.error)
    else { setShowForm(false); e.currentTarget.reset() }
    setPending(false)
  }

  const inputCls = 'w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Ads activos — las notas las lee Daniela para responder en contexto
        </p>
        <button
          onClick={() => setShowForm(f => !f)}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
        >
          {showForm ? 'Cancelar' : '+ Agregar'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Nombre de la campaña</label>
            <input name="name" required placeholder="Portacelli ALTA - Julio 2026" className={inputCls} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Plataforma</label>
              <select name="platform" required className={inputCls}>
                <option value="meta">Meta (Facebook/Instagram)</option>
                <option value="google">Google Ads</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Proyecto objetivo</label>
              <input name="target_project" placeholder="Portacelli ALTA" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Notas para Daniela</label>
            <textarea
              name="offer_details"
              rows={3}
              placeholder="Ej: Este anuncio ofrece 10% de descuento en reserva hasta julio. El cliente ya vio video del proyecto. Enfocarse en plan de pago y agendar visita."
              className={inputCls}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {pending ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
      )}

      {campaigns.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-zinc-500">Sin ads registrados</p>
          <p className="mt-1 text-xs text-zinc-600">
            Agrega tus campañas activas para que Daniela sepa el contexto de cada anuncio
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <AdCard
              key={c.id}
              campaign={c}
              onUpdateNotes={updateNotesAction}
              onToggle={toggleAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AdCard({ campaign: c, onUpdateNotes, onToggle }: {
  campaign: AdCampaign
  onUpdateNotes: (id: string, notes: string) => Promise<{ error?: string }>
  onToggle: (id: string, newStatus: string) => Promise<{ error?: string }>
}) {
  const [editing, setEditing] = useState(false)
  const [notes, setNotes] = useState(c.offer_details ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onUpdateNotes(c.id, notes)
    setSaving(false)
    setEditing(false)
  }

  const isActive = c.status === 'active'

  return (
    <div className={`rounded-xl border bg-zinc-900/50 p-4 ${isActive ? 'border-emerald-800/50' : 'border-zinc-800 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            <span className="font-medium text-white">{c.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{c.platform === 'meta' ? 'Meta' : c.platform === 'google' ? 'Google' : 'TikTok'}</span>
            {c.target_project && <><span>·</span><span>{c.target_project}</span></>}
          </div>
        </div>
        <button
          onClick={() => onToggle(c.id, isActive ? 'paused' : 'active')}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
            isActive
              ? 'bg-zinc-800 text-zinc-400 hover:text-white'
              : 'bg-emerald-900/60 text-emerald-300 hover:bg-emerald-800/60'
          }`}
        >
          {isActive ? 'Pausar' : 'Activar'}
        </button>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500">Notas para Daniela</span>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-xs text-emerald-500 hover:text-emerald-400">
              Editar
            </button>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
              placeholder="Escribe contexto que Daniela usará al responder leads de este anuncio..."
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={() => { setEditing(false); setNotes(c.offer_details ?? '') }}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p className={`text-sm ${c.offer_details ? 'text-zinc-300' : 'italic text-zinc-600'}`}>
            {c.offer_details || 'Sin notas — agrega contexto para que Daniela responda mejor'}
          </p>
        )}
      </div>
    </div>
  )
}
