import { getServiceClient } from '@/lib/supabase'

/**
 * Media por proyecto — brochures (PDF), imágenes, videos y links.
 * Vive en la tabla `project_media` (Supabase): se agrega/edita SIN deploy.
 *
 * Las URLs deben ser PÚBLICAS: WhatsApp Cloud API las descarga server-side,
 * no pueden estar detrás de auth. Límites de WhatsApp: PDF ≤100MB,
 * imagen jpg/png ≤5MB, video mp4 ≤16MB.
 */

export type ProjectMediaType = 'brochure' | 'image' | 'video' | 'link' | 'price_list' | 'floor_plan'

export interface ProjectMediaItem {
  id: string
  project_key: string
  media_type: ProjectMediaType
  url: string
  caption: string | null
  sort_order: number
  active: boolean
}

/** Todos los items activos — se carga una vez por mensaje (tabla pequeña). */
export async function getAllProjectMediaItems(): Promise<ProjectMediaItem[]> {
  const { data, error } = await getServiceClient()
    .from('project_media')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) {
    // Tabla aún no migrada u otro fallo — sin media, pero el bot no muere
    console.warn('[project-media] No se pudo cargar media:', error.message)
    return []
  }
  return (data as ProjectMediaItem[]) ?? []
}

/** Items cuyo project_key aparece en el nombre del proyecto (match laxo). */
export function mediaForProject(items: ProjectMediaItem[], projectName: string): ProjectMediaItem[] {
  const name = projectName.toLowerCase()
  return items.filter(i => name.includes(i.project_key.toLowerCase()))
}

/** Nombres de proyecto (keys) que tienen algún media — para avisarle al prompt. */
export function mediaProjectKeys(items: ProjectMediaItem[]): string[] {
  return Array.from(new Set(items.map(i => i.project_key)))
}

/** Filtra por lo que el modelo pidió enviar (document agrupa los PDF). */
export function pickMediaToSend(
  items: ProjectMediaItem[],
  type: 'document' | 'image' | 'video' | 'link',
): ProjectMediaItem[] {
  if (type === 'document') {
    return items.filter(i => i.media_type === 'brochure' || i.media_type === 'price_list' || i.media_type === 'floor_plan')
  }
  return items.filter(i => i.media_type === type)
}
