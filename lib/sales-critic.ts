import type { SendMedia, TurnPlan } from '@/types'

/**
 * REVISIÓN AUTOMÁTICA DE VENTA — el director comercial que lee antes de enviar.
 *
 * Nació del caso real "Hola, me interesa Portacelli, ¿adónde está ubicado?" →
 * "Portacelli está en Nuevo Cuscatlán, aquí está el link": correcto, literal y
 * sin nada que haga querer ir. Una regla en un prompt de ~17K tokens pesa poco;
 * un segundo modelo que solo tiene esta rúbrica delante, no la pierde de vista.
 *
 * Diseño que no se negocia: el juez NUNCA bloquea una respuesta. Si falla,
 * tarda o devuelve basura, se aprueba y el cliente recibe su mensaje.
 */

export interface EntradaRevision {
  mensajeCliente: string
  reply: string
  extras: string[]
  plan: TurnPlan | null
  sendMedia: SendMedia | null
}

export interface Veredicto {
  aprobada: boolean
  fallas: string[]
  sugerencia: string | null
}

export const RUBRICA_VENTA = `Eres el director comercial de Grupo Terranova. Revisas, ANTES de que salga, el mensaje de WhatsApp que una asesora le va a mandar a un cliente interesado en bienes raíces. No reescribes: juzgas.

REPRUEBA la respuesta si ocurre cualquiera de estas:
1. No responde lo que el cliente preguntó, o lo responde con una frase genérica que serviría para cualquier proyecto ("zona en desarrollo", "gran plusvalía", "ubicación estratégica") en vez del dato concreto.
2. Es literal: da solo el dato que se pidió y se detiene, sin sumar nada que aumente las ganas del cliente — un detalle concreto del proyecto, una recomendación con criterio, algo que se está moviendo, material para ver.
3. Deja al cliente sin siguiente paso, o el siguiente paso es una pregunta de trámite ("¿te gustaría…?", "¿te interesa…?", "¿qué te parece?").
4. Ignora la pregunta del cliente por seguir un guion o por hacer preguntas de calificación.
5. Promete o garantiza resultados, o usa frases de call center ("estoy aquí para ayudarte", "no dudes en…").
6. Anuncia que envía material y no hay material adjunto.

EXCEPCIONES — no reprueban por 2 ni por 3:
- momento pidio_tiempo: el cliente pidió tiempo o lo va a consultar; lo correcto es una respuesta cálida y corta, sin empujar.
- momento tramite: confirmar una cita, escalar al equipo, un gracias.

Responde SOLO con este JSON:
{"aprobada": true | false, "fallas": ["cada falla concreta, en una línea"], "sugerencia": "el dato o la jugada concreta que faltó, en una línea, o null"}`

export function construirPromptJuez(e: EntradaRevision): string {
  const burbujas = [e.reply, ...e.extras].map(b => `> ${b}`).join('\n')
  const plan = e.plan
    ? `PLAN DE LA ASESORA: objetivo "${e.plan.objetivo_del_turno}" · ángulo "${e.plan.angulo}" · siguiente paso "${e.plan.siguiente_paso}"`
    : 'PLAN DE LA ASESORA: no lo declaró'
  const material = e.sendMedia ? `${e.sendMedia.type} — ${e.sendMedia.description}` : 'ninguno'

  return `${RUBRICA_VENTA}

MOMENTO SEGÚN LA ASESORA: ${e.plan?.momento ?? 'desconocido'}
${plan}

MENSAJE DEL CLIENTE:
${e.mensajeCliente}

RESPUESTA A REVISAR (cada línea con > es una burbuja de WhatsApp):
${burbujas}

MATERIAL ADJUNTO: ${material}`
}

const APROBADO: Veredicto = { aprobada: true, fallas: [], sugerencia: null }

/** Lectura defensiva: cualquier cosa rara → aprobada. */
export function parsearVeredicto(raw: string): Veredicto {
  let o: unknown
  try {
    o = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim())
  } catch {
    return { ...APROBADO }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ...APROBADO }
  const r = o as Record<string, unknown>
  const fallas = Array.isArray(r.fallas)
    ? r.fallas.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).map(f => f.trim()).slice(0, 6)
    : []
  const aprobada = typeof r.aprobada === 'boolean' ? r.aprobada : fallas.length === 0
  const sugerencia = typeof r.sugerencia === 'string' && r.sugerencia.trim() ? r.sugerencia.trim() : null
  return { aprobada, fallas, sugerencia }
}

/**
 * Cuántas veces se consulta al juez. Medido 13-sep-2026: o4-mini juzgando 4
 * veces las mismas 12 respuestas cambió de veredicto en 5. Un voto es una tirada.
 */
export const VOTOS_JUEZ = 3

export interface Votos { aprueban: number; reprueban: number }

/** Consulta al juez N veces en paralelo y decide por mayoría. null si ninguno respondió. */
export async function votarVeredicto(
  prompt: string,
  juez: (prompt: string) => Promise<string>,
  votos: number = VOTOS_JUEZ,
): Promise<(Veredicto & { votos: Votos }) | null> {
  const resultados = await Promise.allSettled(Array.from({ length: Math.max(1, votos) }, () => juez(prompt)))
  const caidos = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (caidos.length) {
    const motivo = caidos[0].reason
    console.warn(`[sales-critic] ${caidos.length}/${resultados.length} jueces fallaron:`, motivo instanceof Error ? motivo.message : motivo)
  }
  const validos = resultados.flatMap(r => (r.status === 'fulfilled' ? [parsearVeredicto(r.value)] : []))
  if (!validos.length) return null

  const reprobados = validos.filter(v => !v.aprobada)
  const conteo = { aprueban: validos.length - reprobados.length, reprueban: reprobados.length }
  // Empate aprueba: el juez nunca bloquea una respuesta
  if (conteo.reprueban <= conteo.aprueban) return { ...APROBADO, votos: conteo }
  return {
    aprobada: false,
    fallas: [...new Set(reprobados.flatMap(v => v.fallas))].slice(0, 6),
    sugerencia: reprobados.find(v => v.sugerencia)?.sugerencia ?? null,
    votos: conteo,
  }
}

export async function revisarRespuesta(
  e: EntradaRevision,
  deps: { juez: (prompt: string) => Promise<string> },
  opts: { votos?: number } = {},
): Promise<Veredicto & { omitida?: string; votos?: Votos }> {
  // Confirmar una cita o escalar no se juzga como venta: ahorra tiempo
  if (e.plan?.momento === 'tramite') return { ...APROBADO, omitida: 'tramite' }
  const v = await votarVeredicto(construirPromptJuez(e), deps.juez, opts.votos)
  if (!v) return { ...APROBADO, omitida: 'error_juez' }
  return v
}
