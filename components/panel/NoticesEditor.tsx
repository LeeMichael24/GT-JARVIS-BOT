'use client'

import { useState, useTransition } from 'react'
import { createNotice, updateNotice, deleteNotice, type NoticeRow, type ProjectRow } from '@/app/panel/actions'

interface Props {
  rows: NoticeRow[]
  tableReady: boolean
  projects: ProjectRow[]
}

const EJEMPLOS = [
  'Se liberó la única unidad de 106 m² — la que estaba reservada se cayó.',
  'El precio de preventa sube el 1 de octubre. Se puede usar como urgencia real.',
  'Esta semana no hay visitas el sábado: el equipo está en el evento de Cayalá.',
]

function vigencia(n: NoticeRow, ahora: Date): { texto: string; tono: string } {
  if (!n.active) return { texto: 'apagado', tono: 'text-zinc-600' }
  if (n.ends_at) {
    const fin = new Date(n.ends_at)
    if (fin <= ahora) return { texto: 'vencido', tono: 'text-zinc-600' }
    const dias = Math.ceil((fin.getTime() - ahora.getTime()) / 86_400_000)
    return { texto: `vence en ${dias} día${dias === 1 ? '' : 's'}`, tono: 'text-emerald-400' }
  }
  return { texto: 'sin vencimiento', tono: 'text-amber-400' }
}

export function NoticesEditor({ rows, tableReady, projects }: Props) {
  const [notices, setNotices] = useState(rows)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  const [scope, setScope] = useState<'global' | 'project'>('project')
  const [projectSlug, setProjectSlug] = useState('')
  const [body, setBody] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const ahora = new Date()

  if (!tableReady) {
    return (
      <div className="rounded-lg border border-amber-900/60 bg-amber-950/40 p-4 text-sm text-amber-200">
        Falta correr <code className="rounded bg-black/30 px-1">migrations/020_projects_hub_and_notices.sql</code> en Supabase.
      </div>
    )
  }

  function crear() {
    setError(null)
    if (!body.trim()) return setError('Escribí el aviso.')
    if (scope === 'project' && !projectSlug) return setError('Elegí a qué proyecto aplica.')
    startTransition(async () => {
      const res = await createNotice({ scope, projectSlug: projectSlug || null, body, endsAt: endsAt || null })
      if (!res.ok) {
        setError(res.error === 'MUY_LARGO' ? 'Máximo 400 caracteres. Si necesitás más, eso es conocimiento, no un aviso.' : 'No se pudo crear.')
        return
      }
      setBody(''); setEndsAt(''); setAbierto(false)
      window.location.reload()
    })
  }

  function toggle(n: NoticeRow) {
    startTransition(async () => {
      const res = await updateNotice(n.id, { active: !n.active })
      if (res.ok) setNotices(ns => ns.map(x => x.id === n.id ? { ...x, active: !x.active } : x))
    })
  }

  function borrar(n: NoticeRow) {
    startTransition(async () => {
      const res = await deleteNotice(n.id)
      if (res.ok) setNotices(ns => ns.filter(x => x.id !== n.id))
    })
  }

  const nombre = (slug: string | null) => projects.find(p => p.slug === slug)?.name ?? slug ?? '—'

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-zinc-400">
          Lo que Daniela no puede saber por nadie más: ni por el cliente, ni por el Ecosistema.
          Entra arriba de su prompt y <strong className="text-zinc-200">manda sobre el catálogo</strong> —
          si un aviso contradice un dato, gana el aviso.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Ponele siempre fecha de vencimiento. Un aviso sin fecha nadie lo limpia, y en tres meses
          Daniela sigue ofreciendo una unidad que ya se vendió.
        </p>
      </div>

      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
        >
          Nuevo aviso
        </button>
      )}

      {abierto && (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setScope('project')}
              className={`rounded-lg border px-2.5 py-1.5 text-xs ${scope === 'project' ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-500'}`}
            >De un proyecto</button>
            <button
              onClick={() => setScope('global')}
              className={`rounded-lg border px-2.5 py-1.5 text-xs ${scope === 'global' ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-500'}`}
            >Para todo</button>
          </div>

          {scope === 'project' && (
            <select
              value={projectSlug}
              onChange={e => setProjectSlug(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-white"
            >
              <option value="">— ¿a qué proyecto aplica? —</option>
              {projects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          )}

          <div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={3}
              placeholder={EJEMPLOS[0]}
              className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-white placeholder:text-zinc-700 focus:border-zinc-600 focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[10px] text-zinc-600">Escribilo como se lo dirías a un vendedor nuevo.</span>
              <span className={`text-[10px] tabular-nums ${body.length > 400 ? 'text-red-400' : 'text-zinc-600'}`}>{body.length}/400</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-zinc-400">Vence el</label>
            <input
              type="date"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
            />
            {!endsAt && <span className="text-[10px] text-amber-400">sin fecha se queda para siempre</span>}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button onClick={crear} disabled={isPending} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {isPending ? 'Guardando…' : 'Crear aviso'}
            </button>
            <button onClick={() => { setAbierto(false); setError(null) }} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-400">
              Cancelar
            </button>
          </div>

          <div className="border-t border-zinc-800 pt-3">
            <p className="text-[11px] text-zinc-600">Ejemplos:</p>
            {EJEMPLOS.map(e => (
              <button key={e} onClick={() => setBody(e)} className="mt-1 block text-left text-[11px] text-zinc-500 hover:text-zinc-300">· {e}</button>
            ))}
          </div>
        </div>
      )}

      {notices.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
          Sin avisos. Daniela responde solo con el catálogo y su conocimiento.
        </p>
      ) : (
        <div className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
          {notices.map(n => {
            const v = vigencia(n, ahora)
            return (
              <div key={n.id} className={`flex flex-wrap items-start gap-3 bg-zinc-900/40 p-3 ${!n.active ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{n.body}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {n.scope === 'global' ? 'Todos los proyectos' : nombre(n.project_slug)}
                    {' · '}
                    <span className={v.tono}>{v.texto}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => toggle(n)} disabled={isPending} className="rounded-lg border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:text-white disabled:opacity-50">
                    {n.active ? 'Apagar' : 'Encender'}
                  </button>
                  <button onClick={() => borrar(n)} disabled={isPending} className="rounded-lg border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:border-red-900 hover:text-red-400 disabled:opacity-50">
                    Borrar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
