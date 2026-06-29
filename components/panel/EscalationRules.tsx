'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  createEscalationRule,
  updateEscalationRule,
  deleteEscalationRule,
  toggleEscalationRule,
} from '@/app/panel/actions'
import type { EscalationRule, EscalationTriggerType, EscalationAction } from '@/types'

const TRIGGER_TYPES: { value: EscalationTriggerType; label: string; color: string }[] = [
  { value: 'keyword', label: 'Palabra clave', color: 'bg-blue-900/60 text-blue-300' },
  { value: 'topic', label: 'Tema', color: 'bg-amber-900/60 text-amber-300' },
  { value: 'condition', label: 'Condicion', color: 'bg-purple-900/60 text-purple-300' },
]

const ACTIONS: { value: EscalationAction; label: string; color: string }[] = [
  { value: 'escalate_ceo', label: 'Escalar CEO', color: 'bg-red-900/60 text-red-300' },
  { value: 'consult_team', label: 'Consultar equipo', color: 'bg-cyan-900/60 text-cyan-300' },
]

type FilterType = '' | EscalationTriggerType

export function EscalationRules({ rules: initial }: { rules: EscalationRule[] }) {
  const [rules, setRules] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<FilterType>('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [formType, setFormType] = useState<EscalationTriggerType>('keyword')
  const [formValue, setFormValue] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formAction, setFormAction] = useState<EscalationAction>('escalate_ceo')

  const filtered = useMemo(() => {
    let result = rules
    if (filterType) result = result.filter(r => r.trigger_type === filterType)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.trigger_value.toLowerCase().includes(q) ||
        (r.description?.toLowerCase().includes(q) ?? false),
      )
    }
    return result
  }, [rules, filterType, search])

  const stats = useMemo(() => ({
    total: rules.length,
    active: rules.filter(r => r.active).length,
    keywords: rules.filter(r => r.trigger_type === 'keyword').length,
    topics: rules.filter(r => r.trigger_type === 'topic').length,
    conditions: rules.filter(r => r.trigger_type === 'condition').length,
  }), [rules])

  function resetForm() {
    setFormType('keyword')
    setFormValue('')
    setFormDescription('')
    setFormAction('escalate_ceo')
    setShowForm(false)
    setEditingId(null)
  }

  function startEdit(rule: EscalationRule) {
    setFormType(rule.trigger_type)
    setFormValue(rule.trigger_value)
    setFormDescription(rule.description ?? '')
    setFormAction(rule.action)
    setEditingId(rule.id)
    setShowForm(true)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      if (editingId) {
        const res = await updateEscalationRule(editingId, {
          trigger_type: formType,
          trigger_value: formValue,
          description: formDescription || null,
          action: formAction,
        })
        if (!res.ok) { setError('Error al actualizar'); return }
        setRules(prev => prev.map(r =>
          r.id === editingId
            ? {
                ...r,
                trigger_type: formType,
                trigger_value: formValue.trim(),
                description: formDescription.trim() || null,
                action: formAction,
                updated_at: new Date().toISOString(),
              }
            : r,
        ))
      } else {
        const res = await createEscalationRule(formType, formValue, formDescription || null, formAction)
        if (!res.ok) {
          setError(res.error === 'EMPTY' ? 'El valor del trigger es requerido' : 'Error al crear')
          return
        }
        const newRule: EscalationRule = {
          id: crypto.randomUUID(),
          trigger_type: formType,
          trigger_value: formValue.trim(),
          description: formDescription.trim() || null,
          action: formAction,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setRules(prev => [newRule, ...prev])
      }
      resetForm()
    })
  }

  function handleToggle(rule: EscalationRule) {
    const newActive = !rule.active
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: newActive } : r))
    startTransition(async () => {
      const res = await toggleEscalationRule(rule.id, newActive)
      if (!res.ok) setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: rule.active } : r))
    })
  }

  function handleDelete(id: string) {
    if (!window.confirm('Eliminar esta regla de escalamiento?')) return
    setRules(prev => prev.filter(r => r.id !== id))
    startTransition(async () => {
      const res = await deleteEscalationRule(id)
      if (!res.ok) setError('Error al eliminar')
    })
  }

  const typeInfo = (type: EscalationTriggerType) =>
    TRIGGER_TYPES.find(t => t.value === type) ?? TRIGGER_TYPES[0]
  const actionInfo = (action: EscalationAction) =>
    ACTIONS.find(a => a.value === action) ?? ACTIONS[0]

  const selectCls = 'rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-300'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Stats */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'Activas', value: stats.active, color: 'text-emerald-400' },
          { label: 'Palabras clave', value: stats.keywords, color: 'text-blue-400' },
          { label: 'Temas', value: stats.topics, color: 'text-amber-400' },
          { label: 'Condiciones', value: stats.conditions, color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
            <p className="text-xs text-zinc-500">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar reglas..."
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
        />
        <select value={filterType} onChange={e => setFilterType(e.target.value as FilterType)} className={selectCls}>
          <option value="">Tipo</option>
          {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
        >
          + Agregar regla
        </button>
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">
            {editingId ? 'Editar regla' : 'Nueva regla de escalamiento'}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Tipo de trigger</label>
              <select value={formType} onChange={e => setFormType(e.target.value as EscalationTriggerType)} className={`w-full ${selectCls}`}>
                {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Valor del trigger</label>
              <input
                value={formValue}
                onChange={e => setFormValue(e.target.value)}
                placeholder={
                  formType === 'keyword' ? 'ej: precio final, descuento...'
                    : formType === 'topic' ? 'ej: negociacion, legal...'
                    : 'ej: multiple_units, competitor_mention...'
                }
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Accion</label>
              <select value={formAction} onChange={e => setFormAction(e.target.value as EscalationAction)} className={`w-full ${selectCls}`}>
                {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Descripcion (opcional)</label>
              <input
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Por que se escala con este trigger..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            {formType === 'keyword'
              ? 'Las palabras clave se detectan automaticamente en el mensaje del cliente (coincidencia parcial, sin importar mayusculas).'
              : formType === 'topic'
              ? 'Los temas se pasan al prompt de GPT-4o como contexto obligatorio de escalamiento.'
              : 'Las condiciones se pasan al prompt de GPT-4o como contexto obligatorio de escalamiento.'}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending || !formValue.trim()}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {isPending ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
            </button>
            <button onClick={resetForm} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Count */}
      <p className="mt-3 text-xs text-zinc-500">
        {filtered.length} regla{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Rules list */}
      <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-4">
        {filtered.map(rule => (
          <div
            key={rule.id}
            className={`rounded-xl border p-3 transition-opacity ${
              rule.active
                ? 'border-zinc-800 bg-zinc-900/50'
                : 'border-zinc-800/50 bg-zinc-950 opacity-50'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${typeInfo(rule.trigger_type).color}`}>
                  {typeInfo(rule.trigger_type).label}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${actionInfo(rule.action).color}`}>
                  {actionInfo(rule.action).label}
                </span>
                <span className="truncate text-sm font-medium text-white">{rule.trigger_value}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => handleToggle(rule)}
                  title={rule.active ? 'Desactivar' : 'Activar'}
                  className={`rounded-lg p-1.5 text-xs transition-colors ${
                    rule.active ? 'text-emerald-400 hover:bg-emerald-950' : 'text-zinc-600 hover:bg-zinc-800'
                  }`}
                >
                  {rule.active ? '●' : '○'}
                </button>
                <button
                  onClick={() => startEdit(rule)}
                  title="Editar"
                  className="rounded-lg p-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-white"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  title="Eliminar"
                  className="rounded-lg p-1.5 text-xs text-zinc-600 hover:bg-red-950 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            </div>
            {rule.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{rule.description}</p>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-zinc-500">Sin reglas</p>
            <p className="mt-1 text-xs text-zinc-600">
              {rules.length > 0 ? 'Cambia los filtros' : 'Agrega reglas para que Daniela escale automaticamente'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
