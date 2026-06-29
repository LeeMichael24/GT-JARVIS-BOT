import { getServiceClient } from '@/lib/supabase'
import type { EscalationRule } from '@/types'

/**
 * Fetch only active escalation rules (used in the webhook flow).
 */
export async function getActiveEscalationRules(): Promise<EscalationRule[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('escalation_rules')
    .select('*')
    .eq('active', true)
    .order('trigger_type')
  if (error) {
    console.warn('[escalation-rules] Failed to fetch active rules:', error.message)
    return []
  }
  return (data as EscalationRule[]) ?? []
}

/**
 * Fetch all escalation rules regardless of active status (used in admin panel).
 */
export async function getAllEscalationRules(): Promise<EscalationRule[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('escalation_rules')
    .select('*')
    .order('trigger_type')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getAllEscalationRules: ${error.message}`)
  return (data as EscalationRule[]) ?? []
}

/**
 * Check a user message against active keyword rules.
 * Returns all matching rules (case-insensitive partial match).
 */
export function matchKeywordRules(
  message: string,
  rules: EscalationRule[],
): EscalationRule[] {
  const lower = message.toLowerCase()
  return rules.filter(
    r => r.trigger_type === 'keyword' && lower.includes(r.trigger_value.toLowerCase()),
  )
}

/**
 * Build a prompt section that informs GPT-4o about matched escalation rules,
 * so it generates a natural reply but is forced to use the correct agent_action.
 */
export function formatEscalationRulesForPrompt(matched: EscalationRule[]): string {
  if (matched.length === 0) return ''

  const lines = matched.map(r => {
    const desc = r.description ?? r.trigger_value
    const actionLabel = r.action === 'escalate_ceo' ? 'escalate_ceo' : 'consult_team'
    return `- [${r.trigger_type}] "${r.trigger_value}": ${desc} → action: ${actionLabel}`
  })

  return `
# ESCALAMIENTO OBLIGATORIO DETECTADO
Las siguientes reglas de escalamiento aplican a este mensaje:
${lines.join('\n')}
DEBES usar type: "${matched[0].action}" en tu agent_action. No intentes resolver esto solo.
Si la acción es "escalate_ceo", di: "Te voy a conectar con Michael Narváez, nuestro CEO, para atenderte personalmente."
Si la acción es "consult_team", di: "Déjame verificar con mi equipo y te confirmo durante el día."
`
}
