import { getServiceClient } from '@/lib/supabase'
import type { AgentObjective } from '@/types'

/**
 * Objetivos del negocio — configurables desde el panel (tabla
 * `agent_objectives`) e inyectados al prompt en cada mensaje:
 *
 * - scope 'general':    aplican SIEMPRE.
 * - scope 'project':    aplican cuando el proyecto detectado coincide
 *                       con target_key (nombre o slug, case-insensitive).
 * - scope 'investment': aplican cuando la conversación es de inversión
 *                       y la inversión/proyecto coincide con target_key.
 *
 * Fail-safe: sin tabla → [] y el prompt simplemente no lleva sección
 * de objetivos (Daniela sigue funcionando con su marco de decisión).
 */

export async function getActiveObjectives(): Promise<AgentObjective[]> {
  try {
    const { data, error } = await getServiceClient()
      .from('agent_objectives')
      .select('*')
      .eq('active', true)
      .order('priority', { ascending: true })
    if (error) {
      console.warn('[objectives] Failed to fetch:', error.message)
      return []
    }
    return (data as AgentObjective[]) ?? []
  } catch {
    return []
  }
}

function matchesTarget(targetKey: string | null, candidates: string[]): boolean {
  if (!targetKey) return false
  const t = targetKey.trim().toLowerCase()
  return candidates.some(c => {
    const lc = c.toLowerCase()
    return lc === t || lc.includes(t) || t.includes(lc)
  })
}

export interface ObjectiveContext {
  /** Nombre y slug del proyecto detectado en la conversación (si hay) */
  projectNames?: string[]
  /** Nombres de inversiones/sub-inversiones en foco (si la conversación es de inversión) */
  investmentNames?: string[]
  /** true cuando el turno es de inversión (intent investment_query o proyecto de inversión) */
  isInvestmentTopic?: boolean
}

/**
 * Sección de objetivos para el prompt. Devuelve '' si no hay objetivos
 * aplicables (la sección se omite del prompt).
 */
export function formatObjectivesForPrompt(
  objectives: AgentObjective[],
  ctx: ObjectiveContext = {},
): string {
  if (objectives.length === 0) return ''

  const general = objectives.filter(o => o.scope === 'general')
  const project = objectives.filter(
    o => o.scope === 'project' && matchesTarget(o.target_key, ctx.projectNames ?? []),
  )
  const investment = objectives.filter(
    o => o.scope === 'investment' && (
      matchesTarget(o.target_key, ctx.investmentNames ?? []) ||
      // Objetivo de inversión sin match exacto pero el tema ES inversión y
      // el target coincide con el proyecto en foco
      (ctx.isInvestmentTopic === true && matchesTarget(o.target_key, ctx.projectNames ?? []))
    ),
  )

  const sections: string[] = []
  if (general.length) {
    sections.push(`OBJETIVOS GENERALES (siempre aplican):\n${general.map(o => `- ${o.objective}`).join('\n')}`)
  }
  if (project.length) {
    sections.push(`OBJETIVO PARA ESTE PROYECTO (${project[0].target_key}):\n${project.map(o => `- ${o.objective}`).join('\n')}`)
  }
  if (investment.length) {
    sections.push(`OBJETIVO PARA ESTA INVERSIÓN (${investment[0].target_key}):\n${investment.map(o => `- ${o.objective}`).join('\n')}`)
  }
  if (sections.length === 0) return ''

  return `
# OBJETIVOS DEL NEGOCIO (configuración viva — guían cada decisión)
${sections.join('\n\n')}
`
}
