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
