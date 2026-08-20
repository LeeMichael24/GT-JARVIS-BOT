'use client'

import { useState, useTransition, useMemo } from 'react'
import { createObjective, updateObjective, deleteObjective } from '@/app/panel/actions'
import type { AgentObjective, ObjectiveScope } from '@/types'

const SCOPES: { value: ObjectiveScope; label: string; hint: string; color: string }[] = [
  { value: 'general', label: 'General', hint: 'Aplica SIEMPRE, en toda conversación', color: 'bg-emerald-900/60 text-emerald-300' },
  { value: 'project', label: 'Por proyecto', hint: 'Aplica cuando el cliente habla de ese proyecto', color: 'bg-blue-900/60 text-blue-300' },
  { value: 'investment', label: 'Por inversión', hint: 'Aplica en conversaciones de inversión sobre ese producto', color: 'bg-purple-900/60 text-purple-300' },
]

interface Props {
  objectives: AgentObjective[]
  /** Nombres reales del catálogo GT para el dropdown de target */
  projectNames: string[]
}

export function ObjectivesEditor({ objectives: initial, projectNames }: Props) {
  const [objectives, setObjectives] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formScope, setFormScope] = useState<ObjectiveScope>('general')
  const [formTarget, setFormTarget] = useState('')
  const [formObjective, setFormObjective] = useState('')
  const [formPriority, setFormPriority] = useState(100)

  const grouped = useMemo(() => ({
    general: objectives.filter(o => o.scope === 'general'),
    project: objectives.filter(o => o.scope === 'project'),
    investment: objectives.filter(o => o.scope === 'investment'),
  }), [objectives])

  function resetForm() {
    setFormScope('general')
    setFormTarget('')
    setFormObjective('')
    setFormPriority(100)
    setShowForm(false)
    setEditingId(null)
  }

  function startEdit(o: AgentObjective) {
    setFormScope(o.scope)
    setFormTarget(o.target_key ?? '')
    setFormObjective(o.objective)
    setFormPriority(o.priority)
    setEditingId(o.id)
    setShowForm(true)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      if (editingId) {
        const res = await updateObjective(editingId, {
          scope: formScope,
          target_key: formScope === 'general' ? null : formTarget,
          objective: formObjective,
          priority: formPriority,
        })
        if (!res.ok) { setError(errMsg(res.error)); return }
        setObjectives(prev => prev.map(o => o.id === editingId
          ? { ...o, scope: formScope, target_key: formScope === 'general' ? null : formTarget.trim(), objective: formObjective.trim(), priority: formPriority }
          : o))
      } else {
        const res = await createObjective(formScope, formScope === 'general' ? null : formTarget, formObjective, formPriority)
        if (!res.ok) { setError(errMsg(res.error)); return }
        setObjectives(prev => [...prev, {
          id: crypto.randomUUID(),
          scope: formScope,
          target_key: formScope === 'general' ? null : formTarget.trim(),
          objective: formObjective.trim(),
          priority: formPriority,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }])
      }
      resetForm()
    })
  }

  function errMsg(code: string): string {
    if (code === 'TARGET_REQUIRED') return 'Elige el proyecto/inversión al que aplica'
    if (code === 'EMPTY') return 'Escribe el objetivo'
    return 'Error al guardar. ¿Corriste la migración 012?'
  }

  function handleToggle(o: AgentObjective) {
    const next = !o.active
    setObjectives(prev => prev.map(x => x.id === o.id ? { ...x, active: next } : x))
    startTransition(async () => {
      const res = await updateObjective(o.id, { active: next })
      if (!res.ok) setObjectives(prev => prev.map(x => x.id === o.id ? { ...x, active: o.active } : x))
    })
  }

  function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar este objetivo?')) return
    setObjectives(prev => prev.filter(o => o.id !== id))
    startTransition(async () => {
      const res = await deleteObjective(id)
      if (!res.ok) setError('Error al eliminar')
    })
  }

  const scopeInfo = (s: string) => SCOPES.find(x => x.value === s) ?? SCOPES[0]
  const selectCls = 'rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-300'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <p className="text-xs leading-relaxed text-zinc-400">
          Los objetivos guían cada decisión de Daniela y entran a su prompt en cada mensaje.
          <strong className="text-zinc-300"> Generales</strong> aplican siempre;
          <strong className="text-zinc-300"> por proyecto</strong> cuando el cliente habla de ese proyecto;
          <strong className="text-zinc-300"> por inversión</strong> en conversaciones de inversión.
          Prioridad menor = más importante.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">{objectives.length} objetivo{objectives.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
        >
          + Agregar objetivo
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}

      {showForm && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">{editingId ? 'Editar objetivo' : 'Nuevo objetivo'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Alcance</label>
              <select value={formScope} onChange={e => setFormScope(e.target.value as ObjectiveScope)} className={`w-full ${selectCls}`}>
                {SCOPES.map(s => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}
              </select>
            </div>
            {formScope !== 'general' && (
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  {formScope === 'project' ? 'Proyecto' : 'Inversión / proyecto de inversión'}
                </label>
                {projectNames.length > 0 ? (
                  <>
                    <input
                      list="gt-projects"
                      value={formTarget}
                      onChange={e => setFormTarget(e.target.value)}
                      placeholder="Elige o escribe el nombre…"
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
                    />
                    <datalist id="gt-projects">
                      {projectNames.map(n => <option key={n} value={n} />)}
                    </datalist>
                  </>
                ) : (
                  <input
                    value={formTarget}
                    onChange={e => setFormTarget(e.target.value)}
                    placeholder="ej: Portacelli Alta, Foresta Townhomes…"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
                  />
                )}
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-400">Objetivo (lo que Daniela debe lograr)</label>
              <textarea
                value={formObjective}
                onChange={e => setFormObjective(e.target.value)}
                rows={3}
                placeholder='ej: "Priorizar agendar visitas presenciales este mes" / "Para este proyecto, empujar el plan de financiamiento directo antes que el precio de contado"'
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Prioridad (menor = más importante)</label>
              <input
                type="number"
                min={1} max={999}
                value={formPriority}
                onChange={e => setFormPriority(parseInt(e.target.value) || 100)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending || !formObjective.trim() || (formScope !== 'general' && !formTarget.trim())}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {isPending ? 'Guardando…' : editingId ? 'Actualizar' : 'Crear'}
            </button>
            <button onClick={resetForm} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {(['general', 'project', 'investment'] as const).map(scope => (
        <div key={scope}>
          <h3 className="mb-1.5 mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {scopeInfo(scope).label} {scope !== 'general' && `(${grouped[scope].length})`}
          </h3>
          {grouped[scope].length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-600">
              {scope === 'general' ? 'Sin objetivos generales — Daniela usa solo su marco de decisión.' :
               scope === 'project' ? 'Sin objetivos por proyecto. Ej: "En Portacelli Alta, empuja la preventa antes del cierre de etapa".' :
               'Sin objetivos por inversión. Ej: "En Foresta El Encanto, prioriza la modalidad de ROI anual para perfiles conservadores".'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {grouped[scope].map(o => (
                <div key={o.id} className={`rounded-xl border p-3 ${o.active ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-800/50 bg-zinc-950 opacity-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${scopeInfo(o.scope).color}`}>
                        {scopeInfo(o.scope).label}
                      </span>
                      {o.target_key && <span className="truncate text-sm font-medium text-white">{o.target_key}</span>}
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">P{o.priority}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => handleToggle(o)}
                        title={o.active ? 'Desactivar' : 'Activar'}
                        className={`rounded-lg p-1.5 text-xs ${o.active ? 'text-emerald-400 hover:bg-emerald-950' : 'text-zinc-600 hover:bg-zinc-800'}`}
                      >
                        {o.active ? '●' : '○'}
                      </button>
                      <button onClick={() => startEdit(o)} title="Editar" className="rounded-lg p-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-white">✎</button>
                      <button onClick={() => handleDelete(o.id)} title="Eliminar" className="rounded-lg p-1.5 text-xs text-zinc-600 hover:bg-red-950 hover:text-red-400">✕</button>
                    </div>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{o.objective}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
