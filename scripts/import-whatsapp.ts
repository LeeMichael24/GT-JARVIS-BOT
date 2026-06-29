/**
 * Import WhatsApp Business chat exports into Supabase.
 *
 * Usage:
 *   npx tsx scripts/import-whatsapp.ts
 *
 * Expects .txt files in data/whatsapp-exports/
 * Each file is one chat exported from WhatsApp Business → Export Chat → Without Media.
 *
 * The script:
 *  1. Parses each .txt into structured messages (role, content, timestamp)
 *  2. Creates/finds leads by phone number or contact name
 *  3. Imports messages into the conversations table
 *  4. Analyzes conversations with GPT-4o to extract patterns for agent_brain
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import OpenAI from 'openai'

// ── Load .env ─────────────────────────────────────────────────

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

// ── Config ─────────────────────────────────────────────────────

const EXPORTS_DIR = join(__dirname, '..', 'data', 'whatsapp-exports')
const BUSINESS_PHONE = process.env.WA_PHONE_NUMBER_ID ?? ''
const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_ANALYSIS = process.argv.includes('--skip-analysis')

// Known business names — messages from these are role: 'assistant'
const BUSINESS_NAMES = [
  'grupo terranova',
  'daniela',
  'kenia',
  'mike fuentes',
  'michael narvaez',
  'mike narvaez',
  'paola sigaran',
  'paola sigarán',
  'gt bot',
  'jarvis bot',
]

// ── Types ──────────────────────────────────────────────────────

interface ParsedMessage {
  timestamp: Date
  sender: string
  content: string
  role: 'user' | 'assistant' | 'human'
}

interface ParsedChat {
  filename: string
  contactName: string
  contactPhone: string | null
  messages: ParsedMessage[]
}

interface AnalysisResult {
  patterns: Array<{ topic: string; content: string; category: string }>
}

// ── WhatsApp .txt parser ───────────────────────────────────────

// WhatsApp export format varies by locale:
//   [M/D/YY, H:MM:SS AM] Sender: Message
//   [DD/MM/YYYY, HH:MM:SS] Sender: Message
//   M/D/YY, H:MM:SS AM - Sender: Message
const LINE_RE = /^\[?(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|a\.\s*m\.|p\.\s*m\.)?)\]?\s*[-–—]?\s*(.+?):\s(.+)$/i

function parseWhatsAppExport(raw: string, filename: string): ParsedChat {
  const lines = raw.replace(/\r/g, '').split('\n')
  const messages: ParsedMessage[] = []
  let currentMsg: ParsedMessage | null = null
  const senders = new Map<string, number>()

  // Try to extract phone from filename (e.g., "WhatsApp Chat with +503 7742 3766.txt")
  const phoneMatch = filename.match(/(\+?\d[\d\s\-]{7,})/)
  const contactPhone = phoneMatch ? phoneMatch[1].replace(/[\s\-]/g, '') : null

  // Extract contact name from filename
  const nameMatch = filename.match(/(?:Chat with |Chat con |chat - )(.+?)\.txt$/i)
  const contactName = nameMatch ? nameMatch[1].trim() : filename.replace('.txt', '')

  for (const rawLine of lines) {
    const line = rawLine.replace(/[‎‏‪-‮﻿]/g, '')
    const match = line.match(LINE_RE)

    if (match) {
      if (currentMsg) messages.push(currentMsg)

      const [, datePart, timePart, sender, content] = match
      const timestamp = parseWADate(datePart, timePart)

      // Track senders for contact extraction
      const sName = sender.trim()
      senders.set(sName, (senders.get(sName) ?? 0) + 1)

      // Skip system messages
      if (isSystemMessage(content)) {
        currentMsg = null
        continue
      }

      const role = classifySender(sender)
      currentMsg = { timestamp, sender: sName, content: content.trim(), role }
    } else if (currentMsg && line.trim()) {
      currentMsg.content += '\n' + line.trim()
    }
  }

  if (currentMsg) messages.push(currentMsg)

  // If no phone from filename, extract contact name from non-business senders
  let finalContactName = contactName
  if (!contactPhone && senders.size > 0) {
    for (const [name] of [...senders.entries()].sort((a, b) => b[1] - a[1])) {
      if (!BUSINESS_NAMES.some(bn => name.toLowerCase().includes(bn))) {
        finalContactName = name
        break
      }
    }
  }

  return { filename, contactName: finalContactName, contactPhone, messages }
}

function parseWADate(datePart: string, timePart: string): Date {
  // Normalize separators
  const parts = datePart.split(/[\/\-\.]/)
  let day: number, month: number, year: number

  if (parts.length !== 3) return new Date()

  const p0 = parseInt(parts[0])
  const p1 = parseInt(parts[1])
  const p2 = parseInt(parts[2])

  if (p0 > 31) {
    // YYYY/MM/DD
    year = p0; month = p1; day = p2
  } else if (p2 > 31) {
    // DD/MM/YYYY or MM/DD/YYYY
    year = p2
    // Heuristic: if first number > 12, it's DD/MM
    if (p0 > 12) { day = p0; month = p1 }
    else if (p1 > 12) { day = p1; month = p0 }
    else { month = p0; day = p1 } // Default to M/D (US format common in WA exports)
  } else {
    // M/D/YY
    month = p0; day = p1; year = p2 + 2000
  }

  // Parse time
  const timeClean = timePart.replace(/\./g, '').replace(/\s+/g, ' ').trim()
  const isPM = /pm/i.test(timeClean)
  const isAM = /am/i.test(timeClean)
  const timeOnly = timeClean.replace(/\s*(am|pm|a\s*m|p\s*m)\s*/i, '').trim()
  const timeParts = timeOnly.split(':').map(Number)
  let hours = timeParts[0]
  const minutes = timeParts[1] ?? 0
  const seconds = timeParts[2] ?? 0

  if (isPM && hours < 12) hours += 12
  if (isAM && hours === 12) hours = 0

  return new Date(year, month - 1, day, hours, minutes, seconds)
}

