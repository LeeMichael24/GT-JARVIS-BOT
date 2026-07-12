'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  createProjectMediaItem,
  updateProjectMediaItem,
  deleteProjectMediaItem,
} from '@/app/panel/actions'
import type { ProjectMediaItem, ProjectMediaType } from '@/lib/project-media'

const TYPES: { value: ProjectMediaType; label: string }[] = [
  { value: 'brochure', label: 'Brochure (PDF)' },
  { value: 'image', label: 'Imagen' },
  { value: 'video', label: 'Video' },
  { value: 'link', label: 'Link (ubicación)' },
  { value: 'price_list', label: 'Lista de precios (PDF)' },
  { value: 'floor_plan', label: 'Planos (PDF)' },
]

const TYPE_BADGE: Record<string, string> = {
  brochure: 'bg-emerald-900/60 text-emerald-300',
  image: 'bg-sky-900/60 text-sky-300',
  video: 'bg-purple-900/60 text-purple-300',
  link: 'bg-amber-900/60 text-amber-300',
  price_list: 'bg-teal-900/60 text-teal-300',
  floor_plan: 'bg-blue-900/60 text-blue-300',
}

const ERROR_TEXT: Record<string, string> = {
  EMPTY: 'El proyecto (clave) es requerido',
  INVALID_TYPE: 'Tipo de media inválido',
  INVALID_URL: 'La URL debe ser pública y empezar con https://',
}

export function MediaEditor({ items: initial }: { items: ProjectMediaItem[] }) {
  const [items, setItems] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [fKey, setFKey] = useState('')
  const [fType, setFType] = useState<ProjectMediaType>('brochure')
  const [fUrl, setFUrl] = useState('')
  const [fCaption, setFCaption] = useState('')
  const [fOrder, setFOrder] = useState(1)

  const grouped = useMemo(() => {
    const map = new Map<string, ProjectMediaItem[]>()
    for (const it of items) {
      if (!map.has(it.project_key)) map.set(it.project_key, [])
      map.get(it.project_key)!.push(it)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  function resetForm() {
    setFKey(''); setFType('brochure'); setFUrl(''); setFCaption(''); setFOrder(1)
    setShowForm(false); setEditingId(null)
  }

  function startEdit(it: ProjectMediaItem) {
    setFKey(it.project_key); setFType(it.media_type); setFUrl(it.url)
    setFCaption(it.caption ?? ''); setFOrder(it.sort_order)
    setEditingId(it.id); setShowForm(true)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      if (editingId) {
        const res = await updateProjectMediaItem(editingId, {
          project_key: fKey, media_type: fType, url: fUrl,
          caption: fCaption || null, sort_order: fOrder,
        })
        if (!res.ok) { setError(ERROR_TEXT[res.error] ?? 'Error al actualizar'); return }
        setItems(prev => prev.map(x => x.id === editingId
          ? { ...x, project_key: fKey.trim().toLowerCase(), media_type: fType, url: fUrl.trim(), caption: fCaption.trim() || null, sort_order: fOrder }
          : x))
      } else {
        const res = await createProjectMediaItem(fKey, fType, fUrl, fCaption || null, fOrder)
        if (!res.ok) { setError(ERROR_TEXT[res.error] ?? 'Error al crear'); return }
        setItems(prev => [...prev, {
          id: crypto.randomUUID(), project_key: fKey.trim().toLowerCase(), media_type: fType,
          url: fUrl.trim(), caption: fCaption.trim() || null, sort_order: fOrder, active: true,
        }])
      }
      resetForm()
    })
  }

  function handleToggle(it: ProjectMediaItem) {
    startTransition(async () => {
      const res = await updateProjectMediaItem(it.id, { active: !it.active })
      if (res.ok) setItems(prev => prev.map(x => x.id === it.id ? { ...x, active: !it.active } : x))
    })
  }

  function handleDelete(id: string) {
    if (confirmDelete !== id) { setConfirmDelete(id); return }
    setConfirmDelete(null)
    startTransition(async () => {
      const res = await deleteProjectMediaItem(id)
      if (res.ok) setItems(prev => prev.filter(x => x.id !== id))
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          Material que Daniela envía en el chat. Las URLs deben ser <strong>públicas (https)</strong> —
          WhatsApp las descarga directo. PDF ≤100MB · imagen ≤5MB · video MP4 ≤16MB.
        </p>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
        >
          + Agregar material
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}

      {showForm && (
        <div className="rounded-xl border border-emerald-900/60 bg-zinc-900/80 p-4">
          <h3 className="text-sm font-semibold text-white">{editingId ? 'Editar material' : 'Nuevo material'}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-zinc-400">Proyecto (clave en minúsculas)</label>
              <input value={fKey} onChange={e => setFKey(e.target.value)} placeholder="portacelli"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
              <p className="mt-0.5 text-[10px] text-zinc-600">Debe aparecer en el nombre del proyecto del catálogo</p>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400">Tipo</label>
              <select value={fType} onChange={e => setFType(e.target.value as ProjectMediaType)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400">Orden</label>
              <input type="number" value={fOrder} onChange={e => setFOrder(parseInt(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-zinc-400">URL pública (https)</label>
            <input value={fUrl} onChange={e => setFUrl(e.target.value)} placeholder="https://…/brochure.pdf"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200" />
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-zinc-400">Descripción / pie de foto (opcional)</label>
            <input value={fCaption} onChange={e => setFCaption(e.target.value)} placeholder="Brochure oficial de Portacelli"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleSave} disabled={isPending}
              className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
              {isPending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar'}
            </button>
            <button onClick={resetForm} className="rounded-lg bg-zinc-800 px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
        {grouped.map(([key, list]) => (
          <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="text-sm font-semibold capitalize text-white">{key}</h3>
            <div className="mt-2 space-y-1.5">
              {list.map(it => (
                <div key={it.id} className={`flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 ${it.active ? '' : 'opacity-50'}`}>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_BADGE[it.media_type]}`}>
                    {TYPES.find(t => t.value === it.media_type)?.label ?? it.media_type}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-400" title={it.url}>{it.url}</span>
                  {it.caption && <span className="hidden max-w-[180px] truncate text-[11px] text-zinc-500 sm:block">{it.caption}</span>}
                  <button onClick={() => handleToggle(it)}
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${it.active ? 'bg-emerald-900/50 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}>
                    {it.active ? 'ON' : 'OFF'}
                  </button>
                  <button onClick={() => startEdit(it)} className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(it.id)}
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${confirmDelete === it.id ? 'bg-red-700 text-white' : 'bg-zinc-800 text-zinc-500 hover:bg-red-950 hover:text-red-400'}`}>
                    {confirmDelete === it.id ? '¿Seguro?' : '✕'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="py-12 text-center text-sm text-zinc-600">
            Sin material todavía. Agrega el primero — o corre la migración 007 si la tabla no existe.
          </div>
        )}
      </div>
    </div>
  )
}
