import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectProjectFromMessage, resolveProject } from '@/services/projects/gt-api'
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

// ─── getAllProjects: timeout duro + fallback stale ───────────────

const ONE_HOUR = 60 * 60 * 1000

const catalogo: GTProject[] = [
  {
    slug: 'portacelli-nuevo-cuscatlan',
    name: 'Portacelli Nuevo Cuscatlán',
    type: 'venta_nueva',
    priceFrom: 95000,
    location: 'Nuevo Cuscatlán',
    description: 'Apartamentos modernos.',
    status: 'active',
  },
]

describe('getAllProjects — timeout y caché stale', () => {
  beforeEach(() => {
    // El módulo tiene cachés a nivel de módulo: reset para que cada test
    // arranque con un caché vacío (instancia fresca vía import dinámico)
    vi.resetModules()
    process.env.GT_API_URL = 'https://gt-api.test'
    process.env.GT_API_SECRET = 'secreto'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function freshModule() {
    return import('@/services/projects/gt-api')
  }

  it('pasa un signal de timeout al fetch (una API colgada no puede matar el pipeline)', async () => {
    const inits: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      inits.push(init)
      return { ok: true, json: async () => catalogo }
    }))

    const { getAllProjects } = await freshModule()
    await getAllProjects()

    expect(inits[0]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('getProjectBySlug también pasa el signal de timeout al fetch', async () => {
    const inits: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      inits.push(init)
      return { ok: true, status: 200, json: async () => catalogo[0] }
    }))

    const { getProjectBySlug } = await freshModule()
    await getProjectBySlug('portacelli-nuevo-cuscatlan')

    expect(inits[0]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('dentro del TTL no vuelve a hacer fetch (valor fresco cacheado)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => catalogo }))
    vi.stubGlobal('fetch', fetchMock)

    const { getAllProjects } = await freshModule()
    const first = await getAllProjects()
    const second = await getAllProjects()

    expect(first).toEqual(catalogo)
    expect(second).toEqual(catalogo)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('si el fetch expira (TimeoutError) tras un éxito previo, sirve el catálogo stale y advierte', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const base = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base)

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => catalogo })
      // Así rechaza fetch cuando AbortSignal.timeout() aborta la petición
      .mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError')))

    const { getAllProjects } = await freshModule()
    const first = await getAllProjects()

    nowSpy.mockReturnValue(base + ONE_HOUR + 1) // vence el TTL de 1h
    const second = await getAllProjects()

    expect(first).toEqual(catalogo)
    expect(second).toEqual(catalogo) // último catálogo bueno conocido, no explota
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('stale'), expect.anything())
  })

  it('si el fetch falla sin catálogo previo, propaga el error (el webhook degrada a catálogo vacío)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('GT API caída')))

    const { getAllProjects } = await freshModule()
    await expect(getAllProjects()).rejects.toThrow('GT API caída')
  })
})

// ─── Catálogo REAL, en el orden en que lo devuelve el API ──────────
// Regresión del 13-sep-2026: "3% OFF en apartamentos Portacelli" se resolvía a
// "Apartamento Con Vista Escalón" (por la palabra "apartamento") y "adonde está
// el proyecto" a "Proyecto Townhomes - La Libertad" (por "proyecto"). El
// detector tomaba el PRIMER listing que compartiera cualquier palabra.
describe('resolveProject — catálogo real, sin palabras genéricas', () => {
  const real = [
    { slug: 'apartamento-con-vista-escalon-en-venta-san-salvador-d8131f', name: 'Apartamento Con Vista Escalón', type: 'Apartamento', entityType: 'residency' },
    { slug: 'apartamento-de-lujo-colonia-escalon-en-venta-san-salvador-d813fb', name: 'Apartamento de lujo Colonia Escalón', type: 'Apartamento', entityType: 'residency' },
    { slug: 'foresta-townhomes-en-proyecto-zaragoza-040f45', name: 'Foresta Townhomes', type: 'Townhouses', entityType: 'project' },
    { slug: 'oficina-en-nuevo-cuscatlan-en-alquiler-la-libertad-ef9021', name: 'Oficina en Nuevo Cuscatlán', type: 'Oficina', entityType: 'residency' },
    { slug: 'portacelli-alba-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-584516', name: 'Portacelli Alba - Fase 1 Habitacional', type: 'Townhouses', entityType: 'project' },
    { slug: 'portacelli-alta-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-58448f', name: 'Portacelli Alta - Fase 1 Habitacional', type: 'Apartamentos', entityType: 'project' },
    { slug: 'portacelli-raices-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-5a3907', name: 'Portacelli Raices - Fase 1 Habitacional', type: 'Residencial', entityType: 'project' },
    { slug: 'proyecto-townhomes-la-libertad-en-inversion-san-jose-villanueva-la-libertad-292480', name: 'Proyecto Townhomes - La Libertad', type: 'Residencial', entityType: 'investment' },
    { slug: 'terreno-en-la-libertad-en-venta-la-libertad-e6ea26', name: 'Terreno en La Libertad', type: 'Terreno', entityType: 'residency' },
  ] as unknown as GTProject[]

  const nombre = (m: string) => detectProjectFromMessage(m, real)?.name ?? null

  it('el mensaje del anuncio resuelve a Portacelli ALTA (apartamentos), no a un apartamento de Escalón', () => {
    expect(nombre('Hello! Me gustaría mas información sobre el 3% OFF en apartamentos Portacelli 🌿')).toBe('Portacelli Alta - Fase 1 Habitacional')
  })

  it('"adonde está el proyecto" no resuelve a ningún listing', () => {
    expect(nombre('Perfecto y adonde está el proyecto')).toBeNull()
  })

  it('"Portacelli Alta" es Alta, no el primer Portacelli del catálogo', () => {
    expect(nombre('Portacelli Alta')).toBe('Portacelli Alta - Fase 1 Habitacional')
    expect(nombre('me interesa portacelli alba')).toBe('Portacelli Alba - Fase 1 Habitacional')
  })

  it('"portacelli" a secas es la familia: devuelve un Portacelli marcado como ambiguo', () => {
    const r = resolveProject('info de portacelli porfa', real)
    expect(r.project?.slug.startsWith('portacelli-')).toBe(true)
    expect(r.ambiguous).toBe(true)
  })

  it('el match exacto por nombre NO es ambiguo', () => {
    expect(resolveProject('Portacelli Alta - Fase 1 Habitacional', real).ambiguous).toBe(false)
  })

  it('townhomes + la libertad gana sobre Foresta y sobre el terreno', () => {
    expect(nombre('los townhomes de la libertad')).toBe('Proyecto Townhomes - La Libertad')
    expect(nombre('me interesa foresta')).toBe('Foresta Townhomes')
  })

  it('empate entre dos listings distintos (dos apartamentos en Escalón) no adivina', () => {
    expect(nombre('busco apartamento en escalón')).toBeNull()
  })
})
