'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  createProjectScript,
  updateProjectScript,
  deleteProjectScript,
  toggleProjectScript,
} from '@/app/panel/actions'
import type { ProjectScript } from '@/lib/project-scripts'

const ERROR_TEXT: Record<string, string> = {
  EMPTY: 'El nombre del proyecto y el guion son requeridos',
  NO_KEYWORDS: 'Agrega al menos una palabra clave (separadas por coma)',
}

export function ScriptsEditor({ scripts: initial }: { scripts: ProjectScript[] }) {
  const [scripts, setScripts] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formKeywords, setFormKeywords] = useState('')
  const [formScript, setFormScript] = useState('')

  const filtered = useMemo(() => {
    if (!search) return scripts
    const q = search.toLowerCase()
    return scripts.filter(s =>
      s.project_name.toLowerCase().includes(q) ||
      s.trigger_keywords.some(k => k.includes(q)) ||
      s.script.toLowerCase().includes(q),
    )
  }, [scripts, search])

  function resetForm() {
    setFormName('')
    setFormKeywords('')
    setFormScript('')
    setShowForm(false)
    setEditingId(null)
  }

  function startEdit(s: ProjectScript) {
    setFormName(s.project_name)
    setFormKeywords(s.trigger_keywords.join(', '))
    setFormScript(s.script)
    setEditingId(s.id)
    setShowForm(true)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      if (editingId) {
        const res = await updateProjectScript(editingId, {
          project_name: formName,
          keywordsRaw: formKeywords,
          script: formScript,
        })
        if (!res.ok) { setError(ERROR_TEXT[res.error] ?? 'Error al actualizar'); return }
        setScripts(prev => prev.map(s =>
          s.id === editingId
            ? {
                ...s,
                project_name: formName.trim(),
                trigger_keywords: formKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
                script: formScript.trim(),
              }
            : s,
        ))
      } else {
        const res = await createProjectScript(formName, formKeywords, formScript)
        if (!res.ok) { setError(ERROR_TEXT[res.error] ?? 'Error al crear'); return }
        setScripts(prev => [{
          id: crypto.randomUUID(),
          project_name: formName.trim(),
          trigger_keywords: formKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
          script: formScript.trim(),
          active: true,
        }, ...prev])
      }
      resetForm()
    })
  }

  function handleToggle(s: ProjectScript) {
    startTransition(async () => {
      const res = await toggleProjectScript(s.id, !s.active)
      if (res.ok) {
        setScripts(prev => prev.map(x => x.id === s.id ? { ...x, active: !s.active } : x))
      }
    })
  }

  function handleDelete(id: string) {
    if (confirmDelete !== id) { setConfirmDelete(id); return }
    setConfirmDelete(null)
    startTransition(async () => {
      const res = await deleteProjectScript(id)
      if (res.ok) setScripts(prev => prev.filter(s => s.id !== id))
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Header: stats + búsqueda + nuevo */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400">
          {scripts.length} guion{scripts.length === 1 ? '' : 'es'} · {scripts.filter(s => s.active).length} activo{scripts.filter(s => s.active).length === 1 ? '' : 's'}
        </span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por proyecto o keyword…"
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
        >
          + Nuevo guion
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}

      {/* Formulario crear/editar */}
      {showForm && (
        <div className="rounded-xl border border-emerald-900/60 bg-zinc-900/80 p-4">
          <h3 className="text-sm font-semibold text-white">
            {editingId ? 'Editar guion' : 'Nuevo guion de venta'}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-zinc-400">Proyecto</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Portacelli"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400">
                Palabras clave que activan el guion <span className="text-zinc-600">(separadas por coma)</span>
              </label>
              <input
                value={formKeywords}
                onChange={e => setFormKeywords(e.target.value)}
                placeholder="portacelli, porta celli"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-zinc-400">
              El guion — se guarda y se ve TAL CUAL lo escribas (saltos de línea, emojis, negritas de WhatsApp)
            </label>
            <textarea
              value={formScript}
              onChange={e => setFormScript(e.target.value)}
              rows={16}
              placeholder={'PASO 1 — SALUDO INICIAL (primer mensaje):\n"Buen día! Le saluda Daniela..."\n\nPASO 2 — CUANDO DA SU NOMBRE (dos burbujas — usa extra_messages):\n...'}
              className="mt-1 w-full whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200"
            />
            <p className="mt-1 text-[11px] text-zinc-600">
              Tips: numera los pasos (PASO 1, PASO 2…) · para doble burbuja indica &quot;usa extra_messages&quot; · para adjuntar material indica &quot;activa send_media type document/image/video/link&quot; · agrega una sección de PREGUNTAS FRECUENTES y las REGLAS DEL GUION al final.
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {isPending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear guion'}
            </button>
            <button
              onClick={resetForm}
              className="rounded-lg bg-zinc-800 px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-4">
        {filtered.map(s => (
          <div key={s.id} className={`rounded-xl border p-4 ${s.active ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-900 bg-zinc-950/50 opacity-60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-white">{s.project_name}</span>
                  {!s.active && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">Inactivo</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.trigger_keywords.map(k => (
                    <span key={k} className="rounded-full bg-blue-900/50 px-2 py-0.5 text-[11px] text-blue-300">{k}</span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => handleToggle(s)}
                  title={s.active ? 'Desactivar' : 'Activar'}
                  className={`rounded-lg px-2 py-1 text-xs ${s.active ? 'bg-emerald-900/50 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}
                >
                  {s.active ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => startEdit(s)}
                  className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className={`rounded-lg px-2 py-1 text-xs ${confirmDelete === s.id ? 'bg-red-700 text-white' : 'bg-zinc-800 text-zinc-500 hover:bg-red-950 hover:text-red-400'}`}
                >
                  {confirmDelete === s.id ? '¿Seguro?' : '✕'}
                </button>
              </div>
            </div>

            {/* El guion, tal cual se escribió */}
            <div className="mt-3 rounded-lg bg-zinc-950 p-3">
              <pre className={`whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-300 ${expandedId === s.id ? '' : 'max-h-40 overflow-hidden'}`}>
                {s.script}
              </pre>
              <button
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                className="mt-2 text-[11px] font-medium text-emerald-400 underline opacity-80 hover:opacity-100"
              >
                {expandedId === s.id ? 'Ver menos' : 'Ver guion completo'}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-zinc-600">
            {scripts.length === 0
              ? 'Sin guiones todavía. Crea el primero con "+ Nuevo guion" — o corre la migración 007 si aún no existe la tabla.'
              : 'Nada coincide con la búsqueda.'}
          </div>
        )}
      </div>
    </div>
  )
}
