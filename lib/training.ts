import { getServiceClient } from '@/lib/supabase'
import { callClaude } from '@/services/claude/client'
import { getAgentSettings } from '@/lib/agent-settings'
import { parseTrainingText } from '@/lib/wa-parse'
import type { BrainObservation } from '@/types'

/**
 * Entrenamiento manual desde el panel: el equipo pega conversaciones
 * reales (export de WhatsApp, formato CLIENTE:/EQUIPO: o texto libre),
 * el modelo extrae patrones de venta accionables y el admin decide
 * cuáles guardar en el cerebro (source='team', confianza 0.85 → entran
 * al prompt de inmediato).
 *
 * Es la misma tubería que la reflexión nocturna, pero bajo demanda y
 * con revisión humana antes de guardar.
 */

export interface TrainingProposal extends BrainObservation {
  /** Confianza sugerida — el admin puede ajustarla antes de guardar */
  confidence: number
}

export interface TrainingAnalysis {
  proposals: TrainingProposal[]
  transcripts: number
  messages: number
  format: string
}

const MAX_PROPOSALS_PER_CHUNK = 8
const MAX_CHUNKS = 6 // ~36K chars por análisis — cabe en tiempo de una server action

export function buildTrainingPrompt(transcript: string, existingTopics: string[]): string {
  return `Eres el módulo de entrenamiento de Daniela, una SDR de bienes raíces de Grupo Terranova (El Salvador).
El equipo te comparte una conversación REAL de ventas para que Daniela aprenda de ella.
Extrae PATRONES ACCIONABLES que Daniela pueda aplicar en futuras conversaciones.

QUÉ BUSCAR (en orden de valor):
1. Técnicas del vendedor que FUNCIONARON (frases, enfoques, manejo de tiempos)
2. Objeciones del cliente y CÓMO se respondieron con éxito
3. Preguntas frecuentes y las mejores respuestas dadas
4. Información de proyectos/precios/procesos que Daniela debería saber
5. Errores a evitar (respuestas que enfriaron al cliente)

TEMAS QUE YA EXISTEN EN EL CEREBRO (NO repitas estos temas, solo aporta si tienes un ángulo NUEVO):
${existingTopics.length ? existingTopics.map(t => `- ${t}`).join('\n') : '- (ninguno)'}

CONVERSACIÓN:
${transcript}

Responde SOLO JSON válido:
{"learnings": [{"category": "pattern|objection_response|knowledge|mistake", "topic": "titulo corto y especifico", "content": "el aprendizaje, concreto y accionable, max 350 caracteres"}]}
Máximo ${MAX_PROPOSALS_PER_CHUNK} aprendizajes por conversación. Calidad sobre cantidad — si la conversación no enseña nada, devuelve {"learnings": []}.`
}

/** Mapea las categorías del análisis a las categorías del cerebro. */
export function toTrainingProposals(raw: unknown): TrainingProposal[] {
  const arr = (raw as { learnings?: unknown })?.learnings
  if (!Array.isArray(arr)) return []
  const catMap: Record<string, BrainObservation['category']> = {
    pattern: 'pattern',
    objection_response: 'pattern',
    knowledge: 'observation',
    mistake: 'correction',
  }
  return arr
    .filter((l): l is Record<string, string> =>
      !!l && typeof l === 'object' &&
      typeof (l as Record<string, unknown>).topic === 'string' &&
      typeof (l as Record<string, unknown>).content === 'string')
    .slice(0, MAX_PROPOSALS_PER_CHUNK)
    .map(l => ({
      category: catMap[l.category] ?? 'observation',
      topic: l.topic.slice(0, 80),
      content: l.content.slice(0, 450),
      confidence: 0.85,
    }))
}

/**
 * Analiza texto pegado y devuelve propuestas de aprendizaje SIN guardar.
 * El guardado es un paso aparte (el admin revisa y selecciona).
 */
export async function analyzeTrainingText(rawText: string): Promise<TrainingAnalysis | { error: string }> {
  const parsed = parseTrainingText(rawText)
  if (parsed.transcripts.length === 0) {
    return { error: 'EMPTY' }
  }

  const settings = await getAgentSettings()

  // Temas existentes para que el modelo no proponga duplicados
  let existingTopics: string[] = []
  try {
    const { data } = await getServiceClient()
      .from('agent_brain')
      .select('topic')
      .eq('active', true)
      .limit(300)
    existingTopics = Array.from(new Set((data ?? []).map(t => (t as { topic: string }).topic)))
  } catch {
    // sin tabla → sin dedup previo, el análisis sigue
  }

  const chunks = parsed.transcripts.slice(0, MAX_CHUNKS)
  const all: TrainingProposal[] = []
  const seenTopics = new Set<string>()

  for (const chunk of chunks) {
    try {
      const raw = await callClaude(
        buildTrainingPrompt(chunk, existingTopics),
        [],
        { temperature: settings.reflection_temperature },
      )
      const proposals = toTrainingProposals(JSON.parse(raw))
      for (const p of proposals) {
        const key = p.topic.toLowerCase()
        if (seenTopics.has(key)) continue
        seenTopics.add(key)
        all.push(p)
      }
    } catch (e) {
      console.warn('[training] Chunk analysis failed:', e instanceof Error ? e.message : e)
    }
  }

  if (all.length === 0 && chunks.length > 0) {
    return { error: 'NO_LEARNINGS' }
  }

  return {
    proposals: all,
    transcripts: chunks.length,
    messages: parsed.messages,
    format: parsed.format,
  }
}
