import { describe, it, expect, vi } from 'vitest'
import { parsearVeredicto, construirPromptJuez, revisarRespuesta, type EntradaRevision } from '@/lib/sales-critic'

// La revisión automática: un modelo rápido juzga la respuesta contra la rúbrica
// de venta ANTES de enviarla. Nació del caso real "Hola, me interesa Portacelli,
// ¿adónde está ubicado?" → "Portacelli está en Nuevo Cuscatlán, aquí está el
// link": correcto y literal, sin nada que haga querer ir.
const base: EntradaRevision = {
  mensajeCliente: 'Hola, me interesa Portacelli, ¿adónde está ubicado?',
  reply: 'Portacelli está en Nuevo Cuscatlán.',
  extras: [],
  plan: { cliente: 'primer contacto', momento: 'descubrimiento', objetivo_del_turno: 'ubicarlo', angulo: 'ubicación', siguiente_paso: 'link' },
  sendMedia: { type: 'link', project: 'Portacelli', description: 'ubicación' },
}

describe('parsearVeredicto', () => {
  it('lee aprobada, fallas y sugerencia', () => {
    const v = parsearVeredicto('{"aprobada":false,"fallas":["respuesta literal"],"sugerencia":"suma el bosque"}')
    expect(v).toEqual({ aprobada: false, fallas: ['respuesta literal'], sugerencia: 'suma el bosque' })
  })

  it('con fallas y sin "aprobada", la da por reprobada', () => {
    expect(parsearVeredicto('{"fallas":["genérica"]}').aprobada).toBe(false)
  })

  it('basura o vacío: aprueba — el juez nunca bloquea una respuesta', () => {
    expect(parsearVeredicto('no es json').aprobada).toBe(true)
    expect(parsearVeredicto('{}')).toEqual({ aprobada: true, fallas: [], sugerencia: null })
  })
})

describe('construirPromptJuez', () => {
  it('lleva el mensaje del cliente, la respuesta completa y el momento del plan', () => {
    const p = construirPromptJuez({ ...base, extras: ['Burbuja dos'] })
    expect(p).toContain(base.mensajeCliente)
    expect(p).toContain(base.reply)
    expect(p).toContain('Burbuja dos')
    expect(p).toContain('descubrimiento')
  })

  it('la rúbrica castiga lo genérico y lo literal, y exime al que pidió tiempo', () => {
    const p = construirPromptJuez(base)
    expect(p).toContain('genérica')
    expect(p).toContain('literal')
    expect(p).toContain('pidio_tiempo')
    expect(p).toContain('JSON')
  })
})

describe('revisarRespuesta', () => {
  it('mensajes de trámite no se revisan (ahorra tiempo)', async () => {
    const juez = vi.fn()
    const v = await revisarRespuesta({ ...base, plan: { ...base.plan!, momento: 'tramite' } }, { juez })
    expect(juez).not.toHaveBeenCalled()
    expect(v.aprobada).toBe(true)
    expect(v.omitida).toBe('tramite')
  })

  it('si el juez falla, aprueba: jamás deja al cliente sin respuesta', async () => {
    const v = await revisarRespuesta(base, { juez: vi.fn(async () => { throw new Error('timeout') }) })
    expect(v.aprobada).toBe(true)
  })

  it('devuelve el veredicto del juez', async () => {
    const v = await revisarRespuesta(base, { juez: vi.fn(async () => '{"aprobada":false,"fallas":["literal"],"sugerencia":"x"}') })
    expect(v.aprobada).toBe(false)
    expect(v.fallas).toEqual(['literal'])
  })
})
