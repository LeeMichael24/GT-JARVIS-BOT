'use client'

import { useState, useTransition } from 'react'
import { savePromptBlock, resetPromptBlock, type PromptBlockPanelRow } from '@/app/panel/actions'

/**
 * Editor de la personalidad/voz/tono de Daniela por bloques.
 * Cada bloque tiene un default de fábrica (el prompt auditado) — editar
 * crea un override en la BD; "Restaurar" vuelve al default.
 */
export function PersonaEditor({ rows: initial, tableReady }: { rows: PromptBlockPanelRow[]; tableReady: boolean }) {
  const [rows, setRows] = useState(initial)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ key: string; kind: 'saved' | 'error'; msg: string } | null>(null)

  if (!tableReady) {
    return (
      <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-300">
        La tabla <code>prompt_blocks</code> aún no existe. Corre la migración
        <code className="mx-1">012_total_panel_config.sql</code> en el SQL Editor de Supabase y recarga.
        Mientras tanto Daniela usa la personalidad de fábrica (los textos que ves abajo).
      </div>
    )
  }

  function openBlock(row: PromptBlockPanelRow) {
    setOpenKey(row.key)
    setDraft(row.content)
    setStatus(null)
  }

  function handleSave(row: PromptBlockPanelRow) {
    startTransition(async () => {
      const res = await savePromptBlock(row.key, draft, row.enabled)
      if (res.ok) {
        setRows(prev => prev.map(r => r.key === row.key ? { ...r, content: draft.trim(), customized: true } : r))
        setStatus({ key: row.key, kind: 'saved', msg: 'Guardado — Daniela lo aplica en su próximo mensaje' })
      } else {
        setStatus({ key: row.key, kind: 'error', msg: res.error === 'TOO_LONG' ? 'Máximo 6000 caracteres por bloque' : 'Error al guardar' })
      }
    })
  }

  function handleToggle(row: PromptBlockPanelRow) {
    const nextEnabled = !row.enabled
    if (!nextEnabled && !window.confirm(`¿Desactivar el bloque "${row.title}"? Se OMITE completo del prompt de Daniela — puede cambiar mucho su comportamiento.`)) return
    startTransition(async () => {
      const res = await savePromptBlock(row.key, row.content, nextEnabled)
      if (res.ok) {
        setRows(prev => prev.map(r => r.key === row.key ? { ...r, enabled: nextEnabled, customized: true } : r))
      } else {
        setStatus({ key: row.key, kind: 'error', msg: 'Error al cambiar el estado' })
      }
    })
  }

  function handleReset(row: PromptBlockPanelRow) {
    if (!window.confirm(`¿Restaurar "${row.title}" al texto de fábrica? Tu versión editada se pierde.`)) return
    startTransition(async () => {
      const res = await resetPromptBlock(row.key)
      if (res.ok) {
        setRows(prev => prev.map(r => r.key === row.key ? { ...r, content: r.defaultContent, enabled: true, customized: false } : r))
        setDraft(row.defaultContent)
        setStatus({ key: row.key, kind: 'saved', msg: 'Restaurado al default de fábrica' })
      } else {
        setStatus({ key: row.key, kind: 'error', msg: 'Error al restaurar' })
      }
    })
  }

  const customized = rows.filter(r => r.customized).length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <p className="text-xs leading-relaxed text-zinc-400">
          Esta ES la personalidad de Daniela — su identidad, tono, reglas de venta y marco de decisión.
          Cada bloque se puede editar en vivo (aplica en su próximo mensaje, sin deploy) y siempre puedes
          <strong className="text-zinc-300"> restaurar el texto de fábrica</strong>.
          Los textos {'{{'}entre llaves{'}}'} son variables que se rellenan solas desde Ajustes (nombre del CEO, umbrales, etc.) — no las borres sin querer.
        </p>
        <p className="mt-1 text-[11px] text-zinc-600">
          {customized > 0 ? `${customized} bloque${customized !== 1 ? 's' : ''} personalizado${customized !== 1 ? 's' : ''} · el resto usa el default de fábrica` : 'Todos los bloques usan el default de fábrica'}
        </p>
      </div>

      {rows.map(row => {
        const isOpen = openKey === row.key
        return (
          <div key={row.key} className={`rounded-xl border transition-opacity ${row.enabled ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-800/50 bg-zinc-950 opacity-60'}`}>
            <button onClick={() => isOpen ? setOpenKey(null) : openBlock(row)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-white">{row.title}</span>
                  {row.customized && (
                    <span className="rounded-full bg-blue-900/60 px-2 py-0.5 text-[10px] font-medium text-blue-300">Personalizado</span>
                  )}
                  {!row.enabled && (
                    <span className="rounded-full bg-red-900/60 px-2 py-0.5 text-[10px] font-medium text-red-300">Desactivado</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{row.description}</p>
              </div>
              <span className="shrink-0 text-zinc-500">{isOpen ? '▾' : '▸'}</span>
            </button>

            {isOpen && (
              <div className="border-t border-zinc-800 px-4 py-3">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={Math.min(18, Math.max(6, draft.split('\n').length + 1))}
                  maxLength={6000}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleSave(row)}
                    disabled={isPending || !draft.trim() || draft.trim() === row.content}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
                  >
                    {isPending ? 'Guardando…' : 'Guardar bloque'}
                  </button>
                  <button
                    onClick={() => handleToggle(row)}
                    disabled={isPending}
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:text-white disabled:opacity-40"
                  >
                    {row.enabled ? 'Desactivar bloque' : 'Reactivar bloque'}
                  </button>
                  {row.customized && (
                    <button
                      onClick={() => handleReset(row)}
                      disabled={isPending}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-amber-400/80 hover:text-amber-300 disabled:opacity-40"
                    >
                      ↺ Restaurar default
                    </button>
                  )}
                  <span className="ml-auto text-[11px] text-zinc-600">{draft.length}/6000</span>
                </div>
                {status?.key === row.key && (
                  <p className={`mt-2 text-xs ${status.kind === 'saved' ? 'text-emerald-400' : 'text-red-400'}`}>{status.msg}</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
