import type { KBEntry } from '@/lib/knowledge-base'
import { recuperar, type Embedder, type ModoRecuperacion } from '@/lib/memoria'

/**
 * Qué conocimiento y qué aprendizajes entran al prompt en ESTE turno.
 * Lo usan el webhook y la batería de venta, así se mide lo mismo que corre.
 *
 * Antes entraba todo: ~14K caracteres de conocimiento + ~4.6K de cerebro en
 * cada respuesta, con la cuenta de OpenAI a 30K tokens/min.
 */

/** Entradas de conocimiento elegidas por similitud, sin contar las fijas */
export const K_CONOCIMIENTO = 8
/** Aprendizajes del cerebro elegidos por similitud */
export const K_CEREBRO = 3

/** Hasta cuántas palabras un mensaje no dice de qué habla por sí solo ("Ok", "sí, mándalo") */
const PALABRAS_MENSAJE_CORTO = 4

/**
 * Se busca con la pregunta del cliente, sin el nombre del proyecto: el
 * conocimiento ya llega filtrado por proyecto y el nombre pesa tanto en el
 * vector que todas las preguntas traían las mismas entradas genéricas.
 */
export function construirConsulta(o: { mensajeCliente: string; ultimaRespuestaBot?: string | null }): string {
  const palabras = o.mensajeCliente.trim().split(/\s+/).filter(Boolean).length
  if (palabras > PALABRAS_MENSAJE_CORTO || !o.ultimaRespuestaBot) return o.mensajeCliente
  return `${o.mensajeCliente}\n${o.ultimaRespuestaBot.slice(0, 200)}`
}

export async function seleccionarConocimiento<B extends { content: string }>(o: {
  consulta: string
  playbook: KBEntry[]
  cerebro: B[]
  embedder?: Embedder
  cache?: Map<string, number[]>
}): Promise<{ playbook: KBEntry[]; cerebro: B[]; modo: { playbook: ModoRecuperacion; cerebro: ModoRecuperacion } }> {
  // En serie a propósito: la consulta se vectoriza una vez y queda en cache
  const kb = await recuperar({
    consulta: o.consulta,
    candidatos: o.playbook,
    textoDe: e => `${e.title}: ${e.content}`,
    k: K_CONOCIMIENTO,
    // Lo que Daniela NO puede decir de este proyecto entra siempre
    fijar: e => e.topic === 'ficha_limites',
    embedder: o.embedder,
    cache: o.cache,
  })
  const cerebro = await recuperar({
    consulta: o.consulta,
    candidatos: o.cerebro,
    textoDe: b => b.content,
    k: K_CEREBRO,
    embedder: o.embedder,
    cache: o.cache,
  })
  return { playbook: kb.elegidos, cerebro: cerebro.elegidos, modo: { playbook: kb.modo, cerebro: cerebro.modo } }
}