function classifySender(sender: string): 'user' | 'assistant' | 'human' {
  const lower = sender.toLowerCase().trim()
  if (BUSINESS_NAMES.some(name => lower.includes(name))) return 'human'
  return 'user'
}

function isSystemMessage(content: string): boolean {
  const systemPatterns = [
    /mensajes y las llamadas están cifrad/i,
    /messages and calls are end-to-end encrypted/i,
    /se unió usando el enlace/i,
    /joined using this group/i,
    /creó el grupo/i,
    /created group/i,
    /cambió el asunto/i,
    /changed the subject/i,
    /cambió el ícono/i,
    /changed this group/i,
    /salió del grupo/i,
    /left the group/i,
    /fue eliminad/i,
    /was removed/i,
    /^<multimedia omitid/i,
    /^<media omitted>/i,
    /image omitted/i,
    /video omitted/i,
    /audio omitted/i,
    /sticker omitted/i,
    /document omitted/i,
    /Contact card omitted/i,
    /GIF omitted/i,
    /location omitted/i,
    /^se eliminó este mensaje/i,
    /^this message was deleted/i,
    /^You deleted this message/i,
    /^This message was edited/i,
    /^null$/i,
    /This chat started from an ad/i,
    /Data sharing for customer-related/i,
    /Missed voice call/i,
    /Missed video call/i,
  ]
  return systemPatterns.some(p => p.test(content.trim()))
}

// ── Supabase import ────────────────────────────────────────────

async function importToSupabase(chats: ParsedChat[]): Promise<void> {
  const supabase = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let totalImported = 0
  let leadsCreated = 0

  for (const chat of chats) {
    if (chat.messages.length === 0) {
      console.log(`  ⏭  ${chat.filename}: no messages, skipping`)
      continue
    }

    // Find or create lead
    let phone = chat.contactPhone ?? chat.contactName.replace(/\D/g, '')
    if (!phone || phone.length < 5) {
      // Use contact name as identifier if no phone
      phone = `n_${chat.contactName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 17)}`
    }

    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, name')
      .eq('phone', phone)
      .maybeSingle()

    let leadId: string

    if (existingLead) {
      leadId = existingLead.id
      // Update name if we have one and the lead doesn't
      if (!existingLead.name && chat.contactName && !/^\d+$/.test(chat.contactName)) {
        await supabase.from('leads').update({ name: chat.contactName }).eq('id', leadId)
      }
    } else {
      const name = /^\d+$/.test(chat.contactName) ? null : chat.contactName
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          phone,
          name,
          stage: 'new',
          first_message_at: chat.messages[0].timestamp.toISOString(),
          last_message_at: chat.messages[chat.messages.length - 1].timestamp.toISOString(),
        })
        .select('id')
        .single()

      if (error) {
        console.error(`  ✗ Failed to create lead for ${phone}: ${error.message}`)
        continue
      }
      leadId = newLead.id
      leadsCreated++
    }

    // Import messages in batches of 50
    const batchSize = 50
    let imported = 0

    for (let i = 0; i < chat.messages.length; i += batchSize) {
      const batch = chat.messages.slice(i, i + batchSize).map(msg => ({
        lead_id: leadId,
        role: msg.role,
        content: msg.content,
        wa_message_id: `import_${phone}_${msg.timestamp.getTime()}`,
        sent_by: msg.role !== 'user' ? msg.sender : null,
        created_at: msg.timestamp.toISOString(),
      }))

      const { error } = await supabase.from('conversations').insert(batch)
      if (error) {
        // Likely duplicates — try one by one
        for (const row of batch) {
          const { error: singleErr } = await supabase.from('conversations').insert(row)
          if (!singleErr) imported++
        }
      } else {
        imported += batch.length
      }
    }

    totalImported += imported
    console.log(`  ✓ ${chat.contactName} (${phone}): ${imported} messages imported`)
  }

  console.log(`\n📊 Total: ${totalImported} messages imported, ${leadsCreated} new leads created`)
}

// ── GPT-4o analysis for agent_brain ────────────────────────────

