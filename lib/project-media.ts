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

const TIPO_ES: Record<string, string> = {
  brochure: 'brochure', image: 'imagen', video: 'video', link: 'link',
  price_list: 'lista de precios', floor_plan: 'planos',
}

/**
 * Inventario para el prompt: qué material existe, de qué listing y cómo se
 * llama. Con solo la lista de keys ("portacelli") el modelo prometía un
 * brochure para cualquier Portacelli aunque solo Alta lo tuviera.
 * Las filas sin slug son material común de toda la familia.
 */
export function inventarioDeMaterial(
  items: ProjectMediaItem[],
  projects: { slug: string; name: string }[],
): string[] {
  // destino → pieza → cuántas. Cinco fotos con el mismo pie iban cinco veces
  // al prompt en cada mensaje; ahora van como "5 imágenes (…)".
  const grupos = new Map<string, Map<string, number>>()
  for (const i of items) {
    const listing = i.project_slug ? projects.find(p => p.slug === i.project_slug) : null
    const key = i.project_key.charAt(0).toUpperCase() + i.project_key.slice(1)
    const destino = listing?.name ?? (i.project_slug ? i.project_slug : `${key} (común a todos sus listings)`)
    const pieza = `${i.media_type}\u0000${i.caption ?? ''}`
    const piezas = grupos.get(destino) ?? new Map<string, number>()
    piezas.set(pieza, (piezas.get(pieza) ?? 0) + 1)
    grupos.set(destino, piezas)
  }
  return Array.from(grupos, ([destino, piezas]) => {
    const texto = Array.from(piezas, ([pieza, n]) => {
      const [tipo, caption] = pieza.split('\u0000')
      const nombre = TIPO_ES[tipo] ?? tipo
      const plural = nombre === 'imagen' ? 'imágenes' : nombre.endsWith('s') ? nombre : nombre + 's'
      const cuantas = n > 1 ? `${n} ${plural}` : nombre
      return `${cuantas}${caption ? ` ("${caption}")` : ''}`
    })
    return `${destino}: ${texto.join(', ')}`
  })
}

/** Cuántas imágenes salen como máximo en un paquete. WhatsApp agrupa 4 o más seguidas en un álbum. */
export const MAX_IMAGENES_PAQUETE = 6

/**
 * Las imágenes salen como UN paquete: todas sin pie de foto y después UN solo
 * texto que describe el conjunto. Antes cada imagen llevaba su caption y, como
 * las fotos de un mismo avance comparten descripción, el cliente recibía tres
 * fotos con el mismo texto repetido tres veces (30-sep-2026).
 */
export function paqueteDeImagenes(items: ProjectMediaItem[], max = MAX_IMAGENES_PAQUETE): { imagenes: ProjectMediaItem[]; texto: string | null } {
  const imagenes = items.slice(0, max)
  const captions = [...new Set(imagenes.map(i => i.caption?.trim()).filter((c): c is string => !!c))]
  return { imagenes, texto: captions.length ? captions.join('\n') : null }
}
