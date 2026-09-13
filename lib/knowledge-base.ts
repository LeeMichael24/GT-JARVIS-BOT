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

// Presupuesto del playbook en el prompt. Subió de 6K a 12K al sembrar la base
// de ventas/legal/financiera (migración 016) y a 14K cuando se vio que con 62
// entradas quedaban FUERA las 5 técnicas de cierre y 9 de 11 objeciones. La
// competencia de Daniela ES el producto; el tope sigue para que la BD no infle
// el prompt.
const PLAYBOOK_PROMPT_BUDGET_CHARS = 14000

// Qué entra primero cuando no cabe todo. Antes mandaba el orden de la BD y el
// tope cortaba por posición, a mitad de una entrada: entraban el post-venta y
// la compra corporativa, y quedaban afuera los cierres y las objeciones.
const ORDEN_CATEGORIAS = ['closing_technique', 'objection', 'project_pitch', 'sales_playbook', 'faq']

const categoryLabels: Record<string, string> = {
  project_pitch: 'PITCH DE PROYECTOS',
  sales_playbook: 'PLAYBOOK DE VENTAS',
  objection: 'MANEJO DE OBJECIONES',
  faq: 'PREGUNTAS FRECUENTES',
  closing_technique: 'TÉCNICAS DE CIERRE',
}

function recortar(content: string): string {
  return content.length > 450 ? content.slice(0, 450) + '…' : content
}

export function formatPlaybookForPrompt(entries: KBEntry[]): string {
  if (!entries.length) return ''

  // Lo anclado al proyecto en conversación (su ficha, sus FAQ) es lo más
  // específico y va primero; después lo universal, por categoría.
  const esEspecifica = (e: KBEntry) => !!(e.project_slug || e.project_key)
  const rango = (e: KBEntry) => {
    const cat = ORDEN_CATEGORIAS.indexOf(e.category)
    return (esEspecifica(e) ? 0 : 10) + (cat === -1 ? ORDEN_CATEGORIAS.length : cat)
  }
  const ordenadas = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rango(a.e) - rango(b.e) || a.i - b.i)
    .map(x => x.e)

  // Entra entera o no entra: una entrada cortada a la mitad es peor que ninguna
  const incluidas: KBEntry[] = []
  let usado = 0
  let fuera = 0
  for (const e of ordenadas) {
    const costo = `${e.title}: ${recortar(e.content)}`.length + 2
    if (usado + costo > PLAYBOOK_PROMPT_BUDGET_CHARS) { fuera++; continue }
    incluidas.push(e)
    usado += costo
  }

  const secciones: { clave: string; label: string; items: KBEntry[] }[] = []
  for (const e of incluidas) {
    const clave = `${esEspecifica(e) ? 'p' : 'u'}:${e.category}`
    let sec = secciones.find(x => x.clave === clave)
    if (!sec) {
      const base = categoryLabels[e.category] ?? e.category.toUpperCase()
      sec = { clave, label: esEspecifica(e) ? `${base} — DE ESTE PROYECTO` : base, items: [] }
      secciones.push(sec)
    }
    sec.items.push(e)
  }

  const full = secciones
    .map(sec => `${sec.label}\n${sec.items.map(i => `${i.title}: ${recortar(i.content)}`).join('\n\n')}`)
    .join('\n\n')
  return fuera > 0
    ? `${full}\n\n…(playbook truncado — ${fuera} entradas quedaron fuera; el resto vive en el panel)`
    : full
}
