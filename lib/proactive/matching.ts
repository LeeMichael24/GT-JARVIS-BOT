import type { GTProject, Lead } from '@/types'

export interface ListingMatch {
  leadId: string
  score: number
  reason: string
}

const MIN_SCORE = 3
const MAX_MATCHES = 50

type ListingLite = Pick<GTProject, 'name' | 'entityType' | 'type' | 'location'>

function purposeCompatible(purpose: string | null | undefined, entityType: string | undefined): boolean {
  if (!purpose) return false
  if (purpose === 'ambos') return true
  if (purpose === 'inversion') return entityType === 'investment'
  if (purpose === 'vivienda_propia') return entityType === 'project' || entityType === 'residency'
  return false
}

const stripPlural = (w: string) => w.endsWith('s') ? w.slice(0, -1) : w

function interestOverlaps(interest: string | null, listing: ListingLite): boolean {
  if (!interest) return false
  const i = interest.toLowerCase()
  const hay = [listing.name, listing.type, listing.location].filter(Boolean).map(s => String(s).toLowerCase())
  // 1) el interés contiene el campo completo del listing (o viceversa)
  if (hay.some(h => i.includes(h) || h.includes(i))) return true
  // 2) tokens normalizados (sin plural) con IGUALDAD — evita casa≈casado
  const iWords = new Set(i.split(/\s+/).filter(w => w.length >= 4).map(stripPlural))
  return hay.some(h =>
    h.split(/\s+/).filter(w => w.length >= 4).map(stripPlural).some(w => iWords.has(w))
  )
}

export function matchLeadsToListing(listing: ListingLite, candidates: Lead[]): ListingMatch[] {
  const out: ListingMatch[] = []
  for (const lead of candidates) {
    let score = 0
    const reasons: string[] = []
    const purpose = lead.qualification_data?.purpose ?? null

    if (purposeCompatible(purpose, listing.entityType)) {
      score += 3
      reasons.push(purpose === 'inversion' ? 'Inversión' : purpose === 'ambos' ? 'Vivienda/Inversión' : 'Vivienda')
    }
    if (lead.stage === 'hot') { score += 2; reasons.push('etapa caliente') }
    if (lead.stage === 'warm') { score += 1; reasons.push('etapa tibia') }
    if (interestOverlaps(lead.project_interest, listing)) {
      score += 1
      reasons.push(`interesado en ${lead.project_interest}`)
    }

    if (score >= MIN_SCORE) {
      out.push({ leadId: lead.id, score, reason: reasons.join(' · ') })
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_MATCHES)
}
