import { describe, it, expect } from 'vitest'
import { temaDeConversacion } from '@/lib/recontact-topic'
import type { GTProject } from '@/types'

const catalogo = [
  { slug: 'foresta-townhomes-en-proyecto-zaragoza-040f45', name: 'Foresta Townhomes', type: 'Townhouses', entityType: 'project' },
  { slug: 'local-comercial-excelente-para-negocio-en-alquiler-san-salvador-ef8f5b', name: 'Local Comercial excelente para negocio', type: 'Local Comercial', entityType: 'residency' },
  { slug: 'portacelli-alba-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-584516', name: 'Portacelli Alba - Fase 1 Habitacional', type: 'Townhouses', entityType: 'project' },
  { slug: 'portacelli-alta-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-58448f', name: 'Portacelli Alta - Fase 1 Habitacional', type: 'Apartamentos', entityType: 'project' },
  { slug: 'portacelli-raices-fase-1-habitacional-en-proyecto-nuevo-cuscatlan-5a3907', name: 'Portacelli Raices - Fase 1 Habitacional', type: 'Residencial', entityType: 'project' },
] as unknown as GTProject[]

const m = (role: 'user' | 'assistant', content: string) => ({ role, content })

describe('temaDeConversacion — el tema del recontacto sale de lo que se habló, no de un campo guardado', () => {
  it('sin ningún proyecto en la charla → null (el llamador usa texto genérico)', () => {
    expect(temaDeConversacion([m('user', 'Para ambas'), m('assistant', 'Perfecto, ¿vivienda o inversión?')], catalogo)).toBeNull()
  })

  it('historial vacío o catálogo vacío → null', () => {
    expect(temaDeConversacion([], catalogo)).toBeNull()
    expect(temaDeConversacion([m('user', 'info de portacelli')], [])).toBeNull()
  })

  it('caso real 31204ec5: Daniela ofreció Portacelli (y Foresta una vez) → gana Portacelli, nunca el local', () => {
    const h = [
      m('user', 'Para inversion y vivienda'),
      m('assistant', 'Fíjate que Portacelli Raices es una opción top: casas de 282m² desde $516,240 en preventa.'),
      m('assistant', '[Material enviado al cliente: video — Avance de obras y ubicacion Portacelli]'),
      m('user', 'Pero serían varias propiedades para inversión'),
      m('assistant', 'Otra ruta es Foresta Townhomes en El Encanto, desde $576,200.'),
      m('user', 'Quiero comprar 5 casas de una vez'),
      m('user', 'Hola, tienen avances de cómo va el proyecto?'),
      m('assistant', '[Material enviado al cliente: video — Avance de obras y ubicacion Portacelli]'),
    ]
    expect(temaDeConversacion(h, catalogo)).toBe('Portacelli')
  })

  it('listing específico y sin ambigüedad → nombre corto, sin "- Fase 1 Habitacional"', () => {
    expect(temaDeConversacion([m('user', 'me interesa portacelli alba')], catalogo)).toBe('Portacelli Alba')
  })

  it('el cliente pesa más que Daniela: lo que él nombró gana a lo que ella ofreció una vez', () => {
    const h = [
      m('assistant', 'Tenemos Portacelli Raices desde $516,240.'),
      m('user', 'mejor cuéntame de Foresta'),
    ]
    expect(temaDeConversacion(h, catalogo)).toBe('Foresta Townhomes')
  })

  it('ignora las líneas "[Plantilla …]": un recontacto previo no puede reforzar su propio tema', () => {
    const h = [
      m('assistant', '[Plantilla seguimiento_interes] Seguimiento sobre Local Comercial excelente para negocio'),
      m('assistant', '[Plantilla seguimiento_interes] Seguimiento sobre Local Comercial excelente para negocio'),
    ]
    expect(temaDeConversacion(h, catalogo)).toBeNull()
  })
})