async function analyzeConversations(chats: ParsedChat[]): Promise<void> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Combine substantial conversations (10+ messages) for analysis
  const substantialChats = chats.filter(c => c.messages.length >= 10)
  if (substantialChats.length === 0) {
    console.log('\n⏭  No substantial conversations (10+ messages) to analyze')
    return
  }

  console.log(`\n🧠 Analyzing ${substantialChats.length} conversations for agent_brain patterns...`)

  // Process in chunks of 5 conversations to stay within token limits
  const chunkSize = 5
  let totalPatterns = 0

  for (let i = 0; i < substantialChats.length; i += chunkSize) {
    const chunk = substantialChats.slice(i, i + chunkSize)
    const conversationsText = chunk.map(chat => {
      const msgs = chat.messages
        .map(m => `[${m.role === 'user' ? 'CLIENTE' : 'EQUIPO'}] ${m.content}`)
        .join('\n')
      return `--- Conversación con ${chat.contactName} (${chat.messages.length} msgs) ---\n${msgs}`
    }).join('\n\n')

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Eres un analista de ventas de bienes raíces de lujo en El Salvador (Grupo Terranova).

Analiza estas conversaciones reales de WhatsApp del equipo de ventas y extrae PATRONES ACCIONABLES que un agente de IA (Daniela) pueda aprender.

Categorías:
- "pattern": técnica de ventas recurrente que funciona (ej: cómo manejan objeciones de precio)
- "observation": comportamiento del cliente que se repite (ej: clientes de inversión preguntan ROI primero)
- "correction": algo que el equipo hace diferente a lo esperado y funciona mejor
- "metric": dato cuantitativo relevante (ej: promedio de mensajes para cerrar)

Responde en JSON:
{
  "patterns": [
    { "topic": "tema corto", "content": "descripción accionable en español", "category": "pattern|observation|correction|metric" }
  ]
}

REGLAS:
- Solo patrones que se repiten o son muy reveladores
- Contenido accionable: qué debe HACER Daniela, no solo observar
- Máximo 15 patrones por análisis
- En español`
        },
        { role: 'user', content: conversationsText }
      ],
    })

    try {
      const result = JSON.parse(response.choices[0].message.content ?? '{}') as AnalysisResult
      if (result.patterns?.length) {
        const rows = result.patterns.map(p => ({
          category: p.category as 'observation' | 'pattern' | 'correction' | 'metric',
          topic: p.topic,
          content: p.content,
          source: 'team' as const,
          confidence: 0.85,
          active: true,
        }))

        const { error } = await supabase.from('agent_brain').insert(rows)
        if (error) console.warn('  ⚠ Failed to save patterns:', error.message)
        else {
          totalPatterns += rows.length
          console.log(`  ✓ Batch ${Math.floor(i / chunkSize) + 1}: ${rows.length} patterns extracted`)
        }
      }
    } catch {
      console.warn(`  ⚠ Failed to parse analysis for batch ${Math.floor(i / chunkSize) + 1}`)
    }
  }

  console.log(`\n🧠 Total: ${totalPatterns} patterns saved to agent_brain (source: team, confidence: 0.85)`)
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('📱 WhatsApp Business Chat Importer')
  console.log('═'.repeat(50))

  // Validate env
  if (!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('✗ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  // Read all .txt files from exports directory
  let files: string[]
  try {
    files = readdirSync(EXPORTS_DIR).filter(f => f.endsWith('.txt'))
  } catch {
    console.error(`✗ Cannot read ${EXPORTS_DIR}`)
    console.error('  Put your WhatsApp export .txt files there first.')
    process.exit(1)
  }

  if (files.length === 0) {
    console.error(`✗ No .txt files found in ${EXPORTS_DIR}`)
    console.error('  Export chats from WhatsApp Business → Settings → Chats → Export Chat')
    process.exit(1)
  }

  console.log(`\n📂 Found ${files.length} chat export(s) in ${EXPORTS_DIR}\n`)

  // Parse all files
  const chats: ParsedChat[] = []
  for (const file of files) {
    const raw = readFileSync(join(EXPORTS_DIR, file), 'utf-8')
    const parsed = parseWhatsAppExport(raw, file)
    chats.push(parsed)
    console.log(`  📄 ${file}: ${parsed.messages.length} messages (${parsed.contactName})`)
  }

  const totalMessages = chats.reduce((sum, c) => sum + c.messages.length, 0)
  console.log(`\n📊 Total: ${totalMessages} messages across ${chats.length} conversations`)

  if (DRY_RUN) {
    console.log('\n🏁 Dry run complete. Remove --dry-run to import.')
    return
  }

  // Import to Supabase
  console.log('\n📥 Importing to Supabase...')
  await importToSupabase(chats)

  // Analyze with GPT-4o
  if (!SKIP_ANALYSIS) {
    await analyzeConversations(chats)
  } else {
    console.log('\n⏭  Skipping GPT-4o analysis (--skip-analysis)')
  }

  console.log('\n✅ Done!')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
