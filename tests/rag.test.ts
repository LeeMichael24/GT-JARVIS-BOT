import { describe, it, expect, vi } from 'vitest'
import { recuperar, hashTexto, coseno, rankingLexico, type AlmacenVectores, type Embedder } from '@/lib/memoria'
import { recuerdosDelCliente, formatRecuerdosParaPrompt } from '@/lib/contexto-recuperado'
import { paqueteDeImagenes, inventarioDeMaterial, type ProjectMediaItem } from '@/lib/project-media'
import { soportaCache24h } from '@/services/claude/client'
import type { Conversation } from '@/types'

const TEMAS = ['ubic', 'prima', 'vista', 'reserva']
const emb = (): Embedder => vi.fn(async (textos: string[]) => textos.map(t => TEMAS.map(k => (t.toLowerCase().includes(k) ? 1 : 0) + 0.01)))

/** Almacén en memoria que imita a Postgres: guarda por hash y ordena por coseno */
function almacenFalso() {
  const filas = new Map<string, number[]>()
  const a: AlmacenVectores & { filas: typeof filas } = {
    filas,
    faltantes: vi.fn(async (hs: string[]) => hs.filter(h => !filas.has(h))),
    guardar: vi.fn(async (fs: { hash: string; vector: number[] }[]) => { fs.forEach(f => filas.set(f.hash, f.vector)) }),
    cercanos: vi.fn(async (q: number[], hs: string[], k: number) =>
      hs.filter(h => filas.has(h)).map(h => ({ hash: h, similitud: coseno(q, filas.get(h)!) }))
        .sort((x, y) => y.similitud - x.similitud).slice(0, k)),
  }
  return a
}

const textos = ['Ubicación frente al Forense', 'Prima del 15%', 'Vista al valle', 'Reserva de $3,000']

describe('RAG con almacén de vectores (Supabase)', () => {
  it('Postgres elige y cada texto se vectoriza UNA sola vez en la vida', async () => {
    const almacen = almacenFalso()
    const e = emb()
    const r1 = await recuperar({ consulta: '¿cuánto es la prima?', candidatos: textos, textoDe: t => t, k: 1, almacen, embedder: e, cache: new Map() })
    expect(r1.modo).toBe('vectorial')
    expect(r1.elegidos).toEqual(['Prima del 15%'])
    expect(almacen.filas.size).toBe(4)

    // Otro arranque en frío (cache del proceso vacío): solo se vectoriza la consulta
    const e2 = emb()
    const r2 = await recuperar({ consulta: '¿dónde es la ubicación?', candidatos: textos, textoDe: t => t, k: 1, almacen, embedder: e2, cache: new Map() })
    expect(r2.elegidos).toEqual(['Ubicación frente al Forense'])
    expect(e2).toHaveBeenCalledTimes(1)
    expect((e2 as unknown as { mock: { calls: string[][][] } }).mock.calls[0][0]).toEqual(['¿dónde es la ubicación?'])
  })

  it('si el almacén falla (migración sin aplicar), calcula en el proceso como antes', async () => {
    const roto: AlmacenVectores = { faltantes: async () => { throw new Error('no existe memoria_faltantes') }, guardar: async () => {}, cercanos: async () => [] }
    const r = await recuperar({ consulta: 'prima', candidatos: textos, textoDe: t => t, k: 1, almacen: roto, embedder: emb(), cache: new Map() })
    expect(r.modo).toBe('semantico')
    expect(r.elegidos).toEqual(['Prima del 15%'])
  })

  it('sin embeddings y alFallar=lexico: elige K por palabras, NO mete todo al prompt', async () => {
    const roto: Embedder = async () => { throw new Error('embeddings 500') }
    const r = await recuperar({ consulta: '¿de cuánto es la reserva?', candidatos: textos, textoDe: t => t, k: 1, alFallar: 'lexico', embedder: roto, cache: new Map() })
    expect(r.modo).toBe('lexico')
    expect(r.elegidos).toEqual(['Reserva de $3,000'])
  })

  it('rankingLexico ignora acentos y palabras vacías', () => {
    expect(rankingLexico('ubicacion del proyecto', textos, t => t, 1)).toEqual(['Ubicación frente al Forense'])
  })

  it('minSimilitud deja fuera lo que no tiene que ver', async () => {
    const r = await recuperar({ consulta: 'prima', candidatos: textos, textoDe: t => t, k: 4, minSimilitud: 0.5, embedder: emb(), cache: new Map() })
    expect(r.elegidos).toEqual(['Prima del 15%'])
  })

  it('hash estable por contenido: editar el texto obliga a vectorizarlo de nuevo', () => {
    expect(hashTexto('a')).toBe(hashTexto('a'))
    expect(hashTexto('a')).not.toBe(hashTexto('a '))
  })
})

