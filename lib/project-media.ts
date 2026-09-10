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
  /**
   * Slug canónico del listing al que pertenece la pieza. Lo llena el sync del
   * Ecosistema (migración 008); las filas cargadas a mano lo dejan en null y
   * eso las vuelve material COMÚN de todo el project_key.
   */
  project_slug?: string | null
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

/**
 * Material que corresponde al proyecto en conversación.
 *
 * El match por `project_key` solo (ej: 'portacelli') no alcanza cuando un
 * mismo key agrupa varios listings: el brochure de Portacelli ALTA terminaba
 * saliendo en una conversación de ALBA porque ambos nombres contienen la
 * palabra. Por eso, cuando conocemos el slug del listing, mandamos lo suyo y
 * descartamos lo que pertenece a otro.
 *
 * Las filas sin `project_slug` (cargadas a mano en el panel) son material
 * COMÚN del key — la ubicación en Google Earth de Portacelli vale igual para
 * Alta, Alba y Raíces — así que siempre entran.
 */
export function mediaForProject(
  items: ProjectMediaItem[],
  projectName: string,
  projectSlug?: string | null,
): ProjectMediaItem[] {
  const name = projectName.toLowerCase()
  const delKey = items.filter(i => name.includes(i.project_key.toLowerCase()))

  if (!projectSlug) return delKey

  // Lo específico de ESTE listing + lo común del key. Lo que lleva el slug de
  // otro listing queda fuera.
  const propio = delKey.filter(i => i.project_slug === projectSlug || !i.project_slug)

  // Si el listing no tiene material propio ni común, no inventamos: mejor
  // nada que el material del proyecto vecino.
  return propio
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
