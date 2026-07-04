import type { Lead } from '@/types'

/**
 * Lead scoring A/B/C — determinista y explicable.
 * A = listo para atención prioritaria (comprador probable)
 * B = potencial real, necesita trabajo
 * C = frío, temprano o inactivo
 */
export type LeadScore = 'A' | 'B' | 'C'

export interface LeadScoreResult {
  score: LeadScore
  points: number
  reasons: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export function scoreLead(
  lead: Pick<Lead, 'stage' | 'qualification_data' | 'last_message_at'>,
  nowMs = Date.now(),
): LeadScoreResult {
  let points = 0
  const reasons: string[] = []

  switch (lead.stage) {
    case 'hot':
      points += 3
      reasons.push('Etapa caliente')
      break
    case 'warm':
      points += 2
      reasons.push('Etapa tibia')
      break
    case 'new':
      points += 1
      break
    case 'cold':
      reasons.push('Etapa fría')
      break
  }

  const q = lead.qualification_data
  if (q?.budget_ok === true) {
    points += 2
    reasons.push('Presupuesto confirmado')
  }
  if (q?.timeline === 'inmediato') {
    points += 2
    reasons.push('Timeline inmediato')
  } else if (q?.timeline === '3_meses') {
    points += 1
    reasons.push('Timeline 3 meses')
  }
  if (q?.decision_maker === true) {
    points += 1
    reasons.push('Toma la decisión')
  }
  if (q?.purpose === 'inversion' || q?.purpose === 'ambos') {
    points += 1
    reasons.push('Perfil inversionista')
  }

  if (lead.last_message_at) {
    const age = nowMs - Date.parse(lead.last_message_at)
    if (age < 2 * DAY_MS) {
      points += 1
      reasons.push('Activo últimas 48h')
    } else if (age > 7 * DAY_MS) {
      points -= 2
      reasons.push('Sin actividad +7 días')
    }
  }

  const score: LeadScore = points >= 6 ? 'A' : points >= 3 ? 'B' : 'C'
  return { score, points, reasons }
}

export const SCORE_STYLES: Record<LeadScore, string> = {
  A: 'bg-emerald-900/70 text-emerald-300 border border-emerald-700',
  B: 'bg-amber-900/70 text-amber-300 border border-amber-700',
  C: 'bg-zinc-800 text-zinc-500 border border-zinc-700',
}
