'use client'

import { useState, useTransition } from 'react'
import { createTag, deleteTag, updateTag } from '@/app/panel/actions'
import type { Tag } from '@/types'

export function ConfigTags({ tags }: { tags: Tag[] }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#10b981')
  const [error, setError] = useState<string | null>(null)

  return (
    <section>
      <h2 className="text-base font-medium text-white">Tags</h2>
      <p className="text-sm text-zinc-500">Para calificar y segmentar leads. Las reglas automáticas llegan en Fase 2.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map(t => (
          <span key={t.id} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: `${t.color}33`, color: t.color }}>
            {t.name}
            <input
              type="color"
              defaultValue={t.color}
              disabled={isPending}
              title="Cambiar color"
              aria-label={`Cambiar color de ${t.name}`}
              onBlur={e => {
                const newColor = e.target.value
                if (newColor === t.color) return
                setError(null)
                startTransition(async () => {
                  const res = await updateTag(t.id, t.name, newColor)
                  if (!res.ok) setError('No se pudo actualizar el color.')
                })
              }}
              className="h-4 w-4 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            <button
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(`¿Eliminar el tag "${t.name}"? Se quitará de todos los leads.`)) return
                setError(null)
                startTransition(async () => {
                  const res = await deleteTag(t.id)
                  if (!res.ok) setError('No se pudo eliminar el tag.')
                })
              }}
              title="Eliminar tag"
              aria-label={`Eliminar tag ${t.name}`}
              className="opacity-60 hover:opacity-100"
            ><span aria-hidden="true">✕</span></button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-sm text-zinc-600">Aún no hay tags</span>}
      </div>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={e => {
          e.preventDefault()
          setError(null)
          const trimmed = name.trim()
          if (!trimmed) return
          startTransition(async () => {
            const res = await createTag(trimmed, color)
            if (!res.ok) { setError('No se pudo crear (¿nombre repetido?)'); return }
            setName('')
          })
        }}
      >
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nuevo tag (ej. inversionista)"
          aria-label="Nombre del nuevo tag"
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600"
        />
        <input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label="Color del nuevo tag" className="h-8 w-10 cursor-pointer rounded border border-zinc-800 bg-zinc-900" />
        <button type="submit" disabled={isPending || !name.trim()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-40">
          Crear
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  )
}
