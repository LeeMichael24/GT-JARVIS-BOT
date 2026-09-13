import { describe, it, expect, vi } from 'vitest'
import { construirConsulta, seleccionarConocimiento, K_CONOCIMIENTO, K_CEREBRO } from '@/lib/contexto-recuperado'
import type { KBEntry } from '@/lib/knowledge-base'
import type { Embedder } from '@/lib/memoria'

const emb: Embedder = vi.fn(async (textos: string[]) => textos.map(t => ['ubic', 'prima', 'vista'].map(k => (t.toLowerCase().includes(k) ? 1 : 0) + 0.01)))
const kb = (topic: string, content: string): KBEntry => ({ category: 'faq', topic, title: topic, content, project_slug: null })

// 13-sep-2026, medido con el conocimiento real: con "Proyecto: Portacelli Alta"
// delante, las 4 preguntas de prueba traían casi las mismas entradas genéricas
// (wow_ciudad_integrada, primera_fase_producto) y "¿qué incluye el precio?" NO
// traía ficha_incluye. El conocimiento ya llega filtrado por proyecto: el nombre
// solo tapa la pregunta.
describe('construirConsulta', () => {
  it('no lleva el nombre del proyecto', () => {
    const c = construirConsulta({ mensajeCliente: '¿Qué incluye el precio de los apartamentos?', ultimaRespuestaBot: 'Portacelli Alta tiene…' })
    expect(c).not.toContain('Proyecto')
    expect(c).toContain('¿Qué incluye el precio de los apartamentos?')
  })

  it('una pregunta con contenido propio va sola, sin lo último que le dijimos', () => {
    const c = construirConsulta({ mensajeCliente: 'Soy Ana, me interesa para invertir, ¿qué me conviene?', ultimaRespuestaBot: 'Le comparto la ubicación' })
    expect(c).not.toContain('ubicación')
  })

  it('un mensaje corto ("Ok", "sí, mándalo") se busca con lo último que le dijimos, recortado', () => {
    const c = construirConsulta({ mensajeCliente: 'Ok', ultimaRespuestaBot: 'El 3% de descuento aplica de contado. ' + 'x'.repeat(500) })
    expect(c).toContain('Ok')
    expect(c).toContain('3% de descuento')
    expect(c.length).toBeLessThan(300)
  })
})

describe('seleccionarConocimiento', () => {
  it('con más entradas que el tope, elige K por similitud y fija los límites del proyecto', async () => {
    const playbook = [
      ...Array.from({ length: K_CONOCIMIENTO + 5 }, (_, i) => kb(`prima_${i}`, `Prima opción ${i}`)),
      kb('ubicacion', 'Ubicación frente al Forense'),
      kb('ficha_limites', 'No decir que garantiza nada'),
    ]
    const r = await seleccionarConocimiento({ consulta: 'Cliente: ¿cuál es la ubicación?', playbook, cerebro: [], embedder: emb, cache: new Map() })
    expect(r.modo.playbook).toBe('semantico')
    expect(r.playbook.map(e => e.topic)).toContain('ubicacion')
    expect(r.playbook.map(e => e.topic)).toContain('ficha_limites')
    expect(r.playbook.length).toBe(K_CONOCIMIENTO + 1)
  })

  it('el cerebro se recorta a K_CEREBRO', async () => {
    const cerebro = Array.from({ length: K_CEREBRO + 4 }, (_, i) => ({ content: `aprendizaje ${i} sobre la vista` }))
    const r = await seleccionarConocimiento({ consulta: 'vista', playbook: [], cerebro, embedder: emb, cache: new Map() })
    expect(r.cerebro.length).toBe(K_CEREBRO)
  })
})
