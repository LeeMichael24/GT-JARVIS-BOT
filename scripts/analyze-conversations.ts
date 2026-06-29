import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import OpenAI from 'openai'

function loadEnv(filePath: string) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    else { const ci = val.indexOf('#'); if (ci > 0) val = val.slice(0, ci).trim() }
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnv(join(__dirname, '..', '.env.local'))
loadEnv(join(__dirname, '..', '.env'))

const EXPORTS_DIR = join(__dirname, '..', 'data', 'whatsapp-exports')

const BUSINESS_NAMES = [
  'grupo terranova', 'daniela', 'kenia', 'mike fuentes',
  'michael narvaez', 'michael narváez', 'mike narvaez',
  'paola sigaran', 'paola sigarán', 'gt bot', 'jarvis bot',
]

const LINE_RE = /^\[?(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|a\.\s*m\.|p\.\s*m\.)?)\]?\s*[-–—]?\s*(.+?):\s(.+)$/i

function isBusiness(sender: string): boolean {
  const lower = sender.toLowerCase().trim()
  return BUSINESS_NAMES.some(name => lower.includes(name))
}

function isSkipContent(content: string): boolean {
  return /image omitted|video omitted|audio omitted|sticker omitted|document omitted|Contact card omitted|GIF omitted|location omitted|Messages and calls are end-to-end encrypted|This message was deleted|This message was edited|This chat started from an ad|Data sharing for customer-related|Missed voice call|Missed video call|^null$/i.test(content.trim())
}

interface ConversationSummary {
  contactName: string
  filename: string
  messageCount: number
  textContent: string
}

function parseFile(filepath: string, filename: string): ConversationSummary | null {
  const raw = readFileSync(filepath, 'utf-8').replace(/\r/g, '')
  const lines = raw.split('\n')
  const msgs: string[] = []
  let contactName = ''
  const senders = new Map<string, number>()

  for (const rawLine of lines) {
    const line = rawLine.replace(/[‎‏‪-‮﻿]/g, '')
    const match = line.match(LINE_RE)
    if (match) {
      const sender = match[3].trim()
      const content = match[4].trim()
      senders.set(sender, (senders.get(sender) ?? 0) + 1)
      if (isSkipContent(content)) continue
      const role = isBusiness(sender) ? 'EQUIPO' : 'CLIENTE'
      msgs.push(`[${role}] ${content}`)
    }
  }

  for (const [name] of [...senders.entries()].sort((a, b) => b[1] - a[1])) {
    if (!isBusiness(name)) { contactName = name; break }
  }
  if (!contactName) contactName = filename.replace('.txt', '')

  if (msgs.length < 3) return null

  return {
    contactName,
    filename,
    messageCount: msgs.length,
    textContent: msgs.join('\n'),
  }
}

async function main() {
  console.log('=== GPT-4o Conversation Analysis for Daniela ===\n')

  const openaiKey = process.env.OPENAI_API_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!openaiKey || !supabaseUrl || !supabaseKey) {
    console.error('Missing OPENAI_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const openai = new OpenAI({ apiKey: openaiKey })
  const supabase = createClient(supabaseUrl, supabaseKey)

  const files = require('fs').readdirSync(EXPORTS_DIR).filter((f: string) => f.endsWith('.txt'))
  const conversations: ConversationSummary[] = []

  for (const file of files) {
    const result = parseFile(join(EXPORTS_DIR, file), file)
    if (result) conversations.push(result)
  }

  console.log(`Parsed ${conversations.length} conversations with 3+ messages\n`)
  conversations.sort((a, b) => b.messageCount - a.messageCount)

  // Process in batches of 8 conversations
  const BATCH_SIZE = 8
  let totalPatterns = 0

  for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
    const batch = conversations.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(conversations.length / BATCH_SIZE)

    console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.map(c => c.contactName).join(', ')})`)

    const conversationsText = batch.map(conv =>
      `--- ${conv.contactName} (${conv.messageCount} msgs) ---\n${conv.textContent}`
    ).join('\n\n')

    // Truncate to ~12K tokens worth of text (~48K chars)
    const truncated = conversationsText.slice(0, 48000)

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Eres el analista principal de Grupo Terranova, empresa inmobiliaria premium en El Salvador. Analizas conversaciones REALES de WhatsApp Business para entrenar a "Daniela", un agente de IA que será la vendedora virtual de la empresa.

Tu análisis debe cubrir TODAS estas dimensiones:

## 1. VOZ Y TONO
- Como se expresan los vendedores (formalidad, cercanía, vocabulario)
- Longitud ideal de mensajes
- Uso de emojis (cuando sí, cuando no)
- Como saludan, se despiden, dan seguimiento

## 2. PERFILAMIENTO DE CLIENTES
- Como identificar rápido el tipo de cliente (inversor, comprador para vivienda, alquiler)
- Señales de interés alto vs bajo
- Preguntas clave que hacen los clientes interesados
- Señales psicológicas de compra

## 3. TECNICAS DE VENTA
- Como presentar precios y planes de pago
- Como manejar objeciones
- Como crear urgencia sin ser agresivo
- Como hacer follow-up sin ser molesto
- Como cerrar (llevar a reserva/cita)

## 4. ESCALAMIENTO AL CEO
- Cuando el vendedor escala o involucra al director
- Que tipo de decisiones requieren al CEO
- Como presentar al CEO al cliente

## 5. PROCESO DE VENTA
- Pasos que se siguen desde primer contacto hasta cierre
- Documentos que se envían y en qué orden
- Cuando agendar cita virtual vs presencial
- Info que se pide al cliente y cuándo

## 6. CATEGORIAS DE PRODUCTO
- Como se diferencian las conversaciones por tipo (apartamento, casa, townhome, inversión, alquiler, call center)
- Argumentos específicos por tipo de producto

Responde en JSON:
{
  "patterns": [
    { "topic": "max 5 palabras", "content": "instrucción accionable para Daniela en 1-2 oraciones", "category": "pattern|observation|correction|metric" }
  ]
}

REGLAS:
- Máximo 15 patrones por batch
- Todo accionable: qué debe HACER Daniela
- En español
- No describas lo que ves, di lo que Daniela debe hacer
- Prioriza patrones que se REPITEN entre conversaciones`
          },
          { role: 'user', content: truncated }
        ],
      })

      const result = JSON.parse(response.choices[0].message.content ?? '{}')
      if (result.patterns?.length) {
        const rows = result.patterns.map((p: { category: string; topic: string; content: string }) => ({
          category: ['pattern', 'observation', 'correction', 'metric'].includes(p.category) ? p.category : 'pattern',
          topic: p.topic,
          content: p.content,
          source: 'team' as const,
          confidence: 0.85,
          active: true,
        }))

        const { error } = await supabase.from('agent_brain').insert(rows)
        if (error) console.error('  DB error:', error.message)
        else {
          totalPatterns += rows.length
          console.log(`  +${rows.length} patterns saved`)
        }
      }
    } catch (err) {
      console.error(`  Analysis error:`, (err as Error).message)
    }
  }

  console.log(`\n=== DONE: ${totalPatterns} total patterns saved to agent_brain ===`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
