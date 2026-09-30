import { describe, it, expect } from 'vitest'
import { limpiarFrasesProhibidas } from '@/lib/reply-guard'

// Prueba real del 13-sep-2026, ya con el arreglo del brochure en producción:
// "Perfecto, si tienes cualquier otra pregunta o necesitas más información,
// estoy aquí para ayudarte. Quedamos en comunicación." — frase de call center
// que el prompt prohíbe explícitamente. Una regla en un prompt de 17K tokens no
// alcanza; esto la saca antes de que llegue al cliente.
describe('limpiarFrasesProhibidas', () => {
  it('quita la oración con "estoy aquí para ayudarte" y deja el resto', () => {
    const r = limpiarFrasesProhibidas('Perfecto, si tienes cualquier otra pregunta o necesitas más información, estoy aquí para ayudarte. Quedamos en comunicación.')
    expect(r.toLowerCase()).not.toContain('estoy aquí')
    expect(r).toContain('Quedamos en comunicación.')
  })

  it('cubre la familia completa de frases de call center', () => {
    for (const t of [
      'Claro. No dudes en escribirme.',
      'Listo. ¿En qué más puedo ayudarte?',
      'Con gusto. ¿En qué le puedo asistir hoy?',
      'Gracias. Es un placer atenderle.',
      'Listo. Estoy aqui para apoyarte en lo que necesites.',
    ]) {
      const r = limpiarFrasesProhibidas(t)
      expect(r).not.toMatch(/no dudes|en qu[eé] (m[aá]s )?(te|le) puedo|placer atender|estoy aqu[ií] para/i)
      expect(r.length).toBeGreaterThan(0)
    }
  })

  it('no toca un mensaje limpio', () => {
    const t = 'El de 101 m² arranca en $252,500.\nFíjate que la vista al valle hay que verla en persona.'
    expect(limpiarFrasesProhibidas(t)).toBe(t)
  })

  it('si todo el mensaje era la frase prohibida, devuelve el original antes que dejar al cliente sin respuesta', () => {
    const t = 'Estoy aquí para ayudarte.'
    expect(limpiarFrasesProhibidas(t)).toBe(t)
  })
})

// Evaluación 13-sep: "Portacelli es un megaproyecto… lo que garantiza una
// evolución impresionante de la zona". El manual de marca prohíbe "garantizado"
// y en inversión es un riesgo legal. Pero el aviso obligatorio "(no garantizado)"
// NO se toca: quitarlo sería peor.
describe('limpiarFrasesProhibidas — promesas de garantía', () => {
  it('quita la oración que promete con "garantiza"', () => {
    const r = limpiarFrasesProhibidas('Portacelli es un megaproyecto a 30 años, lo que garantiza una evolución impresionante de la zona. La oferta actual incluye apartamentos de 2 y 3 habitaciones.')
    expect(r).not.toMatch(/garantiz/i)
    expect(r).toBe('La oferta actual incluye apartamentos de 2 y 3 habitaciones.')
  })

  it('conserva el aviso obligatorio de retorno no garantizado', () => {
    for (const t of [
      'El interés objetivo ronda el 10% anual (no garantizado).',
      'El retorno no está garantizado, depende del proyecto.',
      'Tiene respaldo con garantía hipotecaria.',
    ]) expect(limpiarFrasesProhibidas(t)).toBe(t)
  })
})

describe('quitarMuletillaRepetida', async () => {
  const { quitarMuletillaRepetida } = await import('@/lib/reply-guard')

  it('la primera vez en la conversación se respeta', () => {
    expect(quitarMuletillaRepetida('Fíjate que ese modelo ya se agotó, pero hay otro.', [])).toBe('Fíjate que ese modelo ya se agotó, pero hay otro.')
  })

  it('si ya la dijo antes, se quita del arranque y se capitaliza', () => {
    const antes = ['Fíjate que Portacelli ya tiene el bulevar abierto.']
    expect(quitarMuletillaRepetida('Fíjese que hasta ahora solo hay fotos de la entrada.', antes)).toBe('Hasta ahora solo hay fotos de la entrada.')
    expect(quitarMuletillaRepetida('Claro. Fijate que el plan funciona así.', antes)).toBe('Claro. El plan funciona así.')
  })

  it('dos veces en el mismo mensaje: queda solo la primera', () => {
    expect(quitarMuletillaRepetida('Fíjate que sí hay. Fíjate que además hay video.', [])).toBe('Fíjate que sí hay. Además hay video.')
  })

  it('no toca "fíjate" cuando no es muletilla de arranque', () => {
    const antes = ['Fíjate que sí.']
    expect(quitarMuletillaRepetida('Cuando vengas, fíjate en la vista del lobby.', antes)).toBe('Cuando vengas, fíjate en la vista del lobby.')
  })
})
