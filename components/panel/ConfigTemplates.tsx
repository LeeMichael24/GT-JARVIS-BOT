'use client'

import { useState, useTransition } from 'react'
import { createMessageTemplate, setTemplateActive } from '@/app/panel/proactive-actions'
import type { MessageTemplate, TemplateCategory } from '@/types'

const ERROR_TEXT: Record<string, string> = {
  INVALID_NAME: 'El nombre debe ser igual al de Meta: minúsculas, números y _',
  INVALID_VARIABLES: 'Variables: 0, 1 o 2.',
  EMPTY: 'Falta el texto de la plantilla.',
}

export function ConfigTemplates({ templates }: { templates: MessageTemplate[] }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('MARKETING')
  const [variables, setVariables] = useState(2)
  const [body, setBody] = useState('')

  return (
    <section>
      <h2 className="text-base font-medium text-white">Plantillas de Meta</h2>
      <p className="text-sm text-zinc-500">
        Registra aquí las plantillas YA aprobadas en WhatsApp Manager (mismo nombre exacto).
        Convención: {'{{1}}'} = nombre del cliente, {'{{2}}'} = interés/propiedad.
      </p>
      <ul className="mt-3 space-y-2">
        {templates.map(t => (
          <li key={t.id} className="rounded-lg border border-zinc-900 bg-zinc-900/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className={t.active ? 'font-mono text-emerald-400' : 'font-mono text-zinc-600 line-through'}>
                {t.name} <span className="text-xs text-zinc-500">({t.category.toLowerCase()}, {t.variables} var)</span>
              </p>
              <button
                disabled={isPending}
                onClick={() => startTransition(async () => { await setTemplateActive(t.id, !t.active) })}
                className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                {t.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-400">{t.body_preview}</p>
          </li>
        ))}
        {templates.length === 0 && <li className="text-sm text-zinc-600">Aún no hay plantillas registradas</li>}
      </ul>
      <form
        className="mt-3 space-y-2"
        onSubmit={e => {
          e.preventDefault()
          setError(null)
          startTransition(async () => {
            const res = await createMessageTemplate({ name, language: 'es', category, body_preview: body, variables })
            if (!res.ok) { setError(ERROR_TEXT[res.error] ?? 'No se pudo crear (¿nombre repetido?)'); return }
            setName(''); setBody('')
          })
        }}
      >
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="nombre_exacto_en_meta" aria-label="Nombre de la plantilla" className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-sm text-white outline-none focus:border-emerald-600" />
          <select value={category} onChange={e => setCategory(e.target.value as TemplateCategory)} aria-label="Categoría" className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300">
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
          </select>
          <select value={variables} onChange={e => setVariables(Number(e.target.value))} aria-label="Número de variables" className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300">
            <option value={0}>0 variables</option>
            <option value={1}>1 variable</option>
            <option value={2}>2 variables</option>
          </select>
        </div>
        <textarea value={body} onChange={e => setBody(e.target.value)} required rows={2} placeholder="Texto exacto de la plantilla con {{1}} y {{2}}…" aria-label="Texto de la plantilla" className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-600" />
        <button type="submit" disabled={isPending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-40">
          Registrar plantilla
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  )
}
