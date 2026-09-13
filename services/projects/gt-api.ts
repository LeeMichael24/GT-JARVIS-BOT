import { createCache } from './cache'
import type { GTProject } from '@/types'

const ONE_HOUR = 60 * 60 * 1000
// Timeout duro para la API de GT: si se cuelga, abortamos a los 5s en vez de
// consumir todo el presupuesto de la función serverless (cliente sin respuesta).
// El AbortError se propaga como cualquier otro error de fetch (los callers ya lo capturan).
const GT_API_TIMEOUT_MS = 5000
const projectsCache = createCache<GTProject[]>(ONE_HOUR)
const projectCache = createCache<GTProject | null>(ONE_HOUR)

function gtApiUrl(): string {
  return process.env.GT_API_URL!
}

function gtApiHeaders(): Record<string, string> {
  return { 'x-api-secret': process.env.GT_API_SECRET! }
}

export async function getAllProjects(typeFilter?: string): Promise<GTProject[]> {
  const cacheKey = typeFilter ? `all:${typeFilter}` : 'all'
  return projectsCache.get(cacheKey, async () => {
    const url = typeFilter
      ? `${gtApiUrl()}/listings?type=${typeFilter}`
      : `${gtApiUrl()}/listings`
    const res = await fetch(url, {
      headers: gtApiHeaders(),
      signal: AbortSignal.timeout(GT_API_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`GT API error: ${res.status} ${res.statusText}`)
    const data = await res.json() as GTProject[]
    return Array.isArray(data) ? data : []
  })
}

export async function getProjectBySlug(slug: string): Promise<GTProject | null> {
  return projectCache.get(slug, async () => {
    const res = await fetch(`${gtApiUrl()}/listings/${slug}`, {
      headers: gtApiHeaders(),
      signal: AbortSignal.timeout(GT_API_TIMEOUT_MS),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`GT API error: ${res.status} ${res.statusText}`)
    return res.json() as Promise<GTProject>
  })
}

/**
 * Canonicalises common spelling/synonym variants so that
 * "townhouses" matches a project named "Townhomes", etc.
 */
const SYNONYMS: [RegExp, string][] = [
  [/\btownhouses?\b/g, 'townhomes'],
  [/\btown\s+homes?\b/g, 'townhomes'],
  [/\btown\s+houses?\b/g, 'townhomes'],
  [/\bportaceli\b/g, 'portacelli'],       // common typo
  [/\bterranova\b/g, 'terranova'],        // already canonical, kept for consistency
  [/\bquintas?\b/g, 'quinta'],
]

function normalise(text: string): string {
  // Sin tildes: el cliente escribe "escalon" o "Escalón" indistintamente
  let t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [pattern, replacement] of SYNONYMS) {
    t = t.replace(pattern, replacement)
  }
  return t
}

/**
 * Palabras que aparecen en los nombres de muchos listings y no identifican a
 * ninguno. Antes contaban: "¿adónde está el proyecto?" resolvía al único
 * listing con "Proyecto" en el nombre, y "apartamentos Portacelli" al primer
 * "Apartamento…" del catálogo (13-sep-2026, conversación real de prueba).
 */
const GENERIC_WORDS = new Set([
  'proyecto', 'proyectos', 'apartamento', 'apartamentos', 'casa', 'casas', 'terreno', 'terrenos',
  'oficina', 'oficinas', 'local', 'locales', 'comercial', 'edificio', 'torre', 'fase', 'habitacional',
  'residencial', 'residencia', 'venta', 'alquiler', 'lujo', 'colonia', 'moderna', 'amueblada', 'vista',
  'exclusivo', 'espectacular', 'acceso', 'playa', 'privada', 'cerca', 'elegante', 'espaciosa',
  'familiar', 'niveles', 'excelente', 'negocio', 'bodega', 'centro', 'operaciones', 'estaciones',
  'premium', 'rentado', 'bosque', 'nuevo', 'remodelada', 'hasta', 'manzanas',
])

/**
 * Pistas de tipología: desempatan entre listings de una misma familia.
 * "apartamentos Portacelli" → Alta (Apartamentos), no Alba (Townhouses).
 */
const TYPE_HINTS: [RegExp, RegExp][] = [
  [/\b(apartamentos?|aptos?|departamentos?)\b/, /apartamento/],
  [/\b(townhomes|lofts?)\b/, /townhouse/],
  [/\bcasas?\b/, /casa|residencial/],
  [/\b(terrenos?|lotes?)\b/, /terreno/],
  [/\boficinas?\b/, /oficina/],
  [/\blocal(es)?\b/, /local/],
]

export interface ProjectResolution {
  project: GTProject | null
  /**
   * true cuando varios listings empatan. Si empatan dentro de una misma
   * familia ("portacelli" a secas) se devuelve uno de ellos igual —la familia
   * es correcta— pero quien llama NO debe pisar un listing más específico
   * que ya conocía con esta detección.
   */
  ambiguous: boolean
}

function tokens(text: string): Set<string> {
  return new Set(text.split(/[^a-z0-9]+/).filter(Boolean))
}

export function resolveProject(message: string, projects: GTProject[]): ProjectResolution {
  if (!projects.length) return { project: null, ambiguous: false }

  const msg = normalise(message)
  const msgWords = tokens(msg)
  const tieneTipo = TYPE_HINTS.filter(([enMensaje]) => enMensaje.test(msg)).map(([, enTipo]) => enTipo)

  const scored = projects.map(p => {
    const normName = normalise(p.name)
    // 1. Nombre completo o palabras del slug: certeza
    if (msg.includes(normName)) return { p, score: 1000 }
    if (p.slug && msg.includes(p.slug.replace(/-/g, ' '))) return { p, score: 900 }

    // 2. Palabras distintivas del nombre (≥4 letras, no genéricas), tolerando plural
    const distintivas = Array.from(tokens(normName)).filter(w => w.length >= 4 && !GENERIC_WORDS.has(w))
    const hits = distintivas.filter(w => msgWords.has(w) || msgWords.has(w + 's') || msgWords.has(w + 'es')).length
    if (hits === 0) return { p, score: 0 }

    // 3. La tipología mencionada desempata
    const tipo = normalise(p.type ?? '')
    const bonus = tieneTipo.some(re => re.test(tipo)) ? 3 : 0
    return { p, score: hits * 10 + bonus }
  })

  const best = Math.max(...scored.map(s => s.score))
  if (best <= 0) return { project: null, ambiguous: false }

  const top = scored.filter(s => s.score === best).map(s => s.p)
  if (top.length === 1) return { project: top[0], ambiguous: false }

  // Empate. Si todos son desarrollos de la misma familia (mismo primer
  // segmento del slug), la familia es segura aunque el listing no.
  // Entre listings sueltos de reventa no se adivina.
  const familias = new Set(top.map(p => p.slug.split('-')[0]))
  const sonDesarrollos = top.every(p => p.entityType === 'project' || p.entityType === 'investment')
  if (familias.size === 1 && sonDesarrollos) return { project: top[0], ambiguous: true }
  return { project: null, ambiguous: true }
}

export function detectProjectFromMessage(message: string, projects: GTProject[]): GTProject | null {
  return resolveProject(message, projects).project
}
