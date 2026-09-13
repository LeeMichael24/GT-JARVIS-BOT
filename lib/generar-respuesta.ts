import type { AgentSettings } from '@/lib/agent-settings'
import type { ClaudeResponse, Conversation } from '@/types'
import { callClaude, parseClaudeResponse } from '@/services/claude/client'
import { revisarRespuesta, type Veredicto } from '@/lib/sales-critic'
import { limpiarFrasesProhibidas } from '@/lib/reply-guard'

/**
 * GENERAR LA RESPUESTA DE DANIELA — un solo lugar para el webhook y para la
 * batería de evaluación. Antes la evaluación reimplementaba los pasos y medía
 * algo parecido a producción; ahora mide exactamente lo mismo.
 *
 *   1. modelo → JSON (con el plan del turno antes del reply)
 *   2. si el JSON viene inválido: un reintento con aviso
 *   3. revisión del director comercial (juez rápido) → si reprueba, reescribe
 *   4. filtro de frases prohibidas y promesas de garantía
 */

/** Pasado este tiempo desde que llegó el mensaje, se envía sin revisar. */
export const PRESUPUESTO_REVISION_MS = 25_000
/** Pasado este tiempo, aunque el juez repruebe, no se reescribe. */
export const PRESUPUESTO_REESCRITURA_MS = 32_000
export const MODELO_JUEZ = 'gpt-4.1-mini'

export interface DepsGenerar {
  llamarModelo: (system: string, history: Conversation[], opts: { temperature: number; model?: string }) => Promise<string>
  juez: (prompt: string, model?: string) => Promise<string>
  ahora: () => number
}

export interface ArgsGenerar {
  systemPrompt: string
  history: Conversation[]
  settings: Pick<AgentSettings, 'llm_temperature' | 'sales_critic_enabled'> & Partial<Pick<AgentSettings, 'llm_model' | 'sales_critic_model'>>
  mensajeCliente: string
  /** Momento en que llegó el mensaje del cliente (ms) — el presupuesto corre desde ahí */
  inicioMs: number
}

export interface ResultadoGenerar {
  respuesta: ClaudeResponse
  revision: { veredicto: Veredicto | null; reescrita: boolean; motivoOmitida: string | null }
}

const AVISO_REINTENTO = '\n\n# ATENCIÓN — REINTENTO\nTu respuesta anterior fue un JSON vacío o inválido. Responde AHORA con el JSON COMPLETO del formato especificado arriba. El campo "reply" es OBLIGATORIO: contiene tu mensaje de WhatsApp para el cliente, con tu personalidad de siempre.'

function bloqueRevision(borrador: ClaudeResponse, v: Veredicto): string {
  const burbujas = [borrador.reply, ...(borrador.extra_messages ?? [])].map(b => `> ${b}`).join('\n')
  const fallas = v.fallas.length ? v.fallas.map(f => `- ${f}`).join('\n') : '- no cumple la venta guiada'
  return `

# REVISIÓN DEL DIRECTOR COMERCIAL — TU BORRADOR NO SALE ASÍ
Para el último mensaje del cliente escribiste:
${burbujas}

Falló por:
${fallas}
${v.sugerencia ? `Qué faltó: ${v.sugerencia}\n` : ''}
Reescribe el JSON COMPLETO corrigiendo eso. Conserva los datos correctos, el material (send_media) y las acciones que ya tenías. No agregues datos que no estén en este prompt.`
}

export function depsReales(): DepsGenerar {
  return {
    llamarModelo: (system, history, opts) => callClaude(system, history, opts),
    juez: (prompt, model) => callClaude(
      prompt,
      [{ id: 'juez', lead_id: 'juez', role: 'user', content: 'Evalúa la respuesta y devuelve el JSON.', wa_message_id: null, sent_by: null, created_at: new Date().toISOString() }],
      // o4-mini razona antes de responder: necesita más margen que el juez rápido
      { model: model ?? MODELO_JUEZ, temperature: 0, timeoutMs: /^o\d/.test(model ?? '') ? 20_000 : 8_000 },
    ),
    ahora: () => Date.now(),
  }
}

