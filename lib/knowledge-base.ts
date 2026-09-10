import { createClient } from '@supabase/supabase-js'

export interface KBEntry {
  category: string
  topic: string
  title: string
  content: string
  /** Ancla la entrada a UN listing del catálogo. */
  project_slug: string | null
  /**
   * Ancla la entrada a una FAMILIA de proyecto ('portacelli' cubre Alta, Alba
   * y Raíces). Misma convención que project_media. Sin key y sin slug, la
   * entrada es conocimiento universal de venta y entra en toda conversación.
   */
  project_key?: string | null
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Trae TODO el conocimiento activo. El alcance por proyecto se decide después,
 * en filterPlaybookByProject: hacerlo en SQL no alcanzaba porque una entrada
 * puede estar anclada a una familia (project_key) y no a un listing.
 * La tabla es chica (decenas de filas), así que traerla entera sale gratis.
 */
export async function getPlaybook(projectSlug?: string | null): Promise<KBEntry[]> {
  const supabase = getSupabase()

  const traer = (columnas: string) =>
    supabase
      .from('knowledge_base')
      .select(columnas)
      .eq('active', true)
      .order('priority', { ascending: false })

  let { data, error } = await traer('category, topic, title, content, project_slug, project_key')

  // Fallback-safe: entre el deploy y la migración 019 la columna project_key
  // no existe todavía. Sin esto la consulta falla entera y Daniela se queda
  // SIN playbook — mucho peor que perder el alcance por familia.
  if (error && /project_key/.test(error.message)) {
    console.warn('[knowledge-base] project_key aún no existe (falta migración 019) — sigo sin alcance por familia')
    ;({ data, error } = await traer('category, topic, title, content, project_slug'))
  }

  if (error) {
    console.warn('[knowledge-base] Failed to fetch:', error.message)
    return []
  }

  return (data ?? []) as unknown as KBEntry[]
}

/**
 * Aísla el playbook al proyecto en conversación.
 *
 * Tres alcances posibles por entrada:
 *  · sin slug ni key  → universal: técnicas de venta, ITBR, CNR, FSV. Siempre entra.
 *  · project_slug     → un listing exacto.
 *  · project_key      → una familia ('portacelli' = Alta + Alba + Raíces).
 *
 * Una entrada con alcance NO entra si no sabemos de qué proyecto se habla:
 * decirle a alguien que pregunta por un alquiler en Escalón que "incluye 2
 * parqueos techados" es inventar. Antes sí entraba, y esa era la fuga.
 */
export function filterPlaybookByProject(
  entries: KBEntry[],
  projectSlug: string | null | undefined,
  projectName?: string | null,
): KBEntry[] {
  const nombre = (projectName ?? '').toLowerCase()
  return entries.filter(e => {
    if (!e.project_slug && !e.project_key) return true
    if (e.project_slug) return !!projectSlug && e.project_slug === projectSlug
    return !!nombre && nombre.includes(e.project_key!.toLowerCase())
  })
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
