import { getServiceClient } from '@/lib/supabase'
import type { ProjectMediaType } from '@/lib/project-media'

/**
 * Sincroniza el media de proyectos desde el Ecosistema Terranova hacia
 * la tabla `project_media` que Daniela lee. La fuente de verdad es el
 * Ecosistema; el bot mantiene una copia local (rápida, sin dependencia
 * en el hot path de la conversación).
 *
 * El Ecosistema expone:  GET {GT_API_URL}{GT_MEDIA_PATH}   (default /daniela/media)
 * con header  x-api-secret: {GT_API_SECRET}
 *
 * IMPORTANTE (privacidad): el endpoint SOLO debe devolver material marcado
 * como visible para prospectos/Daniela. Nunca contenido exclusivo de
 * clientes registrados. El bot confía en lo que el endpoint devuelve.
 */

const VALID_TYPES: ProjectMediaType[] = ['brochure', 'image', 'video', 'link', 'price_list', 'floor_plan']

export interface EcosystemMediaItem {
  project_key: string          // fragmento en minúsculas que aparece en el nombre del listing (ej: 'portacelli')
  project_slug?: string | null // slug canónico del listing (trazabilidad / match exacto)
  media_type: ProjectMediaType
  url: string                  // URL PÚBLICA https
  caption?: string | null
  sort_order?: number
}

export interface CleanMediaRow {
  project_key: string
  project_slug: string | null
  media_type: ProjectMediaType
  url: string
  caption: string | null
  sort_order: number
}

/** Valida y normaliza la respuesta del Ecosistema. Pura y testeable. */
export function validateEcosystemMedia(raw: unknown): CleanMediaRow[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { media?: unknown })?.media)
      ? (raw as { media: unknown[] }).media
      : []

  const clean: CleanMediaRow[] = []
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const m = it as Record<string, unknown>
    const url = typeof m.url === 'string' ? m.url.trim() : ''
    const key = typeof m.project_key === 'string' ? m.project_key.trim().toLowerCase() : ''
    const type = m.media_type as ProjectMediaType
    if (!url.startsWith('https://')) continue        // WhatsApp exige URL pública https
    if (!key) continue
    if (!VALID_TYPES.includes(type)) continue
    clean.push({
      project_key: key,
      project_slug: typeof m.project_slug === 'string' ? m.project_slug.trim() : null,
      media_type: type,
      url,
      caption: typeof m.caption === 'string' && m.caption.trim() ? m.caption.trim() : null,
      sort_order: typeof m.sort_order === 'number' ? m.sort_order : 0,
    })
  }
  return clean.slice(0, 500) // tope de seguridad
}

export type MediaSyncResult =
  | { synced: number }
  | { skipped: string }
  | { error: string }

export async function syncProjectMediaFromEcosystem(): Promise<MediaSyncResult> {
  const base = process.env.GT_API_URL
  const secret = process.env.GT_API_SECRET
  const path = process.env.GT_MEDIA_PATH ?? '/daniela/media'
  if (!base) return { skipped: 'no_gt_api_url' }

  let raw: unknown
  try {
    const res = await fetch(`${base}${path}`, {
      headers: secret ? { 'x-api-secret': secret } : {},
    })
    // Mientras el Ecosistema no exponga el endpoint (404), no-op silencioso
    if (!res.ok) return { skipped: `endpoint_${res.status}` }
    raw = await res.json()
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'fetch failed' }
  }

  const rows = validateEcosystemMedia(raw)
  const supabase = getServiceClient()

  // Reemplazo total del subconjunto 'ecosystem' — simple, sin filas stale.
  // Las filas 'manual' (sembradas/panel) NO se tocan.
  const del = await supabase.from('project_media').delete().eq('source', 'ecosystem')
  if (del.error) return { error: `delete: ${del.error.message}` }

  if (rows.length > 0) {
    const ins = await supabase.from('project_media').insert(
      rows.map(r => ({ ...r, source: 'ecosystem', active: true })),
    )
    if (ins.error) return { error: `insert: ${ins.error.message}` }
  }

  return { synced: rows.length }
}
