import type { Lead } from '@/types'

// Meta no acepta parámetros vacíos en plantillas: fallbacks gramaticales.
const NAME_FALLBACK = 'qué gusto saludarte'
const INTEREST_FALLBACK = 'nuestras propiedades'

export function renderTemplate(bodyPreview: string, params: string[]): string {
  return bodyPreview.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '')
}

export function buildRecipientParams(
  lead: Pick<Lead, 'name' | 'project_interest'>,
  opts: { variables: number; listingName?: string }
): string[] {
  const p1 = lead.name?.trim() || NAME_FALLBACK
  const p2 = opts.listingName ?? (lead.project_interest?.trim() || INTEREST_FALLBACK)
  return [p1, p2].slice(0, opts.variables)
}
