import { describe, it, expect } from 'vitest'
import { detectProjectFromMessage } from '@/services/projects/gt-api'
import type { GTProject } from '@/types'

const projects: GTProject[] = [
  {
    slug: 'portacelli-nuevo-cuscatlan',
    name: 'Portacelli Nuevo Cuscatlán',
    type: 'venta_nueva',
    priceFrom: 95000,
    priceTo: 180000,
    currency: 'USD',
    location: 'Nuevo Cuscatlán',
    description: 'Apartamentos modernos.',
    status: 'active',
  },
  {
    slug: 'quintas-campestres',
    name: 'Quintas Campestres',
    type: 'venta_nueva',
    priceFrom: 75000,
    location: 'Sonsonate',
    description: 'Casas en zona verde.',
    status: 'active',
  },
  {
    slug: undefined as unknown as string,
    name: 'Proyecto Foresta Townhomes - El Encanto',
    type: 'inversion',
    priceFrom: 576200,
    priceTo: 704000,
    currency: 'USD',
    location: 'San José Villanueva',
    description: 'Townhomes de lujo con amenidades de golf.',
    status: 'active',
    entityType: 'investment',
  },
]

describe('detectProjectFromMessage', () => {
  it('detects project by exact name (case insensitive)', () => {
    const result = detectProjectFromMessage('me interesa portacelli nuevo cuscatlán', projects)
    expect(result?.slug).toBe('portacelli-nuevo-cuscatlan')
  })

  it('detects project by partial name', () => {
    const result = detectProjectFromMessage('quiero info de quintas', projects)
    expect(result?.slug).toBe('quintas-campestres')
  })

  it('detects project by slug words', () => {
    const result = detectProjectFromMessage('hola me interesan quintas campestres', projects)
    expect(result?.slug).toBe('quintas-campestres')
  })

  it('returns null when no specific project is mentioned', () => {
    const result = detectProjectFromMessage('hola quiero una propiedad', projects)
    expect(result).toBeNull()
  })

  it('returns null when project list is empty', () => {
    const result = detectProjectFromMessage('hola', [])
    expect(result).toBeNull()
  })

  // ─── Synonym normalisation ───────────────────────────────
  it('matches "townhouses" to project named "Townhomes"', () => {
    const result = detectProjectFromMessage('dame mas detalles sobre el de los townhouses', projects)
    expect(result?.name).toBe('Proyecto Foresta Townhomes - El Encanto')
  })

  it('matches "town houses" (two words) to project named "Townhomes"', () => {
    const result = detectProjectFromMessage('info sobre los town houses foresta', projects)
    expect(result?.name).toBe('Proyecto Foresta Townhomes - El Encanto')
  })

  it('matches by significant word "foresta" in project name', () => {
    const result = detectProjectFromMessage('quiero mas info sobre los de foresta porfavor', projects)
    expect(result?.name).toBe('Proyecto Foresta Townhomes - El Encanto')
  })

  it('does not match on generic words shorter than 4 chars', () => {
    // "los", "de", "el" are < 4 chars and should not trigger a match
    const result = detectProjectFromMessage('los de el', projects)
    expect(result).toBeNull()
  })
})