/**
 * Si el modelo principal está saturado (429), responde este: tiene su propio
 * límite de tokens por minuto (200K contra 30K de gpt-4o/gpt-4.1).
 */
export const MODELO_RESPALDO = 'gpt-4.1-mini'

function esSaturacion(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status
  return status === 429 || /\b429\b|rate limit/i.test(err instanceof Error ? err.message : String(err))
}

export async function generarRespuesta(args: ArgsGenerar, deps: DepsGenerar = depsReales()): Promise<ResultadoGenerar> {
  const { systemPrompt, history, settings } = args
  const opts = { temperature: settings.llm_temperature, model: settings.llm_model }

  // 1-2. Modelo, con un reintento si el JSON viene sin reply. Si falla dos
  // veces, lanza: el webhook tiene el mensaje de respaldo para no dejar en visto.
  // Si OpenAI está saturado, responde el modelo de respaldo sin revisión.
  let respuesta: ClaudeResponse
  let saturado = false
  try {
    respuesta = parseClaudeResponse(await deps.llamarModelo(systemPrompt, history, opts))
  } catch (primerError) {
    if (esSaturacion(primerError)) {
      console.warn(`[generar-respuesta] ${opts.model ?? 'modelo'} saturado — responde ${MODELO_RESPALDO} sin revisión`)
      saturado = true
      respuesta = parseClaudeResponse(await deps.llamarModelo(systemPrompt, history, { ...opts, model: MODELO_RESPALDO }))
    } else {
      console.warn('[generar-respuesta] JSON inválido — reintentando:', primerError instanceof Error ? primerError.message : primerError)
      respuesta = parseClaudeResponse(await deps.llamarModelo(systemPrompt + AVISO_REINTENTO, history, opts))
    }
  }

  // 3. Revisión de venta
  const revision: ResultadoGenerar['revision'] = { veredicto: null, reescrita: false, motivoOmitida: null }
  if (saturado) {
    // Reescribir usaría otra vez el modelo saturado
    revision.motivoOmitida = 'saturado'
  } else if (!settings.sales_critic_enabled) {
    revision.motivoOmitida = 'apagada'
  } else if (deps.ahora() - args.inicioMs > PRESUPUESTO_REVISION_MS) {
    revision.motivoOmitida = 'sin_tiempo'
  } else {
    const v = await revisarRespuesta({
      mensajeCliente: args.mensajeCliente,
      reply: respuesta.reply,
      extras: respuesta.extra_messages ?? [],
      plan: respuesta.plan ?? null,
      sendMedia: respuesta.send_media,
    }, { juez: prompt => deps.juez(prompt, settings.sales_critic_model) })
    revision.veredicto = v
    if (v.omitida) revision.motivoOmitida = v.omitida

    if (!v.aprobada) {
      if (deps.ahora() - args.inicioMs > PRESUPUESTO_REESCRITURA_MS) {
        revision.motivoOmitida = 'sin_tiempo_para_reescribir'
      } else {
        try {
          const nueva = parseClaudeResponse(await deps.llamarModelo(systemPrompt + bloqueRevision(respuesta, v), history, opts))
          // El material que ya se iba a enviar no se pierde en la reescritura
          if (!nueva.send_media && respuesta.send_media) nueva.send_media = respuesta.send_media
          respuesta = nueva
          revision.reescrita = true
        } catch (err) {
          console.warn('[generar-respuesta] reescritura inválida — se envía la original:', err instanceof Error ? err.message : err)
        }
      }
    }
  }

  // 4. Lo que el prompt no garantiza lo garantiza el código
  respuesta.reply = limpiarFrasesProhibidas(respuesta.reply)
  respuesta.extra_messages = (respuesta.extra_messages ?? []).map(limpiarFrasesProhibidas)
  return { respuesta, revision }
}
