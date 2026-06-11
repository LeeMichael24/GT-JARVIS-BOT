'use client'

import { useState, useTransition } from 'react'
import { createRecontactRule, deleteRecontactRule, setRuleActive } from '@/app/panel/proactive-actions'
import type { LeadStage, MessageTemplate, RecontactRule, Tag } from '@/types'

const STAGE_OPTS: { value: LeadStage; label: string }[] = [
  { value: 'new', label: 'Nuevo' }, { value: 'warm', label: 'Tibio' },
  { value: 'hot', label: 'Caliente' }, { value: 'cold', label: 'Frío' },
]

const ERROR_TEXT: Record<string, string> = {
  INVALID_DAYS: 'Los días deben ser 1 o más.',
  INVALID_MAX: 'El tope diario debe estar entre 1 y 50.',
  NO_TEMPLATE: 'Elige una plantilla.',
  EMPTY: 'Falta el nombre de la regla.',
}

export function ConfigRules({ rules, templates, tags }: {
  rules: RecontactRule[]
  templates: MessageTemplate[]
  tags: Tag[]
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [stages, setStages] = useState<LeadStage[]>([])
  const [tagIds, setTagIds] = useState<string[]>([])
  const [days, setDays] = useState(7)
  const [templateId, setTemplateId] = useState('')
  const [maxRun, setMaxRun] = useState(20)

  const activeTemplates = templates.filter(t => t.active)
  const tplName = (id: string) => templates.find(t => t.id === id)?.name ?? '—'
  const toggleIn = <T,>(arr: T[], v: T) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

  return (
    <section>
      <h2 className="text-base font-medium text-white">Reglas de recontacto</h2>
      <p className="text-sm text-zinc-500">
        Cada mañana el sistema propone campañas según estas reglas. Tú apruebas antes de enviar.
      </p>
      <ul className="mt-3 space-y-2">
        {rules.map(r => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-900 bg-zinc-900/40 p-3 text-sm">
            <div>
              <p className={r.active ? 'text-white' : 'text-zinc-600 line-through'}>{r.name}</p>
              <p className="text-xs text-zinc-500">
                {(r.stages?.length ? r.stages.join('/') : 'todas las etapas')} · {r.days_inactive}+ días ·
                plantilla {tplName(r.template_id)} · máx {r.max_per_run}/día
              </p>
            </div>
            <div className="flex gap-2">
              <button disabled={isPending} onClick={() => startTransition(async () => { await setRuleActive(r.id, !r.active) })} className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
                {r.active ? 'Pausar' : 'Activar'}
              </button>
              <button
                disabled={isPending}
                onClick={() => {
                  if (!window.confirm(`¿Eliminar la regla "${r.name}"?`)) return
                  startTransition(async () => { await deleteRecontactRule(r.id) })
                }}
                aria-label={`Eliminar regla ${r.name}`}
                className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </li>
        ))}
        {rules.length === 0 && <li className="text-sm text-zinc-600">Aún no hay reglas</li>}
      </ul>

      <form
        className="mt-3 space-y-2 rounded-lg border border-zinc-900 p-3"
        onSubmit={e => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const res = await createRecontactRule({
              name, stages: stages.length ? stages : null, tag_ids: tagIds.length ? tagIds : null,
              days_inactive: days, template_id: templateId, max_per_run: maxRun,
            })
            if (!res.ok) { setError(ERROR_TEXT[res.error] ?? 'No se pudo crear la regla.'); return }
            setName(''); setStages([]); setTagIds([])
          })
        }}
      >
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="Nombre (ej. Calientes 5 días)" aria-label="Nombre de la regla" className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600" />
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500">Etapas:</span>
          {STAGE_OPTS.map(s => (
            <button type="button" key={s.value} onClick={() => setStages(v => toggleIn(v, s.value))}
              className={`rounded-full px-2 py-0.5 ${stages.includes(s.value) ? 'bg-emerald-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
              {s.label}
            </button>
          ))}
          <span className="text-zinc-600">(ninguna = todas)</span>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-zinc-500">Tags:</span>
            {tags.map(t => (
              <button type="button" key={t.id} onClick={() => setTagIds(v => toggleIn(v, t.id))}
                className={`rounded-full px-2 py-0.5 ${tagIds.includes(t.id) ? 'bg-emerald-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1 text-zinc-400">
            Días sin hablar:
            <input type="number" min={1} value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Días de inactividad" className="w-16 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-white" />
          </label>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)} required aria-label="Plantilla" className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-300">
            <option value="">Plantilla…</option>
            {activeTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="flex items-center gap-1 text-zinc-400">
            Máx/día:
            <input type="number" min={1} max={50} value={maxRun} onChange={e => setMaxRun(Number(e.target.value))} aria-label="Máximo por día" className="w-16 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-white" />
          </label>
          <button type="submit" disabled={isPending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-500 disabled:opacity-40">
            Crear regla
          </button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  )
}
