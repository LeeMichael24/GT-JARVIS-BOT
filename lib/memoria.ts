import { createHash } from 'node:crypto'

/**
 * MEMORIA RECUPERADA — Daniela lee lo relevante a ESTE mensaje, no todo.
 *
 * Antes cada respuesta cargaba el conocimiento completo (~14K caracteres) y
 * el cerebro (~4.6K) en un prompt de ~18K tokens. Dos problemas medidos el
 * 13-sep: (1) la cuenta de OpenAI tiene 30K tokens/min, así que dos clientes
 * en el mismo minuto ya chocan; (2) con todo mezclado, lo importante se pierde.
 *
 * Tres niveles, del más barato al más caro:
 *   1. almacén en Supabase (pgvector, migración 023): cada texto se vectoriza
 *      UNA vez en la vida y Postgres devuelve solo los hashes ganadores
 *   2. memoria del proceso: si el almacén no está, se calcula aquí como antes
 *   3. sin embeddings: respaldo por palabras en común (o todo / nada, según quién llama)
 *
 * Nunca rompe una respuesta: cualquier falla baja al siguiente nivel.
 */

export type Embedder = (textos: string[]) => Promise<number[][]>

export type ModoRecuperacion = 'vectorial' | 'semantico' | 'lexico' | 'todo' | 'sin_embeddings'

const CACHE = new Map<string, number[]>()
const CACHE_MAX = 3000
export const MODELO_EMBEDDINGS = 'text-embedding-3-small'

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
  /** Por debajo de esta similitud no entra aunque haya lugar (memoria del cliente: mejor nada que ruido) */
  minSimilitud?: number
  /**
   * Si los embeddings fallan: 'lexico' elige k por palabras en común (no infla el
   * prompt), 'todo' mete todo como antes, 'nada' no mete nada.
   */
  alFallar?: 'todo' | 'lexico' | 'nada'
  /** Vectores persistidos en Supabase (migración 023). null/ausente = solo memoria del proceso. */
  almacen?: AlmacenVectores | null
  /** Etiqueta de lo que se guarda en el almacén */
  fuente?: string
  embedder?: Embedder
  cache?: Map<string, number[]>
}

/**
 * Dónde viven los vectores fuera del proceso. La búsqueda la hace el almacén:
 * al código solo vuelven los hashes ganadores, no cientos de vectores.
 */
export interface AlmacenVectores {
  faltantes(hashes: string[]): Promise<string[]>
  guardar(filas: { hash: string; vector: number[]; fuente: string }[]): Promise<void>
  cercanos(consulta: number[], hashes: string[], k: number): Promise<{ hash: string; similitud: number }[]>
}

/** Lotes al pedir embeddings: con cientos de mensajes de un cliente, un solo pedido se pasa del tiempo */
const LOTE_EMBEDDINGS = 100

async function embeberEnLotes(textos: string[], embedder: Embedder): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < textos.length; i += LOTE_EMBEDDINGS) {
    const lote = textos.slice(i, i + LOTE_EMBEDDINGS)
    const v = await embedder(lote)
    if (v.length !== lote.length) throw new Error('embedder devolvió una cantidad distinta de vectores')
    out.push(...v)
  }
  return out
}

/** Búsqueda en el almacén: vectoriza solo lo que nunca se vectorizó y deja que Postgres ordene */
async function rankingEnAlmacen<T>(o: OpcionesRecuperar<T>, resto: T[], vConsulta: number[], almacen: AlmacenVectores, embedder: Embedder) {
  const textos = resto.map(o.textoDe)
  const hashes = textos.map(hashTexto)
  const unicos = [...new Set(hashes)]
  const faltan = await almacen.faltantes(unicos)
  if (faltan.length) {
    const textosFaltan = faltan.map(h => textos[hashes.indexOf(h)])
    const vectores = await embeberEnLotes(textosFaltan, embedder)
    await almacen.guardar(faltan.map((hash, i) => ({ hash, vector: vectores[i], fuente: o.fuente ?? 'general' })))
  }
  const top = await almacen.cercanos(vConsulta, unicos, o.k)
  const porHash = new Map<string, T>()
  hashes.forEach((h, i) => { if (!porHash.has(h)) porHash.set(h, resto[i]) })
  return top
    .filter(t => t.similitud >= (o.minSimilitud ?? -1))
    .map(t => porHash.get(t.hash))
    .filter((c): c is T => c !== undefined)
}

