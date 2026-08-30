import { describe, it, expect } from 'vitest'
import { normalizePhone, isInternal, pickAlertRecipient } from '@/lib/team-routing'

describe('normalizePhone — formato único de teléfono', () => {
  it('quita el "+" inicial que trae CEO_PHONE_NUMBER', () => {
    expect(normalizePhone('+50362087916')).toBe('50362087916')
  })

  it('deja intacto el formato que manda Meta en el webhook (sin "+")', () => {
    expect(normalizePhone('50362087916')).toBe('50362087916')
  })

  it('hace coincidir el mismo número escrito de las dos formas', () => {
    expect(normalizePhone('+50362087916')).toBe(normalizePhone('50362087916'))
  })

  it('quita espacios, guiones y paréntesis de un número tecleado a mano', () => {
    expect(normalizePhone('+1 (555) 651-3045')).toBe('15556513045')
  })

  it('devuelve cadena vacía si no hay dígitos', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('   ')).toBe('')
  })
})

const CEO = '+50362087916'

describe('isInternal — protege al equipo de ser tratado como cliente', () => {
  it('reconoce al CEO aunque el env traiga "+" y el webhook no', () => {
    expect(isInternal('50362087916', CEO, [])).toBe(true)
  })

  it('reconoce el teléfono de un asesor del equipo', () => {
    expect(isInternal('50377250355', CEO, ['50377250355'])).toBe(true)
  })

  it('reconoce a un asesor aunque su wa_phone esté guardado con "+" y espacios', () => {
    expect(isInternal('50377250355', CEO, ['+503 7725 0355'])).toBe(true)
  })

  it('un número de cliente desconocido NO es interno', () => {
    expect(isInternal('50370001234', CEO, ['50377250355'])).toBe(false)
  })

  it('ignora los wa_phone vacíos o nulos sin marcar a nadie como interno', () => {
    expect(isInternal('50370001234', CEO, [null, '', '   '])).toBe(false)
  })

  it('sin CEO_PHONE_NUMBER configurado no marca a un cliente como interno', () => {
    expect(isInternal('50370001234', undefined, [])).toBe(false)
  })

  it('un "from" vacío no coincide con un CEO sin configurar', () => {
    expect(isInternal('', undefined, [null])).toBe(false)
  })
})

const PAOLA = { id: 'tm-paola', wa_phone: '+503 7725 0355' }
const SIN_TEL = { id: 'tm-sin-tel', wa_phone: null }

describe('pickAlertRecipient — consultas al asesor, cierres al CEO', () => {
  it('escalate_ceo siempre va al CEO, aunque el lead tenga asesor asignado', () => {
    expect(pickAlertRecipient('escalate_ceo', PAOLA.id, CEO, [PAOLA])).toBe(CEO)
  })

  it('consult_team va al asesor asignado al lead', () => {
    expect(pickAlertRecipient('consult_team', PAOLA.id, CEO, [PAOLA])).toBe(PAOLA.wa_phone)
  })

  it('consult_team cae al CEO si el lead no tiene asesor asignado', () => {
    expect(pickAlertRecipient('consult_team', null, CEO, [PAOLA])).toBe(CEO)
  })

  it('consult_team cae al CEO si el asesor asignado no tiene wa_phone', () => {
    expect(pickAlertRecipient('consult_team', SIN_TEL.id, CEO, [SIN_TEL])).toBe(CEO)
  })

  it('consult_team cae al CEO si el asesor asignado ya no está en el equipo activo', () => {
    expect(pickAlertRecipient('consult_team', 'tm-borrado', CEO, [PAOLA])).toBe(CEO)
  })

  it('sin CEO ni asesor con teléfono no inventa destinatario', () => {
    expect(pickAlertRecipient('consult_team', null, undefined, [])).toBeUndefined()
  })
})
