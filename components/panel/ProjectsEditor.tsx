'use client'

import { useState, useTransition, useMemo } from 'react'
import { updateProject, saveFichaCampo, type ProjectRow } from '@/app/panel/actions'
import { FICHA_CAMPOS, completitud } from '@/lib/project-profile'

interface Props {
  rows: ProjectRow[]
  tableReady: boolean
  /**
   * Todas las fichas de una vez, por slug. Son 26 proyectos x 10 campos como
   * mucho: cargarlas juntas sale más barato que un endpoint extra y hace que
   * cambiar de proyecto sea instantáneo.
   */
  fichas: Record<string, Record<string, string>>
}

export function ProjectsEditor({ rows, tableReady, fichas }: Props) {
  const [projects, setProjects] = useState(rows)
  const [slug, setSlug] = useState<string | null>(rows[0]?.slug ?? null)
  const [todas, setTodas] = useState(fichas)
  const ficha = (slug && todas[slug]) || {}
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const proyecto = useMemo(() => projects.find(p => p.slug === slug) ?? null, [projects, slug])
  const avance = useMemo(
    () => completitud(Object.entries(ficha).filter(([, v]) => v.trim()).map(([k]) => k)),
    [ficha],
  )
  const invertible = projects.filter(p => p.investable)

  if (!tableReady) {
    return (
      <div className="rounded-lg border border-amber-900/60 bg-amber-950/40 p-4 text-sm text-amber-200">
        Falta correr <code className="rounded bg-black/30 px-1">migrations/020_projects_hub_and_notices.sql</code> en
        Supabase. Hasta entonces esta pestaña no tiene de dónde leer, y Daniela sigue funcionando igual que antes.
      </div>
    )
  }

  function setCampo(key: string, valor: string) {
    if (!slug) return
    setTodas(t => ({ ...t, [slug]: { ...(t[slug] ?? {}), [key]: valor } }))
  }

  function guardarCampo(key: string) {
    if (!slug) return
    setGuardando(key)
    setError(null)
    startTransition(async () => {
      const res = await saveFichaCampo(slug, key, ficha[key] ?? '')
      setGuardando(null)
      if (!res.ok) {
        setError(res.error === 'MUY_LARGO'
          ? 'Ese campo pasa de 450 caracteres. Cortalo — el prompt lo truncaría igual y quedaría a medias frente al cliente.'
          : 'No se pudo guardar.')
      }
    })
  }

  function toggleInvertible(p: ProjectRow) {
    startTransition(async () => {
      const res = await updateProject(p.slug, { investable: !p.investable })
      if (res.ok) setProjects(ps => ps.map(x => x.slug === p.slug ? { ...x, investable: !x.investable } : x))
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-400">
        Todo lo que Daniela sabe de un proyecto, en un solo lugar. Los precios, metrajes y disponibilidad
        NO se escriben acá — esos llegan vivos del Ecosistema en cada mensaje. Acá va lo que no cambia:
        por qué comprar éste, sus objeciones y sus límites.
      </p>

      {/* ── Cuál recibe inversión hoy ── */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">¿Cuál recibe inversión hoy?</h3>
        <p className="mt-1 text-xs text-zinc-500">
          El Ecosistema marca las {projects.length} propiedades como activas, así que no hay forma de que
          Daniela lo deduzca sola. Marcá acá el que de verdad está recibiendo inversión.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {projects.map(p => (
            <button
              key={p.slug}
              onClick={() => toggleInvertible(p)}
              disabled={isPending}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                p.investable
                  ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p.investable ? '● ' : '○ '}{p.name}
            </button>
          ))}
        </div>
        {invertible.length === 0 && (
          <p className="mt-3 text-xs text-amber-400">
            Ninguno marcado todavía. Mientras tanto, si un cliente pregunta &ldquo;¿en qué puedo invertir?&rdquo;,
            Daniela no tiene con qué responder sin listar el catálogo entero.
          </p>
        )}
      </section>

      {/* ── Ficha ── */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">Ficha del proyecto</h3>
          <select
            value={slug ?? ''}
            onChange={e => { setSlug(e.target.value || null); setError(null) }}
            className="min-w-0 max-w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
          >
            <option value="">— elegí un proyecto —</option>
            {projects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </div>

        {proyecto && (
          <>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full bg-emerald-600 transition-all" style={{ width: `${avance.pct}%` }} />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                {avance.llenos} de {avance.total}
              </span>
            </div>

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

            <div className="mt-4 space-y-4">
              {FICHA_CAMPOS.map(campo => {
                const valor = ficha[campo.key] ?? ''
                const lleno = !!valor.trim()
                return (
                  <div key={campo.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <label className="text-xs font-medium text-white">
                        {lleno ? '✓ ' : ''}{campo.label}
                      </label>
                      <span className={`text-[10px] tabular-nums ${valor.length > 450 ? 'text-red-400' : 'text-zinc-600'}`}>
                        {valor.length}/450
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{campo.hint}</p>
                    <textarea
                      value={valor}
                      onChange={e => setCampo(campo.key, e.target.value)}
                      onBlur={() => guardarCampo(campo.key)}
                      rows={campo.rows}
                      placeholder="Vacío = Daniela no dice nada de esto"
                      className="mt-1.5 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-white placeholder:text-zinc-700 focus:border-zinc-600 focus:outline-none"
                    />
                    {guardando === campo.key && <p className="mt-1 text-[10px] text-zinc-500">Guardando…</p>}
                  </div>
                )
              })}
            </div>
            <p className="mt-4 text-[11px] text-zinc-600">
              Se guarda solo al salir de cada campo. Dejarlo vacío borra ese dato.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
