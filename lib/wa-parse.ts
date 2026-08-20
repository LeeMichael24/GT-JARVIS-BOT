/**
 * Parser de conversaciones pegadas en el panel (tab Entrenamiento).
 *
 * Acepta tres formatos y los normaliza a un transcript "CLIENTE:/EQUIPO:":
 *  1. Export de WhatsApp:  "[12/5/26, 10:31:04 AM] Daniela: Hola..."
 *                          "12/05/2026 10:31 - Cliente: Hola..."
 *  2. Formato simple:      "CLIENTE: hola" / "EQUIPO: buenas" / "DANIELA: ..."
 *  3. Texto libre:         se trata como UN transcript sin roles marcados
 *                          (el analizador igual extrae patrones útiles).
 *
 * La lógica de clasificación replica la de scripts/import-whatsapp.ts —
 * extraída aquí para que el panel y los scripts compartan el mismo parser.
 */

// Remitentes conocidos del negocio — sus mensajes son del EQUIPO
const BUSINESS_NAMES = [
  'grupo terranova',
  'daniela',
  'kenia',
  'mike fuentes',
  'michael narvaez',
  'mike narvaez',
  'mikel',
  'paola sigaran',
  'paola sigarán',
  'gt bot',
  'jarvis bot',
]

// Formato de export de WhatsApp (varía por locale):
//   [M/D/YY, H:MM:SS AM] Sender: Message
//   DD/MM/YYYY, HH:MM - Sender: Message
const WA_LINE_RE = /^\[?(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|a\.\s*m\.|p\.\s*m\.)?)\]?\s*[-–—]?\s*(.+?):\s(.+)$/i

// Formato simple con rol explícito al inicio de línea
const SIMPLE_LINE_RE = /^(cliente|equipo|daniela|asesor|vendedor|bot)\s*[:：]\s*(.+)$/i

const SYSTEM_PATTERNS = [
  /mensajes y las llamadas están cifrad/i,
  /messages and calls are end-to-end encrypted/i,
  /se unió usando el enlace/i,
  /creó el grupo/i,
  /cambió el asunto/i,
  /salió del grupo/i,
  /^<multimedia omitid/i,
  /^<media omitted>/i,
  /image omitted/i,
  /video omitted/i,
  /audio omitted/i,
  /sticker omitted/i,
  /document omitted/i,
]

export interface ParsedTrainingMessage {
  role: 'client' | 'team'
  content: string
}

export interface ParsedTrainingResult {
  /** Transcript(s) normalizados "CLIENTE:/EQUIPO:" listos para el analizador */
  transcripts: string[]
  /** Total de mensajes con rol detectado */
  messages: number
  /** Formato detectado */
  format: 'whatsapp_export' | 'simple' | 'raw'
}

function isSystemMessage(content: string): boolean {
  return SYSTEM_PATTERNS.some(re => re.test(content))
}

function classifySender(sender: string): 'client' | 'team' {
  const lower = sender.toLowerCase().trim()
  return BUSINESS_NAMES.some(name => lower.includes(name)) ? 'team' : 'client'
}

function toTranscript(messages: ParsedTrainingMessage[]): string {
  return messages
    .map(m => `${m.role === 'client' ? 'CLIENTE' : 'EQUIPO'}: ${m.content}`)
    .join('\n')
}

/** Corta un transcript largo en pedazos que caben en una llamada al modelo. */
export function chunkTranscript(transcript: string, maxChars = 6000): string[] {
  if (transcript.length <= maxChars) return [transcript]
  const chunks: string[] = []
  const lines = transcript.split('\n')
  let current = ''
  for (const line of lines) {
    if (current.length + line.length + 1 > maxChars && current) {
      chunks.push(current)
      current = ''
    }
    current += (current ? '\n' : '') + line
  }
  if (current) chunks.push(current)
  return chunks
}

export function parseTrainingText(raw: string): ParsedTrainingResult {
  const cleaned = raw.replace(/\r/g, '').replace(/[‎‏‪-‮﻿]/g, '')
  const lines = cleaned.split('\n')

  // ── Intento 1: export de WhatsApp ──
  const waMessages: ParsedTrainingMessage[] = []
  let waMatches = 0
  let currentWa: ParsedTrainingMessage | null = null
  for (const line of lines) {
    const m = line.match(WA_LINE_RE)
    if (m) {
      waMatches++
      if (currentWa) waMessages.push(currentWa)
      const [, , , sender, content] = m
      if (isSystemMessage(content)) { currentWa = null; continue }
      currentWa = { role: classifySender(sender), content: content.trim() }
    } else if (currentWa && line.trim()) {
      currentWa.content += '\n' + line.trim()
    }
  }
  if (currentWa) waMessages.push(currentWa)

  // Umbral: si al menos 3 líneas matchean el formato WA, es un export
  if (waMatches >= 3 && waMessages.length >= 2) {
    return {
      transcripts: chunkTranscript(toTranscript(waMessages)),
      messages: waMessages.length,
      format: 'whatsapp_export',
    }
  }

  // ── Intento 2: formato simple CLIENTE:/EQUIPO: ──
  const simpleMessages: ParsedTrainingMessage[] = []
  let currentSimple: ParsedTrainingMessage | null = null
  let simpleMatches = 0
  for (const line of lines) {
    const m = line.match(SIMPLE_LINE_RE)
    if (m) {
      simpleMatches++
      if (currentSimple) simpleMessages.push(currentSimple)
      const roleWord = m[1].toLowerCase()
      const role: 'client' | 'team' = roleWord === 'cliente' ? 'client' : 'team'
      currentSimple = { role, content: m[2].trim() }
    } else if (currentSimple && line.trim()) {
      currentSimple.content += '\n' + line.trim()
    }
  }
  if (currentSimple) simpleMessages.push(currentSimple)

  if (simpleMatches >= 2 && simpleMessages.length >= 2) {
    return {
      transcripts: chunkTranscript(toTranscript(simpleMessages)),
      messages: simpleMessages.length,
      format: 'simple',
    }
  }

  // ── Fallback: texto libre — un solo transcript sin roles ──
  const trimmed = cleaned.trim()
  return {
    transcripts: trimmed ? chunkTranscript(trimmed) : [],
    messages: 0,
    format: 'raw',
  }
}
