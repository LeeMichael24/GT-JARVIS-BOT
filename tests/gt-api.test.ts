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

  it('returns first project when no match found', () => {
    const result = detectProjectFromMessage('hola quiero una propiedad', projects)
    expect(result?.slug).toBe('portacelli-nuevo-cuscatlan')
  })

  it('returns null when project list is empty', () => {
    const result = detectProjectFromMessage('hola', [])
    expect(result).toBeNull()
  })
})
