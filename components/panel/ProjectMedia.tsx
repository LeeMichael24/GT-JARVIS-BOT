'use client'

import type { GTProject } from '@/types'
import type { ProjectMediaItem, ProjectMediaType } from '@/lib/project-media'

interface Props {
  projects: GTProject[]
  items: ProjectMediaItem[]
}

const TYPE_LABEL: Record<ProjectMediaType, string> = {
  brochure: 'Brochure',
  price_list: 'Precios',
  floor_plan: 'Planos',
  image: 'Imágenes',
  video: 'Videos',
  link: 'Links',
}

function MediaBadge({ count, label }: { count: number; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        count > 0 ? 'bg-emerald-900/60 text-emerald-300' : 'bg-zinc-800 text-zinc-500'
      }`}
    >
      {count > 0 ? `✓ ${count > 1 ? count + ' ' : ''}` : '— '}{label}
    </span>
  )
}

export function ProjectMedia({ projects, items }: Props) {
  const forProject = (name: string) =>
    items.filter(i => name.toLowerCase().includes(i.project_key.toLowerCase()))

  const countBy = (list: ProjectMediaItem[], type: ProjectMediaType) =>
    list.filter(i => i.media_type === type).length

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Media por Proyecto</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Material que Daniela envía en el chat: brochures, imágenes, videos y links de ubicación.
        </p>
      </div>

      {projects.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500">
          No se encontraron proyectos.
        </p>
      ) : (
        <div className="divide-y divide-zinc-800/60">
          {projects.map(p => {
            const m = forProject(p.name)
            return (
              <div
                key={p.slug}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{p.name}</p>
                  <p className="text-xs text-zinc-500">{p.location}</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <MediaBadge count={countBy(m, 'brochure')} label={TYPE_LABEL.brochure} />
                  <MediaBadge count={countBy(m, 'image')} label={TYPE_LABEL.image} />
                  <MediaBadge count={countBy(m, 'video')} label={TYPE_LABEL.video} />
                  <MediaBadge count={countBy(m, 'link')} label={TYPE_LABEL.link} />
                  {m.length === 0 && (
                    <span className="ml-1 self-center text-xs italic text-zinc-600">Sin media</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="border-t border-zinc-800 px-4 py-2.5">
        <p className="text-xs text-zinc-600">
          El media vive en la tabla <code className="text-zinc-500">project_media</code> de Supabase —
          se agrega con SQL o desde el Ecosistema Terranova, sin deploy. Las URLs deben ser públicas.
        </p>
      </div>
    </div>
  )
}