const msg = (content: string, created_at: string, role: Conversation['role'] = 'user'): Conversation =>
  ({ id: created_at, lead_id: 'l1', role, content, wa_message_id: null, sent_by: null, created_at })

describe('memoria del cliente', () => {
  it('recupera solo lo relacionado, en orden cronológico, sin "ok" ni plantillas', async () => {
    const anteriores = [
      msg('La vista al valle me encantó muchísimo', '2026-09-10T10:00:00Z'),
      msg('ok', '2026-09-09T10:00:00Z'),
      msg('[Plantilla seguimiento] Seguimiento sobre la prima', '2026-09-08T10:00:00Z', 'assistant'),
      msg('Solo puedo dar de prima unos 5 mil dólares', '2026-09-01T10:00:00Z'),
    ]
    const r = await recuerdosDelCliente({ consulta: '¿y la prima cómo quedaría?', anteriores, embedder: emb(), cache: new Map() })
    expect(r.map(m => m.content)).toEqual(['Solo puedo dar de prima unos 5 mil dólares'])
  })

  it('si los embeddings fallan no mete nada (mejor sin recuerdos que con ruido)', async () => {
    const roto: Embedder = async () => { throw new Error('x') }
    const r = await recuerdosDelCliente({ consulta: 'prima', anteriores: [msg('Solo puedo dar de prima unos 5 mil', '2026-09-01T10:00:00Z')], embedder: roto, cache: new Map() })
    expect(r).toEqual([])
  })

  it('formato con fecha y quién lo dijo; vacío si no hay recuerdos', () => {
    expect(formatRecuerdosParaPrompt([])).toBe('')
    const t = formatRecuerdosParaPrompt([msg('Solo puedo dar de prima unos 5 mil', '2026-09-01T18:00:00Z')])
    expect(t).toContain('RECUERDOS DE ESTE CLIENTE')
    expect(t).toMatch(/\[1 sept?\.?, cliente\] Solo puedo dar/)
  })
})

const item = (n: number, caption: string | null, media_type: ProjectMediaItem['media_type'] = 'image'): ProjectMediaItem =>
  ({ id: `m${n}`, project_key: 'portacelli', media_type, url: `https://x/${n}`, caption, sort_order: n, active: true, project_slug: null })

describe('imágenes en paquete', () => {
  it('captions repetidos salen UNA vez para todo el paquete', () => {
    const p = paqueteDeImagenes([item(1, 'Avances'), item(2, 'Avances'), item(3, 'Avances')])
    expect(p.imagenes).toHaveLength(3)
    expect(p.texto).toBe('Avances')
  })

  it('captions distintos se juntan en un solo texto; sin captions no hay texto', () => {
    expect(paqueteDeImagenes([item(1, 'Entrada'), item(2, 'Lobby'), item(3, 'Entrada')]).texto).toBe('Entrada\nLobby')
    expect(paqueteDeImagenes([item(1, null), item(2, null)]).texto).toBeNull()
  })

  it('respeta el máximo del paquete', () => {
    expect(paqueteDeImagenes(Array.from({ length: 10 }, (_, i) => item(i, 'x')), 6).imagenes).toHaveLength(6)
  })

  it('el inventario del prompt no repite la misma foto cinco veces', () => {
    const inv = inventarioDeMaterial([1, 2, 3, 4, 5].map(n => item(n, 'Avances')).concat(item(6, 'Brochure Alta', 'brochure')), [])
    expect(inv).toEqual(['Portacelli (común a todos sus listings): 5 imágenes ("Avances"), brochure ("Brochure Alta")'])
  })
})

describe('caché de prompt de OpenAI', () => {
  it('24 h solo en los modelos que OpenAI lista', () => {
    expect(soportaCache24h('gpt-4.1')).toBe(true)
    expect(soportaCache24h('gpt-5.1')).toBe(true)
    expect(soportaCache24h('gpt-4.1-mini')).toBe(false)
    expect(soportaCache24h('gpt-4o')).toBe(false)
    expect(soportaCache24h('o4-mini')).toBe(false)
  })
})

describe('IA gratis para pruebas', () => {
  it('solo se activa en la batería (RUN_EVAL) y con LLM_PRUEBAS_URL — nunca en producción', async () => {
    const { llmDePruebas } = await import('@/services/claude/client')
    const antes = { ...process.env }
    try {
      process.env.LLM_PRUEBAS_URL = 'http://localhost:11434/v1'
      delete process.env.RUN_EVAL; delete process.env.RUN_EVAL_VISUAL
      expect(llmDePruebas()).toBeNull()
      process.env.RUN_EVAL = '1'
      expect(llmDePruebas()).toEqual({ baseURL: 'http://localhost:11434/v1', modelo: 'llama3.1:8b', apiKey: 'local' })
      delete process.env.LLM_PRUEBAS_URL
      expect(llmDePruebas()).toBeNull()
    } finally {
      process.env = antes
    }
  })
})