const PALABRAS_VACIAS = new Set('de la el los las un una y o a en que se es por con para del al lo le su sus mi me te tu como mas más pero si sí ya no hay qué cuál cuánto cuanto esta este eso esto'.split(' '))

function palabras(t: string): Set<string> {
  return new Set(
    t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9ñ]+/).filter(p => p.length > 2 && !PALABRAS_VACIAS.has(p)),
  )
}

/** Respaldo sin embeddings: las k entradas con más palabras en común con la consulta */
export function rankingLexico<T>(consulta: string, candidatos: T[], textoDe: (c: T) => string, k: number): T[] {
  const q = palabras(consulta)
  return candidatos
    .map((c, i) => {
      const w = palabras(textoDe(c))
      let comunes = 0
      for (const p of q) if (w.has(p)) comunes++
      return { c, i, s: comunes }
    })
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, k)
    .map(x => x.c)
}

export async function recuperar<T>(o: OpcionesRecuperar<T>): Promise<{ elegidos: T[]; modo: ModoRecuperacion }> {
  const fijos = o.fijar ? o.candidatos.filter(o.fijar) : []
  const resto = o.fijar ? o.candidatos.filter(c => !o.fijar!(c)) : o.candidatos
  if (resto.length <= o.k && o.minSimilitud === undefined) return { elegidos: [...fijos, ...resto], modo: 'todo' }
  if (!resto.length) return { elegidos: fijos, modo: 'todo' }

  try {
    const embedder = o.embedder ?? embedderOpenAI
    const cache = o.cache ?? CACHE
    const [vConsulta] = await vectoresDe([o.consulta], embedder, cache)

    if (o.almacen) {
      try {
        const ranking = await rankingEnAlmacen(o, resto, vConsulta, o.almacen, embedder)
        return { elegidos: [...fijos, ...ranking], modo: 'vectorial' }
      } catch (err) {
        // Migración 023 sin aplicar o Supabase caído: se calcula aquí como antes
        console.warn('[memoria] almacén de vectores no disponible — calculo en el proceso:', err instanceof Error ? err.message : err)
      }
    }

    const vResto = await vectoresDe(resto.map(o.textoDe), embedder, cache)
    const ranking = resto
      .map((c, i) => ({ c, s: coseno(vConsulta, vResto[i]) }))
      .filter(x => x.s >= (o.minSimilitud ?? -1))
      .sort((a, b) => b.s - a.s)
      .slice(0, o.k)
      .map(x => x.c)
    return { elegidos: [...fijos, ...ranking], modo: 'semantico' }
  } catch (err) {
    const alFallar = o.alFallar ?? 'todo'
    console.warn(`[memoria] embeddings no disponibles — respaldo "${alFallar}":`, err instanceof Error ? err.message : err)
    if (alFallar === 'nada') return { elegidos: fijos, modo: 'sin_embeddings' }
    if (alFallar === 'lexico') return { elegidos: [...fijos, ...rankingLexico(o.consulta, resto, o.textoDe, o.k)], modo: 'lexico' }
    return { elegidos: o.candidatos, modo: 'sin_embeddings' }
  }
}

export const embedderOpenAI: Embedder = async textos => {
  // En la batería con IA local (LLM_PRUEBAS_URL) los embeddings también son locales y gratis
  const local = (process.env.RUN_EVAL || process.env.RUN_EVAL_VISUAL) && process.env.LLM_PRUEBAS_URL
  const res = await fetch(local ? `${process.env.LLM_PRUEBAS_URL}/embeddings` : 'https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${local ? (process.env.LLM_PRUEBAS_KEY ?? 'local') : process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: local ? (process.env.LLM_PRUEBAS_EMBEDDINGS ?? 'nomic-embed-text') : MODELO_EMBEDDINGS,
      input: textos.map(t => t.slice(0, 8000)),
    }),
    signal: AbortSignal.timeout(local ? 60_000 : 4_000),
  })
  if (!res.ok) throw new Error(`embeddings ${res.status}`)
  const data = (await res.json()) as { data: { index: number; embedding: number[] }[] }
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
}

/** Solo para tests */
export function _limpiarCacheMemoria(): void {
  CACHE.clear()
}
