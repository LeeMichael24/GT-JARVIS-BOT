import { describe, it, expect, vi, beforeEach } from 'vitest'
import { coseno, recuperar, vectoresDe, _limpiarCacheMemoria, type Embedder } from '@/lib/memoria'

// Embedder de prueba: una dimensión por tema, así la similitud es predecible
const TEMAS = ['ubic', 'prima', 'vista', 'reserva']
const falso = (): Embedder & { mock: { calls: string[][][] } } =>
  vi.fn(async (textos: string[]) => textos.map(t => TEMAS.map(tema => (t.toLowerCase().includes(tema) ? 1 : 0) + 0.01))) as never

type E = { id: string; texto: string; fijo?: boolean }
const entradas: E[] = [
  { id: 'ubicacion', texto: 'Ubicación: frente al Centro Forense' },
  { id: 'prima', texto: 'Prima: 15% en 24 meses' },
  { id: 'vista', texto: 'Vista al valle desde los pisos altos' },
  { id: 'reserva', texto: 'Reserva de $3,000' },
  { id: 'limites', texto: 'Lo que Daniela no puede decir', fijo: true },
]
const opciones = (consulta: string, k: number, embedder: Embedder) =>
  ({ consulta, candidatos: entradas, textoDe: (e: E) => e.texto, k, fijar: (e: E) => !!e.fijo, embedder, cache: new Map<string, number[]>() })

beforeEach(() => _limpiarCacheMemoria())

describe('memoria recuperada', () => {
  it('coseno: iguales = 1, ortogonales = 0', () => {
    expect(coseno([1, 0], [1, 0])).toBeCloseTo(1)
    expect(coseno([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('elige lo más parecido al mensaje del cliente', async () => {
    const r = await recuperar(opciones('¿Dónde es la ubicación exacta?', 1, falso()))
    expect(r.modo).toBe('semantico')
    expect(r.elegidos.map(e => e.id)).toContain('ubicacion')
    expect(r.elegidos.map(e => e.id)).not.toContain('prima')
  })

  it('lo fijado entra siempre y no cuenta contra k', async () => {
    const r = await recuperar(opciones('¿cuánto es la prima?', 1, falso()))
    expect(r.elegidos.map(e => e.id).sort()).toEqual(['limites', 'prima'])
  })

  it('si caben todos, no gasta una llamada de embeddings', async () => {
    const emb = falso()
    const r = await recuperar(opciones('hola', 10, emb))
    expect(r.modo).toBe('todo')
    expect(emb).not.toHaveBeenCalled()
    expect(r.elegidos).toHaveLength(entradas.length)
  })

  it('no vuelve a vectorizar lo que ya está en cache', async () => {
    const emb = falso()
    const cache = new Map<string, number[]>()
    await vectoresDe(['a', 'b'], emb, cache)
    await vectoresDe(['a', 'b', 'c'], emb, cache)
    expect(emb).toHaveBeenCalledTimes(2)
    expect((emb as unknown as { mock: { calls: string[][][] } }).mock.calls[1][0]).toEqual(['c'])
  })

  it('si los embeddings fallan, usa todo el conocimiento como antes', async () => {
    const roto: Embedder = vi.fn(async () => { throw new Error('embeddings 500') })
    const r = await recuperar(opciones('¿dónde queda?', 1, roto))
    expect(r.modo).toBe('sin_embeddings')
    expect(r.elegidos).toHaveLength(entradas.length)
  })
})
