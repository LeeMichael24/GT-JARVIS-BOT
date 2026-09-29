import { describe, it, expect } from 'vitest'
import { PROMESA_MATERIAL, CIFRAS_DE_REFERENCIA, pideCita, esCitaConcreta } from './eval/detectores'

describe('PROMESA_MATERIAL — promesa de un archivo, no de una gestión del equipo', () => {
  it.each([
    'Le envío el brochure ahora mismo',
    'Te lo mando en un momento',
    'Se lo comparto en seguida',
    'Ya le paso el video del avance',
    'Le paso las fotos del proyecto',
    'Aquí te dejo el plano',
    'Le adjunto la ficha',
  ])('detecta: %s', texto => {
    expect(PROMESA_MATERIAL.test(texto)).toBe(true)
  })

  // C4 del 29-sep: "Le paso su caso al equipo de reservas…" es una gestión, no un archivo
  it.each([
    'Le paso su caso al equipo de reservas para que le comparta el canal formal de pago',
    'Te paso con el equipo de arquitectura para confirmarlo',
    'Le paso el dato al equipo y se lo confirmamos durante el día',
    'La reserva congela el precio y el equipo le comparte el canal formal',
  ])('NO detecta: %s', texto => {
    expect(PROMESA_MATERIAL.test(texto)).toBe(false)
  })
})

describe('CIFRAS_DE_REFERENCIA — cuentas que el juez no debe marcar como error', () => {
  it('incluye las cuentas verificadas del 101 m² y de la casa 5B', () => {
    expect(CIFRAS_DE_REFERENCIA).toContain('$37,875')
    expect(CIFRAS_DE_REFERENCIA).toContain('$4,575')
    expect(CIFRAS_DE_REFERENCIA).toContain('$30,300')
    expect(CIFRAS_DE_REFERENCIA).toContain('$1,262.50')
    expect(CIFRAS_DE_REFERENCIA).toContain('$13,000')
    expect(CIFRAS_DE_REFERENCIA).toContain('$72,000')
  })

  it('las cifras de la referencia son aritméticamente correctas', () => {
    const lista = 252_500
    expect(lista * 0.15).toBe(37_875)
    expect(lista * 0.03 - 3_000).toBe(4_575)
    expect(lista * 0.12).toBe(30_300)
    expect((lista * 0.12) / 24).toBeCloseTo(1_262.5, 2)
    const casa = 599_999
    expect(Math.round(casa * 0.03) - 5_000).toBe(13_000)
    expect(Math.round(casa * 0.12)).toBe(72_000)
  })
})

describe('esCitaConcreta — día/franja concretos, con o sin la palabra "visita"', () => {
  it('cuenta dos franjas ofrecidas aunque no diga "visita" (C3 del 29-sep)', () => {
    const t = '¿Le queda sábado 3 por la mañana o domingo 4 por la tarde?'
    expect(pideCita(t)).toBe(false)
    expect(esCitaConcreta(t)).toBe(true)
  })

  it('cuenta una videollamada con día y hora', () => {
    expect(esCitaConcreta('Tengo martes 29 a las 7:00 pm de El Salvador o jueves 1 a las 8:00 pm para la videollamada')).toBe(true)
  })

  it('NO cuenta una invitación vaga', () => {
    expect(esCitaConcreta('Si le interesa, podemos coordinar una visita al proyecto')).toBe(false)
    expect(esCitaConcreta('¿Le interesa conocerlo?')).toBe(false)
  })

  it('NO cuenta menciones de fecha que no son una propuesta', () => {
    expect(esCitaConcreta('Los precios actuales cambian el jueves 30 de septiembre')).toBe(false)
    expect(esCitaConcreta('En la mañana el bulevar se ve mejor')).toBe(false)
  })
})
