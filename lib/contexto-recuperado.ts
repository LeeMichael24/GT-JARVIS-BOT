import type { KBEntry } from '@/lib/knowledge-base'
import { recuperar, type AlmacenVectores, type Embedder, type ModoRecuperacion } from '@/lib/memoria'
import type { Conversation } from '@/types'

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
  /** Vectores persistidos (Supabase). Sin él, se calcula en el proceso como antes. */
  almacen?: AlmacenVectores | null
}): Promise<{ playbook: KBEntry[]; cerebro: B[]; modo: { playbook: ModoRecuperacion; cerebro: ModoRecuperacion } }> {
  // En serie a propósito: la consulta se vectoriza una vez y queda en cache
  const kb = await recuperar({
    consulta: o.consulta,
    candidatos: o.playbook,
    textoDe: e => `${e.title}: ${e.content}`,
    k: K_CONOCIMIENTO,
    // Lo que Daniela NO puede decir de este proyecto entra siempre
    fijar: e => e.topic === 'ficha_limites',
    // Sin embeddings ya no se mete TODO (~4K tokens de más): las K con más palabras en común
    alFallar: 'lexico',
    almacen: o.almacen,
    fuente: 'conocimiento',
    embedder: o.embedder,
    cache: o.cache,
  })
  const cerebro = await recuperar({
    consulta: o.consulta,
    candidatos: o.cerebro,
    textoDe: b => b.content,
    k: K_CEREBRO,
    alFallar: 'lexico',
    almacen: o.almacen,
    fuente: 'cerebro',
    embedder: o.embedder,
    cache: o.cache,
  })
  return { playbook: kb.elegidos, cerebro: cerebro.elegidos, modo: { playbook: kb.modo, cerebro: cerebro.modo } }
}

/** Mensajes viejos del cliente (fuera de la ventana del historial) que entran por relevancia */
export const K_RECUERDOS = 4
/** Por debajo de esto el recuerdo es ruido: mejor no meterlo */
export const MIN_SIMILITUD_RECUERDO = 0.3
/** Hasta cuántos mensajes viejos se revisan por turno */
export const MAX_MENSAJES_VIEJOS = 150
/** Un "ok" o "gracias" no es un recuerdo */
const PALABRAS_MIN_RECUERDO = 4

/**
 * MEMORIA DEL CLIENTE — Daniela recuerda lo que el cliente dijo hace semanas sin
 * volver a cargar toda la conversación. El historial reciente entra completo
 * (ventana de agent_settings); de lo anterior entra solo lo que tiene que ver
 * con lo que pregunta hoy. Cada mensaje se vectoriza una vez y queda en Supabase.
 */
export async function recuerdosDelCliente(o: {
  consulta: string
  anteriores: Conversation[]
  embedder?: Embedder
  cache?: Map<string, number[]>
  almacen?: AlmacenVectores | null
}): Promise<Conversation[]> {
  const candidatos = o.anteriores.filter(m =>
    m.content.trim().split(/\s+/).length >= PALABRAS_MIN_RECUERDO && !m.content.startsWith('[Plantilla'))
  if (!candidatos.length) return []
  const r = await recuperar({
    consulta: o.consulta,
    candidatos,
    textoDe: m => m.content,
    k: K_RECUERDOS,
    minSimilitud: MIN_SIMILITUD_RECUERDO,
    alFallar: 'nada',
    almacen: o.almacen,
    fuente: 'conversacion',
    embedder: o.embedder,
    cache: o.cache,
  })
  return [...r.elegidos].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export function formatRecuerdosParaPrompt(recuerdos: Conversation[]): string {
  if (!recuerdos.length) return ''
  const lineas = recuerdos.map(m => {
    const fecha = new Date(m.created_at).toLocaleDateString('es-SV', { timeZone: 'America/El_Salvador', day: 'numeric', month: 'short' })
    const quien = m.role === 'user' ? 'cliente' : 'Daniela'
    return `- [${fecha}, ${quien}] ${m.content.replace(/\s+/g, ' ').slice(0, 300)}`
  })
  return `# RECUERDOS DE ESTE CLIENTE — MENSAJES ANTERIORES RELACIONADOS CON LO QUE PREGUNTA HOY
Son de conversaciones pasadas (no están en el historial de abajo). Úsalos para no volver a preguntar lo que ya te dijo ni repetir lo que ya le enviaste.
${lineas.join('\n')}`
}
