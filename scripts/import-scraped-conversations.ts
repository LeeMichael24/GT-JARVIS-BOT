import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import OpenAI from 'openai'

function loadEnv(filePath: string) {
  if (!existsSync(filePath)) return
  const content = readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let val = trimmed.slice(eqIndex + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    else {
      const commentIdx = val.indexOf('#')
      if (commentIdx > 0) val = val.slice(0, commentIdx).trim()
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv(join(__dirname, '..', '.env.local'))
loadEnv(join(__dirname, '..', '.env'))

const JSON_PATH = join(__dirname, '..', 'data', 'whatsapp-exports', 'scraped-conversations.json')

interface ScrapedMessage {
  role: 'user' | 'human'
  content: string
  timestamp: string
}

interface ScrapedConversation {
  contactName: string
  contactPhone: string
  labels: string[]
  messages: ScrapedMessage[]
}

async function main() {
  console.log('=== Import Scraped WhatsApp Conversations ===\n')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const conversations: ScrapedConversation[] = JSON.parse(readFileSync(JSON_PATH, 'utf-8'))

  console.log(`Found ${conversations.length} conversations to import\n`)

  let totalMessages = 0
  let leadsCreated = 0

  for (const conv of conversations) {
    const phone = conv.contactPhone.replace(/[^\d+]/g, '')
    const textMessages = conv.messages.filter(m => !m.content.startsWith('['))

    console.log(`--- ${conv.contactName} (${phone}) ---`)
    console.log(`  Labels: ${conv.labels.join(', ')}`)
    console.log(`  Messages: ${conv.messages.length} total, ${textMessages.length} text`)

    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, name')
      .eq('phone', phone)
      .maybeSingle()

    let leadId: string

    if (existingLead) {
      leadId = existingLead.id
      console.log(`  Lead exists: ${leadId}`)
      if (!existingLead.name && conv.contactName && !/^\d+$/.test(conv.contactName)) {
        await supabase.from('leads').update({ name: conv.contactName }).eq('id', leadId)
      }
    } else {
      const name = /^\d+$/.test(conv.contactName) ? null : conv.contactName
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          phone,
          name,
          stage: conv.labels.includes('Important') ? 'qualified' : 'new',
          first_message_at: conv.messages[0].timestamp,
          last_message_at: conv.messages[conv.messages.length - 1].timestamp,
        })
        .select('id')
        .single()

      if (error) {
        console.error(`  Failed to create lead: ${error.message}`)
        continue
      }
      leadId = newLead.id
      leadsCreated++
      console.log(`  Lead created: ${leadId}`)
    }

    let imported = 0
    for (const msg of conv.messages) {
      const { error } = await supabase.from('conversations').insert({
        lead_id: leadId,
        role: msg.role === 'human' ? 'assistant' : 'user',
        content: msg.content,
        wa_message_id: `scraped_${phone}_${new Date(msg.timestamp).getTime()}`,
        created_at: msg.timestamp,
      })

      if (error) {
        if (error.code === '23505') continue
        console.error(`  Message error: ${error.message}`)
      } else {
        imported++
      }
    }

    totalMessages += imported
    console.log(`  Imported: ${imported} messages\n`)
  }

  console.log(`\nTotal: ${totalMessages} messages, ${leadsCreated} new leads\n`)

  // GPT-4o analysis
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.log('No OPENAI_API_KEY — skipping agent_brain analysis')
    return
  }

  console.log('=== Analyzing with GPT-4o for agent_brain patterns ===\n')

  const openai = new OpenAI({ apiKey: openaiKey })

  const allText = conversations.map(conv => {
    const msgs = conv.messages
      .filter(m => !m.content.startsWith('['))
      .map(m => `[${m.role === 'user' ? 'CLIENTE' : 'EQUIPO'}] ${m.content}`)
      .join('\n')
    return `--- ${conv.contactName} (${conv.labels.join(', ')}) ---\n${msgs}`
  }).join('\n\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Eres un analista experto de ventas inmobiliarias de lujo para Grupo Terranova en El Salvador (proyecto Portacelli en Nuevo Cuscatlan).

Analiza estas conversaciones REALES de WhatsApp Business con clientes que tienen la etiqueta "Important" (ventas exitosas o prospectos calificados). Tu objetivo es extraer patrones que un agente de IA llamado "Daniela" pueda aprender para replicar el estilo de ventas del equipo humano.

Extrae patrones en estas categorias:
- "pattern": tecnica de ventas que funciona (como manejan objeciones, cierres, follow-ups)
- "observation": comportamiento del cliente que se repite
- "correction": algo que el equipo hace diferente a lo estandar y funciona
- "metric": dato cuantitativo relevante
- "voice": tono y estilo de comunicacion (como se expresan, formalidad, emojis, longitud)
- "process": pasos del proceso de venta que se evidencian

IMPORTANTE - Enfocate en:
1. Como se EXPRESA el equipo (tono, vocabulario, formalidad)
2. Cuando envian multimedia vs solo texto
3. Como manejan tiempos de respuesta
4. Como dan seguimiento sin ser invasivos
5. Como presentan informacion tecnica de forma accesible
6. Que info piden al cliente y en que orden
7. Como manejan la parte legal/documental
8. Perfil del cliente exitoso

Responde en JSON:
{
  "patterns": [
    { "topic": "tema corto", "content": "descripcion accionable para Daniela", "category": "pattern|observation|correction|metric|voice|process" }
  ],
  "client_profile": {
    "summary": "perfil del cliente ideal basado en estas conversaciones",
    "key_traits": ["trait1", "trait2"]
  }
}

Maximo 20 patrones. Todo en espanol.`
      },
      { role: 'user', content: allText }
    ],
  })

  try {
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
      if (error) {
        console.error('Failed to save patterns:', error.message)
      } else {
        console.log(`Saved ${rows.length} patterns to agent_brain (source: team, confidence: 0.85)`)
      }
    }

    if (result.client_profile) {
      console.log('\n=== Client Profile ===')
      console.log(result.client_profile.summary)
      console.log('Key traits:', result.client_profile.key_traits?.join(', '))

      const { error } = await supabase.from('agent_brain').insert({
        category: 'observation',
        topic: 'Perfil de cliente exitoso',
        content: `${result.client_profile.summary}. Rasgos clave: ${result.client_profile.key_traits?.join(', ')}`,
        source: 'team',
        confidence: 0.90,
        active: true,
      })
      if (error) console.error('Failed to save profile:', error.message)
      else console.log('Saved client profile to agent_brain')
    }
  } catch (e) {
    console.error('Failed to parse GPT-4o response:', e)
  }

  console.log('\nDone!')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
