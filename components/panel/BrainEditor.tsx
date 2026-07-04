'use client'

import { useState, useTransition, useMemo } from 'react'
import { createBrainEntry, updateBrainEntry, deleteBrainEntry } from '@/app/panel/actions'
import type { BrainEntry } from '@/types'
import { ExpandableText } from '@/components/panel/ExpandableText'

const CATEGORIES: { value: string; label: string; color: string }[] = [
  { value: 'pattern', label: 'Patrón', color: 'bg-blue-900/60 text-blue-300' },
  { value: 'observation', label: 'Observación', color: 'bg-amber-900/60 text-amber-300' },
  { value: 'correction', label: 'Corrección', color: 'bg-red-900/60 text-red-300' },
  { value: 'metric', label: 'Métrica', color: 'bg-emerald-900/60 text-emerald-300' },
]

const SOURCE_STYLES: Record<string, { label: string; cls: string }> = {
  team: { label: 'Equipo', cls: 'bg-emerald-900/60 text-emerald-300' },
  agent: { label: 'Daniela', cls: 'bg-purple-900/60 text-purple-300' },
}

type FilterCat = '' | 'pattern' | 'observation' | 'correction' | 'metric'
type FilterSource = '' | 'team' | 'agent'

export function BrainEditor({ entries: initial }: { entries: BrainEntry[] }) {
  const [entries, setEntries] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [filterCat, setFilterCat] = useState<FilterCat>('')
  const [filterSource, setFilterSource] = useState<FilterSource>('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [formCat, setFormCat] = useState('pattern')
  const [formTopic, setFormTopic] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formConfidence, setFormConfidence] = useState(0.9)

  const filtered = useMemo(() => {
    let result = entries
    if (filterCat) result = result.filter(e => e.category === filterCat)
    if (filterSource) result = result.filter(e => e.source === filterSource)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(e =>
        e.topic.toLowerCase().includes(q) || e.content.toLowerCase().includes(q),
      )
    }
    return result
  }, [entries, filterCat, filterSource, search])

  const stats = useMemo(() => ({
    total: entries.length,
    active: entries.filter(e => e.active).length,
    team: entries.filter(e => e.source === 'team').length,
    agent: entries.filter(e => e.source === 'agent').length,
  }), [entries])

  function resetForm() {
    setFormCat('pattern')
    setFormTopic('')
    setFormContent('')
    setFormConfidence(0.9)
    setShowForm(false)
    setEditingId(null)
  }

  function startEdit(entry: BrainEntry) {
    setFormCat(entry.category)
    setFormTopic(entry.topic)
    setFormContent(entry.content)
    setFormConfidence(entry.confidence)
    setEditingId(entry.id)
    setShowForm(true)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      if (editingId) {
        const res = await updateBrainEntry(editingId, {
          category: formCat, topic: formTopic, content: formContent, confidence: formConfidence,
        })
        if (!res.ok) { setError('Error al actualizar'); return }
        setEntries(prev => prev.map(e =>
          e.id === editingId
            ? { ...e, category: formCat, topic: formTopic.trim(), content: formContent.trim(), confidence: formConfidence }
            : e,
        ))
      } else {
        const res = await createBrainEntry(formCat, formTopic, formContent, formConfidence)
        if (!res.ok) { setError(res.error === 'EMPTY' ? 'Tema y contenido son requeridos' : 'Error al crear'); return }
        const newEntry: BrainEntry = {
          id: crypto.randomUUID(),
          category: formCat, topic: formTopic.trim(), content: formContent.trim(),
          source: 'team', lead_id: null, confidence: formConfidence,
          active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }
        setEntries(prev => [newEntry, ...prev])
      }
      resetForm()
    })
  }

  function handleToggle(entry: BrainEntry) {
    const newActive = !entry.active
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, active: newActive } : e))
    startTransition(async () => {
      const res = await updateBrainEntry(entry.id, { active: newActive })
      if (!res.ok) setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, active: entry.active } : e))
    })
  }

  function handleDelete(id: string) {
    if (!window.confirm('Eliminar esta entrada del cerebro?')) return
    setEntries(prev => prev.filter(e => e.id !== id))
    startTransition(async () => {
      const res = await deleteBrainEntry(id)
      if (!res.ok) setError('Error al eliminar')
    })
  }

  const catInfo = (cat: string) => CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[1]
  const srcInfo = (src: string) => SOURCE_STYLES[src] ?? SOURCE_STYLES.agent

  const selectCls = 'rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-300'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Stats */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'Activas', value: stats.active, color: 'text-emerald-400' },
          { label: 'Del equipo', value: stats.team, color: 'text-blue-400' },
          { label: 'De Daniela', value: stats.agent, color: 'text-purple-400' },
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
          placeholder="Buscar..."
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
        />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value as FilterCat)} className={selectCls}>
          <option value="">Categoría</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value as FilterSource)} className={selectCls}>
          <option value="">Fuente</option>
          <option value="team">Equipo</option>
          <option value="agent">Daniela</option>
        </select>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
        >
          + Agregar
        </button>
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">
            {editingId ? 'Editar entrada' : 'Nueva entrada de conocimiento'}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Categoría</label>
              <select value={formCat} onChange={e => setFormCat(e.target.value)} className={`w-full ${selectCls}`}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Tema</label>
              <input
                value={formTopic}
                onChange={e => setFormTopic(e.target.value)}
                placeholder="ej: precios, objeciones, horarios..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-400">Contenido</label>
              <textarea
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                rows={3}
                placeholder="Lo que Daniela debe saber o hacer..."
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                Confianza: {Math.round(formConfidence * 100)}%
              </label>
              <input
                type="range"
                min={0} max={1} step={0.05}
                value={formConfidence}
                onChange={e => setFormConfidence(parseFloat(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Solo entradas con 70%+ se incluyen en el prompt de Daniela
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending || !formTopic.trim() || !formContent.trim()}
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
        {filtered.length} entrada{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Entries list */}
      <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-4">
        {filtered.map(entry => (
          <div
            key={entry.id}
            className={`rounded-xl border p-3 transition-opacity ${
              entry.active
                ? 'border-zinc-800 bg-zinc-900/50'
                : 'border-zinc-800/50 bg-zinc-950 opacity-50'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${catInfo(entry.category).color}`}>
                  {catInfo(entry.category).label}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${srcInfo(entry.source).cls}`}>
                  {srcInfo(entry.source).label}
                </span>
                <span className="truncate text-sm font-medium text-white">{entry.topic}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                  entry.confidence >= 0.7 ? 'bg-emerald-950 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {Math.round(entry.confidence * 100)}%
                </span>
                <button
                  onClick={() => handleToggle(entry)}
                  title={entry.active ? 'Desactivar' : 'Activar'}
                  className={`rounded-lg p-1.5 text-xs transition-colors ${
                    entry.active ? 'text-emerald-400 hover:bg-emerald-950' : 'text-zinc-600 hover:bg-zinc-800'
                  }`}
                >
                  {entry.active ? '●' : '○'}
                </button>
                <button
                  onClick={() => startEdit(entry)}
                  title="Editar"
                  className="rounded-lg p-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-white"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  title="Eliminar"
                  className="rounded-lg p-1.5 text-xs text-zinc-600 hover:bg-red-950 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="mt-1.5"><ExpandableText text={entry.content} limit={220} className="text-sm leading-relaxed text-zinc-300" /></div>
            {entry.lead_id && (
              <p className="mt-1 text-[11px] text-zinc-600">De conversación con lead</p>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-zinc-500">Sin entradas</p>
            <p className="mt-1 text-xs text-zinc-600">
              {entries.length > 0 ? 'Cambia los filtros' : 'Agrega conocimiento para que Daniela aprenda'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
