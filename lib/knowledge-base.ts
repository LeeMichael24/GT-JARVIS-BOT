import { createClient } from '@supabase/supabase-js'

export interface KBEntry {
  category: string
  topic: string
  title: string
  content: string
  project_slug: string | null
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getPlaybook(projectSlug?: string | null): Promise<KBEntry[]> {
  const supabase = getSupabase()

  let query = supabase
    .from('knowledge_base')
    .select('category, topic, title, content, project_slug')
    .eq('active', true)
    .order('priority', { ascending: false })

  if (projectSlug) {
    query = query.or(`project_slug.is.null,project_slug.eq.${projectSlug}`)
  }

  const { data, error } = await query

  if (error) {
    console.warn('[knowledge-base] Failed to fetch:', error.message)
    return []
  }

  return (data ?? []) as KBEntry[]
}

/**
 * Aísla el playbook al proyecto en conversación: entradas generales (slug null)
 * + las de ESE proyecto. Evita contaminar el prompt con datos de otros proyectos.
 */
export function filterPlaybookByProject(
  entries: KBEntry[],
  projectSlug: string | null | undefined,
): KBEntry[] {
  if (!projectSlug) return entries
  return entries.filter(e => !e.project_slug || e.project_slug === projectSlug)
}

// Presupuesto del playbook en el prompt. Subió de 6K a 12K (~3K tokens) al
// sembrar la base de conocimiento de ventas/legal/financiera (migración 016):
// la competencia de Daniela ES el producto; el costo extra por mensaje es
// de centavos. El tope sigue existiendo para que la DB no infle el prompt.
const PLAYBOOK_PROMPT_BUDGET_CHARS = 12000

export function formatPlaybookForPrompt(entries: KBEntry[]): string {
  if (!entries.length) return ''

  const grouped: Record<string, KBEntry[]> = {}
  for (const e of entries) {
    if (!grouped[e.category]) grouped[e.category] = []
    grouped[e.category].push(e)
  }

  const categoryLabels: Record<string, string> = {
    project_pitch: 'PITCH DE PROYECTOS',
    sales_playbook: 'PLAYBOOK DE VENTAS',
    objection: 'MANEJO DE OBJECIONES',
    faq: 'PREGUNTAS FRECUENTES',
    closing_technique: 'TÉCNICAS DE CIERRE',
  }

  const sections: string[] = []
  for (const [cat, items] of Object.entries(grouped)) {
    const label = categoryLabels[cat] ?? cat.toUpperCase()
    const itemLines = items.map(i => `${i.title}: ${i.content.length > 450 ? i.content.slice(0, 450) + '…' : i.content}`).join('\n\n')
    sections.push(`${label}\n${itemLines}`)
  }

  const full = sections.join('\n\n')
  // Tope total: si el playbook crece en la DB, el prompt no explota
  return full.length > PLAYBOOK_PROMPT_BUDGET_CHARS
    ? full.slice(0, PLAYBOOK_PROMPT_BUDGET_CHARS) + '\n…(playbook truncado — el resto vive en el panel)'
    : full
}
