import { createHash } from 'node:crypto'

/**
 * MEMORIA RECUPERADA — Daniela lee lo relevante a ESTE mensaje, no todo.
 *
 * Antes cada respuesta cargaba el conocimiento completo (~14K caracteres) y
 * el cerebro (~4.6K) en un prompt de ~18K tokens. Dos problemas medidos el
 * 13-sep: (1) la cuenta de OpenAI tiene 30K tokens/min, así que dos clientes
 * en el mismo minuto ya chocan; (2) con todo mezclado, lo importante se pierde.
 *
 * Por qué sin pgvector: el conocimiento recuperable son ~80 entradas. Se
 * vectorizan en UN lote, se guardan en memoria del proceso y la similitud se
 * calcula aquí — mismo resultado, sin extensiones, RPC ni migraciones. Cuando
 * se indexen miles de ejemplos del equipo, eso sí va a pgvector.
 *
 * Nunca rompe una respuesta: si los embeddings fallan, se usa todo como antes.
 */

export type Embedder = (textos: string[]) => Promise<number[][]>

export type ModoRecuperacion = 'semantico' | 'todo' | 'sin_embeddings'

const CACHE = new Map<string, number[]>()
const CACHE_MAX = 3000
const MODELO_EMBEDDINGS = 'text-embedding-3-small'

export function hashTexto(t: string): string {
  return createHash('sha1').update(t).digest('hex')
}

export function coseno(a: number[], b: number[]): number {
  let punto = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { punto += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na && nb ? punto / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

/** Vectores para estos textos: los que ya están en cache no se vuelven a pedir. */
export async function vectoresDe(textos: string[], embedder: Embedder, cache = CACHE): Promise<number[][]> {
  const hashes = textos.map(hashTexto)
  const faltan = [...new Set(hashes.filter(h => !cache.has(h)))]
  if (faltan.length) {
    const textosFaltan = faltan.map(h => textos[hashes.indexOf(h)])
    const vectores = await embedder(textosFaltan)
    if (vectores.length !== faltan.length) throw new Error('embedder devolvió una cantidad distinta de vectores')
    if (cache.size + faltan.length > CACHE_MAX) cache.clear()
    faltan.forEach((h, i) => cache.set(h, vectores[i]))
  }
  return hashes.map(h => cache.get(h)!)
}

export interface OpcionesRecuperar<T> {
  consulta: string
  candidatos: T[]
  textoDe: (c: T) => string
  /** Cuántos elegir por similitud (sin contar los fijos) */
  k: number
  /** Entradas que entran siempre, sin competir (p. ej. los límites del proyecto) */
  fijar?: (c: T) => boolean
  embedder?: Embedder
  cache?: Map<string, number[]>
}

export async function recuperar<T>(o: OpcionesRecuperar<T>): Promise<{ elegidos: T[]; modo: ModoRecuperacion }> {
  const fijos = o.fijar ? o.candidatos.filter(o.fijar) : []
  const resto = o.fijar ? o.candidatos.filter(c => !o.fijar!(c)) : o.candidatos
  if (resto.length <= o.k) return { elegidos: [...fijos, ...resto], modo: 'todo' }

  try {
    const embedder = o.embedder ?? embedderOpenAI
    const cache = o.cache ?? CACHE
    const [vConsulta] = await vectoresDe([o.consulta], embedder, cache)
    const vResto = await vectoresDe(resto.map(o.textoDe), embedder, cache)
    const ranking = resto
      .map((c, i) => ({ c, s: coseno(vConsulta, vResto[i]) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, o.k)
      .map(x => x.c)
    return { elegidos: [...fijos, ...ranking], modo: 'semantico' }
  } catch (err) {
    console.warn('[memoria] embeddings no disponibles — uso todo el conocimiento:', err instanceof Error ? err.message : err)
    return { elegidos: o.candidatos, modo: 'sin_embeddings' }
  }
}

export const embedderOpenAI: Embedder = async textos => {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELO_EMBEDDINGS, input: textos.map(t => t.slice(0, 8000)) }),
    signal: AbortSignal.timeout(4_000),
  })
  if (!res.ok) throw new Error(`embeddings ${res.status}`)
  const data = (await res.json()) as { data: { index: number; embedding: number[] }[] }
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
}

/** Solo para tests */
export function _limpiarCacheMemoria(): void {
  CACHE.clear()
}
