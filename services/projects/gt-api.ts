import { createCache } from './cache'
import type { GTProject } from '@/types'

const ONE_HOUR = 60 * 60 * 1000
const projectsCache = createCache<GTProject[]>(ONE_HOUR)
const projectCache = createCache<GTProject | null>(ONE_HOUR)

function gtApiUrl(): string {
  return process.env.GT_API_URL!
}

function gtApiHeaders(): Record<string, string> {
  return { 'x-api-secret': process.env.GT_API_SECRET! }
}

export async function getAllProjects(): Promise<GTProject[]> {
  return projectsCache.get('all', async () => {
    const url = `${gtApiUrl()}/listings`
    const res = await fetch(url, { headers: gtApiHeaders() })
    if (!res.ok) throw new Error(`GT API error: ${res.status} ${res.statusText}`)
    const data = await res.json() as GTProject[]
    return Array.isArray(data) ? data : []
  })
}

export async function getProjectBySlug(slug: string): Promise<GTProject | null> {
  return projectCache.get(slug, async () => {
    const res = await fetch(`${gtApiUrl()}/listings/${slug}`, {
      headers: gtApiHeaders(),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`GT API error: ${res.status} ${res.statusText}`)
    return res.json() as Promise<GTProject>
  })
}

export function detectProjectFromMessage(message: string, projects: GTProject[]): GTProject | null {
  if (!projects.length) return null
  const msg = message.toLowerCase()
  const match = projects.find(p => {
    const nameMatch = msg.includes(p.name.toLowerCase())
    const slugWords = p.slug ? p.slug.replace(/-/g, ' ') : ''
    const slugMatch = slugWords ? msg.includes(slugWords) : false
    const nameWords = p.name.toLowerCase().split(/\s+/).filter(w => w.length >= 4)
    const wordMatch = nameWords.some(w => msg.includes(w))
    return nameMatch || slugMatch || wordMatch
  })
  return match ?? null
}
