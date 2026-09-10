import { getServiceClient } from '@/lib/supabase'
import type { GTProject } from '@/types'

/**
 * REGISTRO DE PROYECTOS — el centro que le faltaba al esquema.
 *
 * No es una copia del catálogo. Guarda solo la identidad de cada listing
 * (slug, nombre, familia) más lo único que el API no puede decirnos: si HOY
 * recibe inversión de verdad. El API devuelve `status: "active"` en las 26
 * propiedades, así que ese dato no existe en ningún lado más.
 *
 * Precios, metrajes, disponibilidad y fechas siguen llegando vivos del
 * Ecosistema en cada mensaje. Acá no se duplica nada de eso.
 */

export interface ProjectRegistryRow {
  slug: string
  name: string
  project_key: string | null
  investable: boolean
  active: boolean
}

/**
 * La familia a la que pertenece un listing, derivada del slug:
 * 'portacelli-alta-fase-1-…' → 'portacelli'. Agrupa Alta, Alba y Raíces bajo
 * un mismo key para que el conocimiento de familia les aplique a los tres.
 * El panel la deja corregir cuando la heurística no acierta.
 */
export function familiaDeSlug(slug: string): string {
  return (slug.split('-')[0] ?? '').toLowerCase()
}

/**
 * Sincroniza el registro con el catálogo. Crea los nuevos, actualiza nombre y
 * tipo, y marca `active=false` los que ya no están — NUNCA borra: si un
 * listing sale del catálogo no queremos perder la ficha que costó escribir.
 * Tampoco toca `investable` ni `project_key`: esos los decide el equipo.
 */
export async function syncProjectsRegistry(projects: GTProject[]): Promise<{ synced: number }> {
  if (!projects.length) return { synced: 0 }

  let supabase: ReturnType<typeof getServiceClient>
  try {
    supabase = getServiceClient()
  } catch {
    return { synced: 0 }
  }

  const ahora = new Date().toISOString()
  const filas = projects
    .filter(p => p.slug)
    .map(p => ({
      slug: p.slug,
      name: p.name,
      entity_type: p.entityType ?? null,
      type: p.type ?? null,
      active: true,
      synced_at: ahora,
      updated_at: ahora,
    }))

  // onConflict slug: actualiza los que ya están sin pisar investable/project_key,
  // que no vienen en el payload.
  const { error } = await supabase.from('projects').upsert(filas, { onConflict: 'slug' })
  if (error) {
    console.warn('[projects-registry] no se pudo sincronizar:', error.message)
    return { synced: 0 }
  }

  // project_key solo para los que aún no lo tienen — no pisamos correcciones manuales
  for (const f of filas) {
    await supabase
      .from('projects')
      .update({ project_key: familiaDeSlug(f.slug) })
      .eq('slug', f.slug)
      .is('project_key', null)
  }

  // Los que dejaron de venir en el catálogo
  const vivos = filas.map(f => f.slug)
  await supabase
    .from('projects')
    .update({ active: false, updated_at: ahora })
    .eq('active', true)
    .not('slug', 'in', `(${vivos.map(s => `"${s}"`).join(',')})`)

  return { synced: filas.length }
}

/** Los proyectos que el equipo marcó como invertibles hoy. */
export async function getInvestableProjects(): Promise<ProjectRegistryRow[]> {
  let supabase: ReturnType<typeof getServiceClient>
  try {
    supabase = getServiceClient()
  } catch {
    return []
  }
  const { data, error } = await supabase
    .from('projects')
    .select('slug, name, project_key, investable, active')
    .eq('investable', true)
    .eq('active', true)
  if (error) return []
  return (data ?? []) as ProjectRegistryRow[]
}

/**
 * Bloque para el prompt. Éste es el requisito que no existía en el código:
 * de varias propiedades publicadas, HOY solo algunas reciben inversión de
 * verdad, y Daniela no tenía forma de distinguirlo.
 *
 * Vacío si nadie marcó ninguno — mejor no decir nada que afirmar de más.
 */
export function formatInvestableForPrompt(rows: ProjectRegistryRow[]): string {
  if (!rows.length) return ''
  const nombres = rows.map(r => r.name)
  const lista = nombres.length === 1
    ? nombres[0]
    : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`

  return `\n# DÓNDE SE PUEDE INVERTIR HOY
Todo el catálogo está publicado, pero hoy la inversión se está recibiendo en: ${lista}.
Si el cliente pregunta en qué invertir, hablas de ${nombres.length === 1 ? 'ése' : 'ésos'} y no listas el catálogo entero.
Los demás siguen disponibles para compra o alquiler normal — no digas que "no están disponibles", solo no los ofrezcas como inversión.
`
}
