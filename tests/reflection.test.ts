import { describe, it, expect } from 'vitest'
import { groupConversations, buildReflectionPrompt, toBrainObservations } from '@/lib/reflection'

const msg = (lead: string, role: string, content: string) =>
  ({ lead_id: lead, role, content, created_at: '2026-07-08T10:00:00Z' })

describe('groupConversations — qué conversaciones enseñan', () => {
  it('descarta saludos sueltos (menos de 4 mensajes o menos de 2 del cliente)', () => {
    const rows = [
      msg('a', 'user', 'Hola'), msg('a', 'assistant', 'Hola, soy Daniela'),
      msg('b', 'user', 'info'), msg('b', 'assistant', 'Claro'), msg('b', 'assistant', '¿Qué buscas?'),
    ]
    expect(groupConversations(rows)).toHaveLength(0)
  })

  it('incluye conversaciones con sustancia y arma el transcript CLIENTE/DANIELA', () => {
    const rows = [
      msg('a', 'user', 'Hola, info de Portacelli'),
      msg('a', 'assistant', 'Con gusto, arranca desde $242K'),
      msg('a', 'user', 'está caro, en otro lado me dan más barato'),
      msg('a', 'assistant', 'Te entiendo — el valor está en la plusvalía de la zona'),
    ]
    const groups = groupConversations(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].transcript).toContain('CLIENTE: está caro')
    expect(groups[0].transcript).toContain('DANIELA: Te entiendo')
  })

  it('prioriza las conversaciones con más mensajes del cliente y respeta el tope', () => {
    const rows: ReturnType<typeof msg>[] = []
    for (let i = 0; i < 12; i++) {
      const lead = 'lead' + i
      const n = 2 + (i % 5)
      for (let j = 0; j < n; j++) {
        rows.push(msg(lead, 'user', 'pregunta ' + j))
        rows.push(msg(lead, 'assistant', 'respuesta ' + j))
      }
    }
    const groups = groupConversations(rows)
    expect(groups.length).toBeLessThanOrEqual(8)
    // ordenadas desc por mensajes del cliente
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1].userMsgs).toBeGreaterThanOrEqual(groups[i].userMsgs)
    }
  })
})

describe('buildReflectionPrompt', () => {
  it('incluye los temas existentes para no duplicar y pide JSON', () => {
    const p = buildReflectionPrompt(
      [{ leadId: 'a', transcript: 'CLIENTE: hola', userMsgs: 2 }],
      ['Manejo de objeciones frecuentes'],
    )
    expect(p).toContain('Manejo de objeciones frecuentes')
    expect(p).toContain('"learnings"')
    expect(p).toContain('Conversación 1')
  })
})

describe('toBrainObservations — mapeo al cerebro', () => {
  it('mapea categorías y trunca largos', () => {
    const obs = toBrainObservations({
      learnings: [
        { category: 'objection_response', topic: 'Objeción precio vs competencia', content: 'x'.repeat(500) },
        { category: 'knowledge_gap', topic: 'No sabía el m² de Alba', content: 'Agregar specs de Alba al cerebro' },
        { category: 'market_signal', topic: 'Piden renta en San Benito', content: '3 clientes esta semana' },
      ],
    })
    expect(obs).toHaveLength(3)
    expect(obs[0].category).toBe('pattern')
    expect(obs[0].content.length).toBeLessThanOrEqual(400)
    expect(obs[1].category).toBe('observation')
    expect(obs[2].category).toBe('metric')
  })

  it('basura no explota', () => {
    expect(toBrainObservations(null)).toEqual([])
    expect(toBrainObservations({ learnings: 'nope' })).toEqual([])
    expect(toBrainObservations({ learnings: [{ topic: 'sin content' }] })).toEqual([])
  })
})
