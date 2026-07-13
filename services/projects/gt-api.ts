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
  let t = text.toLowerCase()
  for (const [pattern, replacement] of SYNONYMS) {
    t = t.replace(pattern, replacement)
  }
  return t
}

export function detectProjectFromMessage(message: string, projects: GTProject[]): GTProject | null {
  if (!projects.length) return null

  const msg = normalise(message)

  const match = projects.find(p => {
    const normName = normalise(p.name)

    // 1. Full name match
    if (msg.includes(normName)) return true

    // 2. Slug words match (e.g. "portacelli nuevo cuscatlan")
    if (p.slug) {
      const slugWords = p.slug.replace(/-/g, ' ')
      if (msg.includes(slugWords)) return true
    }

    // 3. Significant word match (words ≥ 4 chars from the project name)
    const nameWords = normName.split(/\s+/).filter(w => w.length >= 4)
    if (nameWords.some(w => msg.includes(w))) return true

    return false
  })

  return match ?? null
}
