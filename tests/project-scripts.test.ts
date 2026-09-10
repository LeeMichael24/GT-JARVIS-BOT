import { describe, it, expect } from 'vitest'
import { matchProjectScript, formatScriptForPrompt, type ProjectScript } from '@/lib/project-scripts'
import { mediaForProject, pickMediaToSend, mediaProjectKeys, type ProjectMediaItem } from '@/lib/project-media'

const portacelli: ProjectScript = {
  id: 's1', project_name: 'Portacelli', trigger_keywords: ['portacelli'],
  script: 'PASO 1 — SALUDO INICIAL...', active: true,
}

describe('matchProjectScript — activación del guion', () => {
  it('activa por keyword en el mensaje', () => {
    expect(matchProjectScript([portacelli], 'hola, info de Portacelli porfa', null)).toBe(portacelli)
  })

  it('activa por keyword sin importar mayúsculas', () => {
    expect(matchProjectScript([portacelli], 'INFO PORTACELLI', null)).toBe(portacelli)
  })

  it('PERSISTE vía project_interest aunque el mensaje ya no mencione el proyecto', () => {
    expect(matchProjectScript([portacelli], 'para vivir, con plan de pagos', 'Portacelli Alta - Fase 1 Habitacional')).toBe(portacelli)
  })

  it('no activa si no hay mención ni interés previo', () => {
    expect(matchProjectScript([portacelli], 'busco casa en la playa', null)).toBeNull()
  })

  it('el formato para el prompt incluye el nombre y las reglas de orden', () => {
    const block = formatScriptForPrompt(portacelli)
    expect(block).toContain('GUION OFICIAL DE VENTA — PORTACELLI')
    expect(block).toContain('PASO 1')
    expect(block).toContain('NO repitas pasos')
  })
})

const items: ProjectMediaItem[] = [
  { id: '1', project_key: 'portacelli', media_type: 'brochure', url: 'https://x/b.pdf', caption: null, sort_order: 1, active: true },
  { id: '2', project_key: 'portacelli', media_type: 'link', url: 'https://earth.google.com/x', caption: 'Ubicación 🌍', sort_order: 1, active: true },
  { id: '3', project_key: 'portacelli', media_type: 'image', url: 'https://x/1.jpg', caption: null, sort_order: 1, active: true },
  { id: '4', project_key: 'foresta', media_type: 'video', url: 'https://x/v.mp4', caption: null, sort_order: 1, active: true },
]

// Caso real de producción: los 3 archivos que el Ecosistema sincronizó son de
// Portacelli ALTA, y la ubicación en Google Earth se cargó a mano (sin slug),
// así que es material común de los tres Portacelli.
const ALTA = 'portacelli-alta-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-58448f'
const ALBA = 'portacelli-alba-fase-1-habitacional-abc123'
const itemsConSlug: ProjectMediaItem[] = [
  { id: 'a1', project_key: 'portacelli', media_type: 'brochure', url: 'https://x/alta.pdf', caption: 'Broshure apartamentos alta', sort_order: 0, active: true, project_slug: ALTA },
  { id: 'a2', project_key: 'portacelli', media_type: 'video', url: 'https://x/alta.mp4', caption: null, sort_order: 0, active: true, project_slug: ALTA },
  { id: 'a3', project_key: 'portacelli', media_type: 'image', url: 'https://x/alta.jpg', caption: null, sort_order: 0, active: true, project_slug: ALTA },
  { id: 'c1', project_key: 'portacelli', media_type: 'link', url: 'https://earth.google.com/x', caption: 'Ubicación 🌍', sort_order: 1, active: true, project_slug: null },
]

describe('project-media — selección de material', () => {
  it('mediaForProject matchea por fragmento del nombre', () => {
    const m = mediaForProject(items, 'Portacelli Alta - Fase 1 Habitacional')
    expect(m).toHaveLength(3)
    expect(m.every(i => i.project_key === 'portacelli')).toBe(true)
  })

  it('pickMediaToSend: document agrupa brochure/precios/planos', () => {
    const m = mediaForProject(items, 'Portacelli Alta')
    expect(pickMediaToSend(m, 'document')[0].media_type).toBe('brochure')
  })

  it('pickMediaToSend: link devuelve la ubicación', () => {
    const m = mediaForProject(items, 'Portacelli Alta')
    expect(pickMediaToSend(m, 'link')[0].url).toContain('earth.google.com')
  })

  it('mediaProjectKeys lista los proyectos con material', () => {
    expect(mediaProjectKeys(items).sort()).toEqual(['foresta', 'portacelli'])
  })
})

describe('mediaForProject — aislamiento por listing (fuga Alta → Alba)', () => {
  it('con el slug de Alta manda su material propio y la ubicación común', () => {
    const m = mediaForProject(itemsConSlug, 'Portacelli Alta - Fase 1 Habitacional', ALTA)
    expect(m.map(i => i.id).sort()).toEqual(['a1', 'a2', 'a3', 'c1'])
  })

  it('en una conversación de ALBA no se cuela NADA de Alta', () => {
    const m = mediaForProject(itemsConSlug, 'Portacelli Alba - Fase 1 Habitacional', ALBA)
    expect(m.map(i => i.id)).toEqual(['c1'])
    expect(m.some(i => i.project_slug === ALTA)).toBe(false)
  })

  it('el brochure de Alta ya no sale como brochure de Alba', () => {
    const m = mediaForProject(itemsConSlug, 'Portacelli Alba - Fase 1 Habitacional', ALBA)
    expect(pickMediaToSend(m, 'document')).toHaveLength(0)
  })

  it('sin slug conocido conserva el match laxo de antes', () => {
    const m = mediaForProject(itemsConSlug, 'Portacelli Alta - Fase 1 Habitacional')
    expect(m).toHaveLength(4)
  })

  it('el material de otro project_key sigue afuera', () => {
    const m = mediaForProject(itemsConSlug, 'Foresta Townhomes', 'foresta-townhomes-xyz')
    expect(m).toHaveLength(0)
  })
})
