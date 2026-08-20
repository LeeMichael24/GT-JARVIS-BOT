'use client'

import { useState, useTransition } from 'react'
import { analyzeTraining, saveTrainingLearnings, updateBrainEntry, runCronJobNow } from '@/app/panel/actions'
import type { BrainEntry } from '@/types'

interface Proposal {
  category: string
  topic: string
  content: string
  confidence: number
  selected: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  pattern: 'Patrón',
  observation: 'Observación',
  correction: 'Corrección',
  metric: 'Métrica',
}

/**
 * Entrenamiento de Daniela:
 * 1. Manual — pegar conversaciones reales → análisis → revisar → guardar al cerebro.
 * 2. Bajo demanda — "Reflexionar ahora" (mismo motor del cron nocturno).
 * 3. Bandeja — aprendizajes que Daniela capturó sola (confianza < 70%) para promover o rechazar.
 */
export function TrainingStudio({ candidates: initialCandidates }: { candidates: BrainEntry[] }) {
  const [text, setText] = useState('')
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [analysisInfo, setAnalysisInfo] = useState<string | null>(null)
  const [candidates, setCandidates] = useState(initialCandidates)
  const [isPending, startTransition] = useTransition()
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'saving' | 'reflecting'>('idle')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function handleAnalyze() {
    setMsg(null)
    setPhase('analyzing')
    startTransition(async () => {
      const res = await analyzeTraining(text)
      setPhase('idle')
      if (!res.ok) {
        setMsg({
          kind: 'error',
          text: res.error === 'EMPTY' ? 'Pega una conversación primero'
            : res.error === 'TOO_LONG' ? 'Máximo 60,000 caracteres por análisis — divide la conversación'
            : res.error === 'NO_LEARNINGS' ? 'El análisis no encontró aprendizajes nuevos en este texto'
            : 'Error al analizar. Reintenta.',
        })
        return
      }
      setProposals(res.analysis.proposals.map(p => ({ ...p, selected: true })))
      setAnalysisInfo(
        `${res.analysis.proposals.length} aprendizaje${res.analysis.proposals.length !== 1 ? 's' : ''} propuesto${res.analysis.proposals.length !== 1 ? 's' : ''} · formato detectado: ${
          res.analysis.format === 'whatsapp_export' ? 'export de WhatsApp' : res.analysis.format === 'simple' ? 'CLIENTE:/EQUIPO:' : 'texto libre'
        }${res.analysis.messages ? ` · ${res.analysis.messages} mensajes` : ''}`,
      )
    })
  }

  function handleSaveSelected() {
    if (!proposals) return
    const selected = proposals.filter(p => p.selected)
    if (selected.length === 0) { setMsg({ kind: 'error', text: 'Selecciona al menos un aprendizaje' }); return }
    setMsg(null)
    setPhase('saving')
    startTransition(async () => {
      const res = await saveTrainingLearnings(selected.map(({ category, topic, content, confidence }) => ({ category, topic, content, confidence })))
      setPhase('idle')
      if (res.ok) {
        setMsg({ kind: 'ok', text: `✓ ${selected.length} aprendizaje${selected.length !== 1 ? 's' : ''} guardado${selected.length !== 1 ? 's' : ''} en el cerebro — Daniela ya los aplica (confianza 85%)` })
        setProposals(null)
        setText('')
        setAnalysisInfo(null)
      } else {
        setMsg({ kind: 'error', text: 'Error al guardar. Reintenta.' })
      }
    })
  }

  function handleReflectNow() {
    setMsg(null)
    setPhase('reflecting')
    startTransition(async () => {
      const res = await runCronJobNow('reflection')
      setPhase('idle')
      if (res.ok) {
        const r = res.result as { learned?: number; conversations?: number; skipped?: string; error?: string }
        if (r?.learned !== undefined) {
          setMsg({ kind: 'ok', text: `✓ Reflexión completada: ${r.learned} aprendizaje${r.learned !== 1 ? 's' : ''} de ${r.conversations} conversación${(r.conversations ?? 0) !== 1 ? 'es' : ''}. Recarga para verlos en la bandeja.` })
        } else if (r?.skipped) {
          setMsg({ kind: 'ok', text: 'Sin conversaciones con sustancia en las últimas 24h — nada que aprender todavía.' })
        } else {
          setMsg({ kind: 'error', text: `La reflexión falló: ${r?.error ?? 'error desconocido'}` })
        }
      } else {
        setMsg({ kind: 'error', text: 'Error al ejecutar la reflexión' })
      }
    })
  }

  function handlePromote(entry: BrainEntry) {
    setCandidates(prev => prev.filter(c => c.id !== entry.id))
    startTransition(async () => {
      const res = await updateBrainEntry(entry.id, { confidence: 0.75 })
      if (!res.ok) setCandidates(prev => [entry, ...prev])
    })
  }

  function handleReject(entry: BrainEntry) {
    setCandidates(prev => prev.filter(c => c.id !== entry.id))
    startTransition(async () => {
      const res = await updateBrainEntry(entry.id, { active: false })
      if (!res.ok) setCandidates(prev => [entry, ...prev])
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
      {/* ── 1. Pegar conversaciones reales ── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">📋 Entrenar con conversaciones reales</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Pega una conversación de WhatsApp (el export .txt, líneas &quot;CLIENTE: / EQUIPO:&quot;, o texto libre).
          Daniela la analiza, propone aprendizajes y tú decides cuáles guardar.
        </p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={8}
          maxLength={60_000}
          placeholder={'[12/5/26, 10:31] Cliente: Hola, vi el anuncio de Portacelli\n[12/5/26, 10:32] Daniela: ¡Hola! Qué bueno que te interesó...\n\n— o —\n\nCLIENTE: está muy caro\nEQUIPO: te entiendo, es una inversión importante. Fíjate que con el financiamiento directo...'}
          className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200 placeholder:text-zinc-600"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleAnalyze}
            disabled={isPending || !text.trim()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            {phase === 'analyzing' ? '🧠 Analizando…' : 'Analizar conversación'}
          </button>
          <span className="text-[11px] text-zinc-600">{text.length.toLocaleString()}/60,000</span>
        </div>
      </div>

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs ${msg.kind === 'ok' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'}`}>
          {msg.text}
        </p>
      )}

      {/* ── Propuestas del análisis ── */}
      {proposals && (
        <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/10 p-4">
          <h3 className="text-sm font-semibold text-white">Aprendizajes propuestos</h3>
          {analysisInfo && <p className="mt-0.5 text-xs text-zinc-500">{analysisInfo}</p>}
          <div className="mt-3 space-y-2">
            {proposals.map((p, i) => (
              <label key={i} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${p.selected ? 'border-emerald-800 bg-zinc-900/70' : 'border-zinc-800 bg-zinc-950 opacity-60'}`}>
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={() => setProposals(prev => prev!.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                  className="mt-1 accent-emerald-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-blue-900/60 px-2 py-0.5 text-[11px] font-medium text-blue-300">
                      {CATEGORY_LABELS[p.category] ?? p.category}
                    </span>
                    <span className="text-sm font-medium text-white">{p.topic}</span>
                  </div>
                  <textarea
                    value={p.content}
                    onChange={e => setProposals(prev => prev!.map((x, j) => j === i ? { ...x, content: e.target.value } : x))}
                    rows={2}
                    className="mt-1.5 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm leading-relaxed text-zinc-300"
                  />
                </div>
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSaveSelected}
              disabled={isPending}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {phase === 'saving' ? 'Guardando…' : `Guardar seleccionados (${proposals.filter(p => p.selected).length})`}
            </button>
            <button
              onClick={() => { setProposals(null); setAnalysisInfo(null) }}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:text-white"
            >
              Descartar todo
            </button>
          </div>
        </div>
      )}

      {/* ── 2. Reflexión bajo demanda ── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">🌙 Aprendizaje automático</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Cada noche Daniela analiza las conversaciones del día (cron diario, configurable en Ajustes).
          También puedes dispararlo ahora mismo — útil porque en Vercel Hobby los crons solo corren 1 vez al día.
        </p>
        <button
          onClick={handleReflectNow}
          disabled={isPending}
          className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-300 hover:border-emerald-700 hover:text-white disabled:opacity-40"
        >
          {phase === 'reflecting' ? '🌙 Reflexionando…' : 'Reflexionar sobre las últimas 24h ahora'}
        </button>
      </div>

      {/* ── 3. Bandeja de aprendizajes de Daniela ── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">
          🧠 Bandeja de revisión {candidates.length > 0 && <span className="text-purple-400">({candidates.length})</span>}
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Lo que Daniela aprendió sola (confianza &lt; 70% — aún NO entra a sus respuestas).
          <strong className="text-zinc-400"> Promover</strong> lo activa de inmediato; <strong className="text-zinc-400">rechazar</strong> lo descarta.
          Las observaciones repetidas {`≥3`} veces se promueven solas (configurable en Ajustes).
        </p>
        {candidates.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Bandeja vacía — nada pendiente de revisión. 🎉</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {candidates.map(c => (
              <div key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-purple-900/60 px-2 py-0.5 text-[11px] font-medium text-purple-300">Daniela</span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{CATEGORY_LABELS[c.category] ?? c.category}</span>
                      <span className="truncate text-sm font-medium text-white">{c.topic}</span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-300">{c.content}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      onClick={() => handlePromote(c)}
                      disabled={isPending}
                      className="rounded-lg bg-emerald-800/80 px-2.5 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-700 disabled:opacity-40"
                    >
                      ✓ Promover
                    </button>
                    <button
                      onClick={() => handleReject(c)}
                      disabled={isPending}
                      className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:bg-red-950 hover:text-red-300 disabled:opacity-40"
                    >
                      ✕ Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
