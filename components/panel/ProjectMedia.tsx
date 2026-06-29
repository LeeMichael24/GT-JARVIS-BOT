'use client'

import type { GTProject } from '@/types'
import type { ProjectMedia as ProjectMediaType } from '@/lib/project-media'
import { hasAnyMedia } from '@/lib/project-media'

interface Props {
  projects: GTProject[]
  media: ProjectMediaType[]
}

function MediaBadge({ available, label }: { available: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        available
          ? 'bg-emerald-900/60 text-emerald-300'
          : 'bg-zinc-800 text-zinc-500'
      }`}
    >
      {available ? '✓' : '—'} {label}
    </span>
  )
}

export function ProjectMedia({ projects, media }: Props) {
  const mediaByName = new Map(media.map(m => [m.projectName.toLowerCase(), m]))

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Media por Proyecto</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Archivos que Daniela puede enviar cuando un cliente muestra interes profundo.
        </p>
      </div>

      {projects.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500">
          No se encontraron proyectos.
        </p>
      ) : (
        <div className="divide-y divide-zinc-800/60">
          {projects.map(p => {
            const m = mediaByName.get(p.name.toLowerCase())
            const configured = m ? hasAnyMedia(m) : false

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
                  <MediaBadge available={!!m?.brochureUrl} label="Brochure" />
                  <MediaBadge available={!!m?.priceListUrl} label="Precios" />
                  <MediaBadge available={!!m?.floorPlanUrl} label="Planos" />
                  <MediaBadge
                    available={!!m?.galleryUrls.length}
                    label={
                      m?.galleryUrls.length
                        ? `${m.galleryUrls.length} img`
                        : 'Galeria'
                    }
                  />
                  {!configured && (
                    <span className="text-xs text-zinc-600 italic self-center ml-1">
                      Sin media
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="border-t border-zinc-800 px-4 py-2.5">
        <p className="text-xs text-zinc-600">
          Para agregar media, edita el catalogo en <code className="text-zinc-500">lib/project-media.ts</code>.
          Proximamente: subida desde este panel.
        </p>
      </div>
    </div>
  )
}
