'use client'

import { useState, useTransition } from 'react'
import {
  addLeadTag, addNote, assignLead, removeLeadTag, updateLeadStage,
} from '@/app/panel/actions'
import type { ActionResult } from '@/app/panel/actions'
import type { LeadBundle } from '@/lib/panel-data'
import type { SessionMember } from '@/lib/auth'
import type { LeadStage } from '@/types'

const ERROR_TEXT: Record<string, string> = {
  FORBIDDEN: 'Ya no tienes acceso a este lead (¿fue reasignado?). Recarga la página.',
  UNAUTHORIZED: 'Sesión expirada. Vuelve a entrar.',
  NOT_FOUND: 'Este lead ya no existe.',
}

const QUAL_LABELS: Record<string, string> = {
  vivienda_propia: 'Vivienda propia', inversion: 'Inversión', ambos: 'Ambos',
  inmediato: 'Inmediato', '3_meses': '3 meses', '6_meses': '6 meses', explorando: 'Explorando',
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  return QUAL_LABELS[String(v)] ?? String(v)
}

export function LeadSheet({ bundle, member }: { bundle: LeadBundle; member: SessionMember }) {
  const [isPending, startTransition] = useTransition()
  const [noteDraft, setNoteDraft] = useState('')
  const [tagToAdd, setTagToAdd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lead = bundle.lead
  const qual = lead.qualification_data
  const availableTags = bundle.allTags.filter(t => !bundle.tags.some(lt => lt.id === t.id))

  // Lock global deliberado: una mutación en vuelo deshabilita toda la ficha
  // (evita escrituras solapadas); el estado viene del server, sin optimismo local
  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const res = await fn()
      setError(res.ok ? null : (ERROR_TEXT[res.error] ?? 'No se pudo guardar. Reintenta.'))
    })

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div>
        <p className="text-base font-semibold text-white">{lead.name ?? 'Sin nombre'}</p>
        <p className="text-zinc-500">{lead.phone}</p>
        {lead.project_interest && (
          <p className="mt-1 text-emerald-400">Interés: {lead.project_interest}</p>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}

      <label className="block text-zinc-400">
        Etapa
        <select
          value={lead.stage}
          disabled={isPending}
          onChange={e => run(() => updateLeadStage(lead.id, e.target.value as LeadStage))}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-white"
        >
          <option value="new">Nuevo</option>
          <option value="warm">Tibio</option>
          <option value="hot">Caliente</option>
          <option value="cold">Frío</option>
        </select>
      </label>

      {member.role === 'admin' && (
        <label className="block text-zinc-400">
          Asesor asignado
          <select
            value={lead.assigned_to ?? ''}
            disabled={isPending}
            onChange={e => run(() => assignLead(lead.id, e.target.value || null))}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-white"
          >
            <option value="">Sin asignar</option>
            {bundle.team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}

      <div>
        <p className="text-zinc-400">Tags</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {bundle.tags.map(t => (
            <button
              key={t.id}
              disabled={isPending}
              onClick={() => run(() => removeLeadTag(lead.id, t.id))}
              title="Quitar tag"
              aria-label={`Quitar tag ${t.name}`}
              className="rounded-full px-2 py-0.5 text-[11px] hover:opacity-70"
              style={{ backgroundColor: `${t.color}33`, color: t.color }}
            >
              {t.name} <span aria-hidden="true">✕</span>
            </button>
          ))}
          {bundle.tags.length === 0 && <span className="text-xs text-zinc-600">Sin tags</span>}
        </div>
        {availableTags.length > 0 && (
          <select
            value={tagToAdd}
            disabled={isPending}
            aria-label="Agregar tag"
            onChange={e => {
              const id = e.target.value
              setTagToAdd('')
              if (id) run(() => addLeadTag(lead.id, id))
            }}
            className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-300"
          >
            <option value="">+ Agregar tag…</option>
            {availableTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      <div>
        <p className="text-zinc-400">Calificación de Daniela</p>
        <dl className="mt-1.5 space-y-1 rounded-lg bg-zinc-900 p-3 text-xs">
          <div className="flex justify-between"><dt className="text-zinc-500">Propósito</dt><dd className="text-zinc-200">{fmt(qual?.purpose)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Presupuesto OK</dt><dd className="text-zinc-200">{fmt(qual?.budget_ok)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Timeline</dt><dd className="text-zinc-200">{fmt(qual?.timeline)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Financiamiento</dt><dd className="text-zinc-200">{fmt(qual?.financing_needed)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Decisor</dt><dd className="text-zinc-200">{fmt(qual?.decision_maker)}</dd></div>
        </dl>
      </div>

      <div className="flex-1">
        <p className="text-zinc-400">Notas internas</p>
        <div className="mt-1.5 space-y-2">
          {bundle.notes.map(n => (
            <div key={n.id} className="rounded-lg bg-zinc-900 p-2.5 text-xs">
              <p className="whitespace-pre-wrap text-zinc-200">{n.content}</p>
              <p className="mt-1 text-[10px] text-zinc-500">
                {n.author_name} · {new Date(n.created_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>
          ))}
          {bundle.notes.length === 0 && <p className="text-xs text-zinc-600">Sin notas</p>}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={e => {
            e.preventDefault()
            const text = noteDraft.trim()
            if (!text) return
            run(async () => {
              const res = await addNote(lead.id, text)
              if (res.ok) setNoteDraft('')
              return res
            })
          }}
        >
          <input
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            placeholder="Agregar nota…"
            aria-label="Agregar nota"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-600"
          />
          <button type="submit" disabled={isPending || !noteDraft.trim()} className="rounded-lg bg-zinc-800 px-3 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40">
            +
          </button>
        </form>
      </div>
    </div>
  )
}
