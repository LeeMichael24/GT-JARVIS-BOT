import { getServiceClient } from '@/lib/supabase'

/**
 * AVISOS OPERATIVOS — lo que Daniela no puede saber por nadie más.
 *
 * El catálogo del Ecosistema le dice qué existe y a qué precio. El
 * conocimiento le dice cómo se vende. Pero nada de eso cubre lo que pasa HOY
 * y solo sabe el equipo: "se liberó la única unidad de 106 m²", "el precio
 * sube el 1 de octubre", "esta semana no hay visitas el sábado".
 *
 * Tres reglas que los hacen distintos del conocimiento:
 *  1. CADUCAN. Sin `ends_at` nadie los limpia y Daniela termina ofreciendo
 *     una unidad que se vendió hace tres meses.
 *  2. MANDAN. Si un aviso contradice al catálogo o al conocimiento, gana el
 *     aviso — para eso lo escribió el equipo.
 *  3. Son pocos y cortos. Un aviso largo es conocimiento disfrazado.
 */

export interface Notice {
  id: string
  scope: 'global' | 'project'
  project_slug: string | null
  body: string
  priority: number
  starts_at: string
  ends_at: string | null
  active: boolean
}

/** Tope de seguridad: los avisos van arriba del prompt y no pueden inflarlo. */
const MAX_AVISOS = 12
const MAX_CHARS = 1600

/**
 * Avisos vigentes en este instante. Fail-safe: si la tabla aún no existe
 * (migración 020 sin correr) devuelve [] y el bot sigue igual que siempre.
 */
export async function getActiveNotices(now: Date = new Date()): Promise<Notice[]> {
  let supabase: ReturnType<typeof getServiceClient>
  try {
    supabase = getServiceClient()
  } catch {
    return []
  }

  const iso = now.toISOString()
  const { data, error } = await supabase
    .from('agent_notices')
    .select('id, scope, project_slug, body, priority, starts_at, ends_at, active')
    .eq('active', true)
    .lte('starts_at', iso)
    .or(`ends_at.is.null,ends_at.gt.${iso}`)
    .order('priority', { ascending: true })
    .limit(50)

  if (error) {
    console.warn('[notices] no se pudieron leer los avisos:', error.message)
    return []
  }
  return (data ?? []) as Notice[]
}

/**
 * Los que aplican a esta conversación: los globales siempre, los de proyecto
 * solo si es ESE proyecto. Un aviso de Foresta no tiene nada que hacer en una
 * conversación de Portacelli.
 */
export function noticesForProject(notices: Notice[], projectSlug: string | null | undefined): Notice[] {
  return notices.filter(n => n.scope === 'global' || (!!projectSlug && n.project_slug === projectSlug))
}

/** Bloque para el prompt. Vacío si no hay avisos — no gasta tokens de más. */
export function formatNoticesForPrompt(notices: Notice[]): string {
  if (!notices.length) return ''

  const lines: string[] = []
  let usado = 0
  for (const n of notices.slice(0, MAX_AVISOS)) {
    const linea = `· ${n.body.trim()}`
    if (usado + linea.length > MAX_CHARS) break
    lines.push(linea)
    usado += linea.length
  }
  if (!lines.length) return ''

  return `\n# AVISOS DE HOY — lo acaba de cargar el equipo
Esto es lo más fresco que tienes y MANDA sobre el catálogo y sobre tu conocimiento:
si un aviso contradice un dato que creías saber, el aviso gana y no lo mencionas como cambio.
Úsalos solo cuando vengan al caso en la conversación — no los recites.

${lines.join('\n')}
`
}
