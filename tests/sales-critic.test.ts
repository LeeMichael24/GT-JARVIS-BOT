import { describe, it, expect, vi } from 'vitest'
import { parsearVeredicto, construirPromptJuez, revisarRespuesta, RUBRICA_VENTA, type EntradaRevision } from '@/lib/sales-critic'

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

  // Decisión de Mike 13-sep-2026: Daniela filtra el lead, así que califica —
  // con UNA pregunta que dice para qué la hace, después de responder. Con 2
  // preguntas numeradas el juez reprobaba 14 de 46 respuestas por "trámite".
  it('una pregunta de calificación con motivo es siguiente paso válido; dos seguidas o sin motivo reprueban', () => {
    const p = construirPromptJuez(base)
    expect(p).toMatch(/UNA sola pregunta de calificación/)
    expect(p).toMatch(/para qué/)
    expect(p).toMatch(/dos o más preguntas/i)
  })

  // El guion arranca preguntando el nombre; o4-mini lo reprobaba como trámite
  // ("¿Con quién tengo el gusto de platicar?") aun con la pregunta respondida.
  it('pedir el nombre en el primer contacto, después de responder, no reprueba', () => {
    const p = construirPromptJuez(base)
    expect(p).toMatch(/primer contacto/)
    expect(p).toMatch(/nombre/)
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

// 13-sep-2026: o4-mini juzgó 4 veces las MISMAS 12 respuestas y cambió de
// veredicto en 5. Con un solo voto, el crítico reescribía respuestas buenas
// (≈20 s y tokens de gpt-4.1) y dejaba pasar malas según la tirada.
describe('revisarRespuesta — voto por mayoría', () => {
  const REPRUEBA = (falla: string) => `{"aprobada":false,"fallas":["${falla}"],"sugerencia":"sugerencia ${falla}"}`
  const APRUEBA = '{"aprobada":true,"fallas":[]}'
  const jueces = (...salidas: (string | Error)[]) => {
    let i = 0
    return vi.fn(async () => {
      const s = salidas[i++ % salidas.length]
      if (s instanceof Error) throw s
      return s
    })
  }

  it('por defecto consulta 3 jueces', async () => {
    const juez = jueces(APRUEBA)
    await revisarRespuesta(base, { juez })
    expect(juez).toHaveBeenCalledTimes(3)
  })

  it('un solo voto en contra no reprueba: no se reescribe una respuesta buena por mala suerte', async () => {
    const v = await revisarRespuesta(base, { juez: jueces(APRUEBA, REPRUEBA('literal'), APRUEBA) })
    expect(v.aprobada).toBe(true)
    expect(v.votos).toEqual({ aprueban: 2, reprueban: 1 })
  })

  it('2 de 3 en contra reprueba, con las fallas de quienes reprobaron y sin repetir', async () => {
    const v = await revisarRespuesta(base, { juez: jueces(REPRUEBA('literal'), APRUEBA, REPRUEBA('literal')) })
    expect(v.aprobada).toBe(false)
    expect(v.fallas).toEqual(['literal'])
    expect(v.sugerencia).toBe('sugerencia literal')
  })

  it('si un juez truena, deciden los que respondieron', async () => {
    const v = await revisarRespuesta(base, { juez: jueces(new Error('timeout'), REPRUEBA('genérica'), REPRUEBA('sin lazo')) })
    expect(v.aprobada).toBe(false)
    expect(v.fallas).toEqual(['genérica', 'sin lazo'])
  })

  it('empate entre los que respondieron: aprueba (el juez nunca bloquea)', async () => {
    const v = await revisarRespuesta(base, { juez: jueces(new Error('timeout'), REPRUEBA('literal'), APRUEBA) })
    expect(v.aprobada).toBe(true)
  })

  it('si todos truenan: aprueba y avisa que se omitió', async () => {
    const v = await revisarRespuesta(base, { juez: jueces(new Error('timeout')) })
    expect(v.aprobada).toBe(true)
    expect(v.omitida).toBe('error_juez')
  })

  it('votos: 1 hace una sola llamada', async () => {
    const juez = jueces(REPRUEBA('literal'))
    const v = await revisarRespuesta(base, { juez }, { votos: 1 })
    expect(juez).toHaveBeenCalledTimes(1)
    expect(v.aprobada).toBe(false)
  })
})

// 29-sep-2026: A1, A2 y B2 de la batería de ventas reprobaron por lo mismo — no
// concretaban un siguiente paso — y el crítico las dejó pasar sin reescribir.
describe('RUBRICA_VENTA — siguiente paso concreto solo con señal explícita de avance', () => {
  it('exige paso concreto cuando el CLIENTE dice que le gustó, quiere apartar, no puede visitar, está fuera del país u ocupado', () => {
    expect(RUBRICA_VENTA).toMatch(/señal expl[íi]cita de avance en SU mensaje/i)
    expect(RUBRICA_VENTA).toMatch(/visita o videollamada con d[íi]a/i)
    expect(RUBRICA_VENTA).toMatch(/brochure o un precio solos no cuentan/i)
    expect(RUBRICA_VENTA).toMatch(/fuera del pa[íi]s/i)
    expect(RUBRICA_VENTA).toMatch(/ocupado/i)
    expect(RUBRICA_VENTA).toMatch(/quiere apartar/i)
  })

  // 29-sep: con la regla amplia, 10 de 12 reescrituras eran preguntas informativas
  // y cada reescritura suma 12-15 s de latencia.
  it('NO aplica a preguntas informativas: no dispara una reescritura de 12-15 s por pedir precio, foto o plano', () => {
    expect(RUBRICA_VENTA).toMatch(/NO aplica a preguntas informativas/i)
    expect(RUBRICA_VENTA).toMatch(/precio, plan de pago, ubicaci[óo]n, material, entrega/i)
  })

  it('las excepciones de pidio_tiempo y tramite siguen vigentes', () => {
    expect(RUBRICA_VENTA).toMatch(/momento pidio_tiempo/)
    expect(RUBRICA_VENTA).toMatch(/momento tramite/)
  })

  it('la pregunta de calificación con motivo sigue siendo siguiente paso válido', () => {
    expect(RUBRICA_VENTA).toMatch(/SIGUIENTE PASO VÁLIDO/)
  })
})
