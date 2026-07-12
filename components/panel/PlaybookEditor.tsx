'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  createPlaybookEntry,
  updatePlaybookEntry,
  deletePlaybookEntry,
  type PlaybookRow,
} from '@/app/panel/actions'

const CATEGORIES: { value: string; label: string; color: string }[] = [
  { value: 'project_pitch', label: 'Pitch de proyecto', color: 'bg-emerald-900/60 text-emerald-300' },
  { value: 'sales_playbook', label: 'Playbook', color: 'bg-sky-900/60 text-sky-300' },
  { value: 'objection', label: 'Objeción', color: 'bg-red-900/60 text-red-300' },
  { value: 'closing_technique', label: 'Técnica de cierre', color: 'bg-purple-900/60 text-purple-300' },
  { value: 'faq', label: 'FAQ', color: 'bg-amber-900/60 text-amber-300' },
]

const ERROR_TEXT: Record<string, string> = {
  EMPTY: 'El título y el contenido son requeridos',
  INVALID_CATEGORY: 'Categoría inválida',
}

export function PlaybookEditor({ entries: initial }: { entries: PlaybookRow[] }) {
  const [entries, setEntries] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [fCat, setFCat] = useState('sales_playbook')
  const [fTitle, setFTitle] = useState('')
  const [fContent, setFContent] = useState('')
  const [fSlug, setFSlug] = useState('')
  const [fPriority, setFPriority] = useState(0)

  const filtered = useMemo(() => {
    let r = entries
    if (filterCat) r = r.filter(e => e.category === filterCat)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(e => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q))
    }
    return r
  }, [entries, filterCat, search])

  function resetForm() {
    setFCat('sales_playbook'); setFTitle(''); setFContent(''); setFSlug(''); setFPriority(0)
    setShowForm(false); setEditingId(null)
  }

  function startEdit(e: PlaybookRow) {
    setFCat(e.category); setFTitle(e.title); setFContent(e.content)
    setFSlug(e.project_slug ?? ''); setFPriority(e.priority)
    setEditingId(e.id); setShowForm(true)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      if (editingId) {
        const res = await updatePlaybookEntry(editingId, {
          category: fCat, title: fTitle, content: fContent,
          project_slug: fSlug || null, priority: fPriority,
        })
        if (!res.ok) { setError(ERROR_TEXT[res.error] ?? 'Error al actualizar'); return }
        setEntries(prev => prev.map(x => x.id === editingId
          ? { ...x, category: fCat, title: fTitle.trim(), content: fContent.trim(), project_slug: fSlug.trim() || null, priority: fPriority }
          : x))
      } else {
        const res = await createPlaybookEntry(fCat, fTitle, fContent, fSlug || null, fPriority)
        if (!res.ok) { setError(ERROR_TEXT[res.error] ?? 'Error al crear'); return }
        setEntries(prev => [{
          id: crypto.randomUUID(), category: fCat, topic: '', title: fTitle.trim(),
          content: fContent.trim(), project_slug: fSlug.trim() || null, priority: fPriority, active: true,
        }, ...prev])
      }
      resetForm()
    })
  }

  function handleToggle(e: PlaybookRow) {
    startTransition(async () => {
      const res = await updatePlaybookEntry(e.id, { active: !e.active })
      if (res.ok) setEntries(prev => prev.map(x => x.id === e.id ? { ...x, active: !e.active } : x))
    })
  }

  function handleDelete(id: string) {
    if (confirmDelete !== id) { setConfirmDelete(id); return }
    setConfirmDelete(null)
    startTransition(async () => {
      const res = await deletePlaybookEntry(id)
      if (res.ok) setEntries(prev => prev.filter(x => x.id !== id))
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400">
          {entries.length} entradas · {entries.filter(e => e.active).length} activas
        </span>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300">
          <option value="">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600" />
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600">
          + Nueva entrada
        </button>
      </div>

      <p className="text-xs text-zinc-600">
        El playbook entra al prompt por prioridad (mayor primero) hasta llenar el presupuesto — lo más importante arriba.
      </p>

      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}

      {showForm && (
        <div className="rounded-xl border border-emerald-900/60 bg-zinc-900/80 p-4">
          <h3 className="text-sm font-semibold text-white">{editingId ? 'Editar entrada' : 'Nueva entrada del playbook'}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-zinc-400">Categoría</label>
              <select value={fCat} onChange={e => setFCat(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400">Proyecto (slug, opcional)</label>
              <input value={fSlug} onChange={e => setFSlug(e.target.value)} placeholder="vacío = aplica a todos"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400">Prioridad (mayor = primero)</label>
              <input type="number" value={fPriority} onChange={e => setFPriority(parseInt(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-zinc-400">Título</label>
            <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="Pitch principal Portacelli"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-zinc-400">Contenido</label>
            <textarea value={fContent} onChange={e => setFContent(e.target.value)} rows={6}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-zinc-200" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleSave} disabled={isPending}
              className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
              {isPending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear'}
            </button>
            <button onClick={resetForm} className="rounded-lg bg-zinc-800 px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-4">
        {filtered.map(e => {
          const cat = CATEGORIES.find(c => c.value === e.category)
          return (
            <div key={e.id} className={`rounded-xl border p-4 ${e.active ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-900 bg-zinc-950/50 opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cat?.color ?? 'bg-zinc-800 text-zinc-400'}`}>
                      {cat?.label ?? e.category}
                    </span>
                    {e.project_slug && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{e.project_slug}</span>}
                    {e.priority > 0 && <span className="text-[10px] text-zinc-600">prio {e.priority}</span>}
                    <span className="font-medium text-white">{e.title}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => handleToggle(e)}
                    className={`rounded-lg px-2 py-1 text-xs ${e.active ? 'bg-emerald-900/50 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}>
                    {e.active ? 'ON' : 'OFF'}
                  </button>
                  <button onClick={() => startEdit(e)} className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(e.id)}
                    className={`rounded-lg px-2 py-1 text-xs ${confirmDelete === e.id ? 'bg-red-700 text-white' : 'bg-zinc-800 text-zinc-500 hover:bg-red-950 hover:text-red-400'}`}>
                    {confirmDelete === e.id ? '¿Seguro?' : '✕'}
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <p className={`whitespace-pre-wrap text-xs leading-relaxed text-zinc-300 ${expandedId === e.id ? '' : 'line-clamp-3'}`}>
                  {e.content}
                </p>
                {e.content.length > 200 && (
                  <button onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                    className="mt-1 text-[11px] font-medium text-emerald-400 underline opacity-80 hover:opacity-100">
                    {expandedId === e.id ? 'Ver menos' : 'Ver completo'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-zinc-600">
            {entries.length === 0 ? 'Sin entradas todavía.' : 'Nada coincide con la búsqueda.'}
          </div>
        )}
      </div>
    </div>
  )
}
