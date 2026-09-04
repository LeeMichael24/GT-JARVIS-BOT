import { getServiceClient } from '@/lib/supabase'

/**
 * Sincroniza el CONOCIMIENTO de proyectos desde el Ecosistema Terranova hacia
 * knowledge_base. La regla del producto: Daniela solo trae de fábrica la
 * experticia universal de ventas; todo lo que describe proyectos (pitches,
 * ángulos, objeciones específicas) vive en Terranova y llega por aquí.
 * Proyecto nuevo en Terranova = Daniela ya sabe venderlo, sin deploys.
 *
 * El Ecosistema expone:  GET {GT_API_URL}{GT_KNOWLEDGE_PATH} (default /daniela/knowledge)
 * con header  x-api-secret: {GT_API_SECRET}   — mismas convenciones que /daniela/media.
 *
 * El sync administra SOLO las filas con source='ecosystem' (reemplazo total);
 * lo manual (panel/seeds) jamás se toca. Requiere migración 017 (columna source).
 */

const VALID_CATEGORIES = ['project_pitch', 'sales_playbook', 'objection', 'faq', 'closing_technique'] as const
type KnowledgeCategory = (typeof VALID_CATEGORIES)[number]

// El formatter del prompt trunca cada entrada a 450 chars — no aceptamos más.
const MAX_CONTENT_CHARS = 450

export interface CleanKnowledgeRow {
  category: KnowledgeCategory
  topic: string
  title: string
  content: string
  project_slug: string | null
  priority: number
}

/** Valida y normaliza la respuesta del Ecosistema. Pura y testeable. */
export function validateEcosystemKnowledge(raw: unknown): CleanKnowledgeRow[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { knowledge?: unknown })?.knowledge)
      ? (raw as { knowledge: unknown[] }).knowledge
      : []

  const clean: CleanKnowledgeRow[] = []
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const k = it as Record<string, unknown>
    const category = k.category as KnowledgeCategory
    const topic = typeof k.topic === 'string' ? k.topic.trim() : ''
    const title = typeof k.title === 'string' ? k.title.trim() : ''
    const content = typeof k.content === 'string' ? k.content.trim() : ''
    if (!VALID_CATEGORIES.includes(category)) continue
    if (!topic || !title || !content) continue
    clean.push({
      category,
      topic: topic.slice(0, 80),
      title: title.slice(0, 120),
      content: content.slice(0, MAX_CONTENT_CHARS),
      project_slug: typeof k.project_slug === 'string' && k.project_slug.trim() ? k.project_slug.trim() : null,
      priority: typeof k.priority === 'number' ? k.priority : 0,
    })
  }
  return clean.slice(0, 500) // tope de seguridad
}

export type KnowledgeSyncResult =
  | { synced: number }
  | { skipped: string }
  | { error: string }

export async function syncKnowledgeFromEcosystem(): Promise<KnowledgeSyncResult> {
  const base = process.env.GT_API_URL
  const secret = process.env.GT_API_SECRET
  const path = process.env.GT_KNOWLEDGE_PATH ?? '/daniela/knowledge'
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

  const rows = validateEcosystemKnowledge(raw)
  const supabase = getServiceClient()

  // Reemplazo total del subconjunto 'ecosystem' — simple, sin filas stale.
  const del = await supabase.from('knowledge_base').delete().eq('source', 'ecosystem')
  if (del.error) return { error: `delete: ${del.error.message}` }

  if (rows.length > 0) {
    const ins = await supabase.from('knowledge_base').insert(
      rows.map(r => ({ ...r, source: 'ecosystem', active: true })),
    )
    if (ins.error) return { error: `insert: ${ins.error.message}` }
  }

  return { synced: rows.length }
}
