/**
 * Ruteo interno del equipo: quién es del equipo y quién recibe cada alerta.
 *
 * El teléfono del CEO vive en CEO_PHONE_NUMBER con "+" al inicio, pero Meta
 * manda el `from` del webhook SIN "+". Comparar los dos crudos falla siempre
 * en silencio, así que todo pasa por normalizePhone antes de compararse.
 */

import { getServiceClient } from '@/lib/supabase'
import type { AgentActionType, TeamMember } from '@/types'

/** Lo mínimo que se necesita de un miembro del equipo para rutear una alerta. */
export type RoutableMember = Pick<TeamMember, 'id' | 'wa_phone'>

/**
 * Miembros activos del equipo, para reconocer números internos y rutear alertas.
 *
 * Si la lectura falla devuelve [] (misma convención que getActiveEscalationRules).
 * Consecuencia deliberada: sin datos del equipo solo se protege al CEO, y un
 * asesor podría recibir un mensaje de venta. El error inverso — tratar a un
 * cliente real como interno y dejarlo sin respuesta — cuesta una venta.
 */
export async function getActiveTeamMembers(): Promise<RoutableMember[]> {
  const { data, error } = await getServiceClient()
    .from('team_members')
    .select('id, wa_phone')
    .eq('active', true)

  if (error) {
    console.warn('[team-routing] No se pudo leer el equipo:', error.message)
    return []
  }
  return (data as RoutableMember[]) ?? []
}

/**
 * Deja solo los dígitos de un teléfono para poder compararlo.
 * "+503 6208-7916" y "50362087916" quedan idénticos.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * ¿Este número pertenece al equipo (CEO o un team_member activo)?
 *
 * Función pura: recibe ya resueltos el teléfono del CEO y los del equipo,
 * igual que matchKeywordRules recibe las reglas ya cargadas.
 *
 * Un número sin dígitos nunca coincide: si CEO_PHONE_NUMBER falta y el
 * `from` viniera vacío, marcar eso como "interno" dejaría sin respuesta a
 * quien escriba. Ante la duda, tratar como cliente.
 */
export function isInternal(
  phone: string,
  ceoPhone: string | undefined,
  teamPhones: (string | null)[],
): boolean {
  const target = normalizePhone(phone)
  if (!target) return false

  const known = [ceoPhone ?? null, ...teamPhones]
    .map(p => (p ? normalizePhone(p) : ''))
    .filter(p => p.length > 0)

  return known.includes(target)
}

/**
 * ¿A qué teléfono se manda esta alerta?
 *
 *   escalate_ceo  → siempre el CEO (dinero, documentos legales, reuniones)
 *   consult_team  → el asesor asignado al lead; si no hay, cae al CEO
 *
 * Devuelve el teléfono TAL CUAL está guardado (no normalizado): la Cloud API
 * acepta ambos formatos y así no se altera el envío que ya funciona hoy.
 * `undefined` significa que no hay a quién avisar — quien llama decide qué
 * hacer, igual que hoy cuando falta CEO_PHONE_NUMBER.
 */
export function pickAlertRecipient(
  actionType: AgentActionType,
  assignedTo: string | null,
  ceoPhone: string | undefined,
  team: RoutableMember[],
): string | undefined {
  if (actionType === 'consult_team' && assignedTo) {
    const advisor = team.find(m => m.id === assignedTo)
    if (advisor?.wa_phone && normalizePhone(advisor.wa_phone)) return advisor.wa_phone
  }
  return ceoPhone
}
