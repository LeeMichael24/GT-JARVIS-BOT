/**
 * Fetch ALL WhatsApp conversations from Meta Business Suite via Graph API
 * and import them into Supabase + analyze with GPT-4o for agent_brain.
 *
 * Usage:
 *   npx tsx scripts/fetch-whatsapp-history.ts
 *   npx tsx scripts/fetch-whatsapp-history.ts --dry-run       # preview only
 *   npx tsx scripts/fetch-whatsapp-history.ts --skip-analysis  # no GPT-4o
 *
 * Requires: WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, SUPABASE_URL,
 *           SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY (for analysis)
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { join } from 'path'
import OpenAI from 'openai'

// ── Config ─────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_ANALYSIS = process.argv.includes('--skip-analysis')
const GRAPH_API = 'https://graph.facebook.com/v19.0'
const TOKEN = process.env.WA_ACCESS_TOKEN!
const PHONE_ID = process.env.WA_PHONE_NUMBER_ID!

// Known business senders — messages from these are role: 'human' (team)
const BUSINESS_NAMES = [
  'grupo terranova', 'daniela', 'kenia', 'mike fuentes',
  'michael narvaez', 'mike narvaez', 'gt bot',
]

// ── Types ──────────────────────────────────────────────────────

interface GraphConversation {
  id: string
  name?: string
  updated_time?: string
  senders?: { data: Array<{ id: string; name: string; email?: string }> }
}

interface GraphMessage {
  id: string
  message?: string
  from?: { id: string; name: string }
  to?: { data: Array<{ id: string; name: string }> }
  created_time: string
  type?: string
}

interface ExtractedChat {
  contactId: string
  contactName: string
  contactPhone: string
  messages: Array<{
    content: string
    role: 'user' | 'human'
    sender: string
    timestamp: Date
  }>
}

// ── Graph API helpers ──────────────────────────────────────────

async function graphGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH_API}${path}`)
  url.searchParams.set('access_token', TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph API ${res.status}: ${err}`)
  }
  return res.json() as Promise<T>
}

async function graphGetAll<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const items: T[] = []
  let url: string | null = `${GRAPH_API}${path}`
  const urlObj = new URL(url)
  urlObj.searchParams.set('access_token', TOKEN)
  for (const [k, v] of Object.entries(params)) urlObj.searchParams.set(k, v)
  url = urlObj.toString()

  while (url) {
    const res = await fetch(url)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Graph API ${res.status}: ${err}`)
    }
    const json = await res.json() as { data: T[]; paging?: { next?: string } }
    items.push(...json.data)
    url = json.paging?.next ?? null
    if (items.length % 100 === 0 && items.length > 0) {
      process.stdout.write(`  ... fetched ${items.length} items\r`)
    }
  }
  return items
}

// ── Step 1: Discover WABA ID and connected assets ──────────────

async function getWhatsAppBusinessAccountId(): Promise<string> {
  // Get the WABA ID from the phone number
  const phoneInfo = await graphGet<{ id: string; name?: string; whatsapp_business_account?: { id: string } }>(
    `/${PHONE_ID}`,
    { fields: 'id,name,whatsapp_business_account' }
  )

  if (phoneInfo.whatsapp_business_account?.id) {
    return phoneInfo.whatsapp_business_account.id
  }

  throw new Error('Could not determine WhatsApp Business Account ID from phone number')
}

// ── Step 2: Fetch conversations ────────────────────────────────

async function fetchConversations(wabaId: string): Promise<GraphConversation[]> {
  console.log('\n📨 Fetching conversations...')

  // Try the WABA conversations endpoint first
  try {
    const convos = await graphGetAll<GraphConversation>(
      `/${wabaId}/conversations`,
      { fields: 'id,name,updated_time,senders' }
    )
    if (convos.length > 0) {
      console.log(`  Found ${convos.length} conversations via WABA endpoint`)
      return convos
    }
  } catch (err) {
    console.log(`  WABA conversations endpoint: ${err instanceof Error ? err.message : err}`)
  }

  // Try the phone number conversations endpoint
  try {
    const convos = await graphGetAll<GraphConversation>(
      `/${PHONE_ID}/conversations`,
      { fields: 'id,name,updated_time,senders' }
    )
    if (convos.length > 0) {
      console.log(`  Found ${convos.length} conversations via phone endpoint`)
      return convos
    }
  } catch (err) {
    console.log(`  Phone conversations endpoint: ${err instanceof Error ? err.message : err}`)
  }

  return []
}

// ── Step 3: Fetch messages for each conversation ───────────────

async function fetchMessagesForConversation(convoId: string): Promise<GraphMessage[]> {
  try {
    return await graphGetAll<GraphMessage>(
      `/${convoId}/messages`,
      { fields: 'id,message,from,to,created_time,type', limit: '100' }
    )
  } catch {
    return []
  }
}

// ── Step 4: Alternative — use the phone number messages endpoint

async function fetchRecentMessages(): Promise<GraphMessage[]> {
  console.log('\n📨 Trying direct messages endpoint...')
  try {
    const msgs = await graphGetAll<GraphMessage>(
      `/${PHONE_ID}/messages`,
      { fields: 'id,message,from,to,created_time,type' }
    )
    console.log(`  Found ${msgs.length} messages`)
    return msgs
  } catch (err) {
    console.log(`  Messages endpoint: ${err instanceof Error ? err.message : err}`)
    return []
  }
}

// ── Step 5: Alternative — Page Conversations API ───────────────

async function fetchPageConversations(): Promise<ExtractedChat[]> {
  console.log('\n📨 Trying Page Conversations API (Meta Business Suite sync)...')

  // First get the page ID associated with this business
  let pageId: string | null = null

  try {
    const me = await graphGet<{ id: string; name?: string }>('/me', { fields: 'id,name' })
    console.log(`  Authenticated as: ${me.name ?? me.id}`)

    // Try to get pages
    const pages = await graphGetAll<{ id: string; name: string; access_token?: string }>(
      '/me/accounts',
      { fields: 'id,name,access_token' }
    )

    if (pages.length > 0) {
      console.log(`  Found ${pages.length} page(s):`)
      for (const p of pages) console.log(`    - ${p.name} (${p.id})`)
      pageId = pages[0].id
    }
  } catch (err) {
    console.log(`  Auth/pages: ${err instanceof Error ? err.message : err}`)
  }

  if (!pageId) return []

  // Get conversations from the page
  try {
    const convos = await graphGetAll<GraphConversation>(
      `/${pageId}/conversations`,
      { fields: 'id,name,updated_time,senders', platform: 'whatsapp' }
    )

    console.log(`  Found ${convos.length} page conversation(s)`)

    const chats: ExtractedChat[] = []

    for (const convo of convos) {
      const messages = await fetchMessagesForConversation(convo.id)
      if (messages.length === 0) continue

      const contactSender = convo.senders?.data?.[0]
      const chat: ExtractedChat = {
        contactId: contactSender?.id ?? convo.id,
        contactName: contactSender?.name ?? convo.name ?? 'Unknown',
        contactPhone: contactSender?.id ?? '',
        messages: messages
          .filter(m => m.message)
          .map(m => ({
            content: m.message!,
            role: isBusinessSender(m.from?.name ?? '') ? 'human' as const : 'user' as const,
            sender: m.from?.name ?? 'Unknown',
            timestamp: new Date(m.created_time),
          })),
      }

      if (chat.messages.length > 0) {
        chats.push(chat)
        process.stdout.write(`  ✓ ${chat.contactName}: ${chat.messages.length} messages\n`)
      }
    }

    return chats
  } catch (err) {
    console.log(`  Page conversations: ${err instanceof Error ? err.message : err}`)
    return []
  }
}

function isBusinessSender(name: string): boolean {
  const lower = name.toLowerCase()
  return BUSINESS_NAMES.some(bn => lower.includes(bn))
}

// ── Import to Supabase ─────────────────────────────────────────

async function importChats(chats: ExtractedChat[]): Promise<void> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  let totalImported = 0
  let leadsCreated = 0

  for (const chat of chats) {
    const phone = chat.contactPhone.replace(/\D/g, '')
    if (!phone) continue

    // Find or create lead
    const { data: existing } = await supabase
      .from('leads').select('id, name').eq('phone', phone).maybeSingle()

    let leadId: string
    if (existing) {
      leadId = existing.id
      if (!existing.name && chat.contactName && !/^\d+$/.test(chat.contactName)) {
        await supabase.from('leads').update({ name: chat.contactName }).eq('id', leadId)
      }
    } else {
      const name = /^\d+$/.test(chat.contactName) ? null : chat.contactName
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          phone, name, stage: 'new',
          first_message_at: chat.messages[0]?.timestamp.toISOString(),
          last_message_at: chat.messages[chat.messages.length - 1]?.timestamp.toISOString(),
        })
        .select('id').single()
      if (error) { console.error(`  ✗ Lead ${phone}: ${error.message}`); continue }
      leadId = newLead.id
      leadsCreated++
    }

    // Import messages in batches
    let imported = 0
    const batchSize = 50
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
        for (const row of batch) {
          const { error: e } = await supabase.from('conversations').insert(row)
          if (!e) imported++
        }
      } else {
        imported += batch.length
      }
    }
    totalImported += imported
  }

  console.log(`\n📊 Imported: ${totalImported} messages, ${leadsCreated} new leads`)
}

// ── GPT-4o analysis ────────────────────────────────────────────

async function analyzeChats(chats: ExtractedChat[]): Promise<void> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const substantial = chats.filter(c => c.messages.length >= 10)
  if (substantial.length === 0) { console.log('\n⏭  No substantial chats for analysis'); return }

  console.log(`\n🧠 Analyzing ${substantial.length} conversations for patterns...`)
  let totalPatterns = 0

  for (let i = 0; i < substantial.length; i += 5) {
    const chunk = substantial.slice(i, i + 5)
    const text = chunk.map(c => {
      const msgs = c.messages.map(m => `[${m.role === 'user' ? 'CLIENTE' : 'EQUIPO'}] ${m.content}`).join('\n')
      return `--- ${c.contactName} (${c.messages.length} msgs) ---\n${msgs}`
    }).join('\n\n')

    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `Analiza conversaciones de ventas de bienes raíces de lujo (Grupo Terranova, El Salvador).
Extrae PATRONES ACCIONABLES para entrenar un agente de IA (Daniela SDR).

Responde JSON: { "patterns": [{ "topic": "tema", "content": "qué debe hacer Daniela", "category": "pattern|observation|correction|metric" }] }

- pattern: técnica de ventas que funciona
- observation: comportamiento del cliente que se repite
- correction: el equipo hace algo diferente al script y funciona
- metric: dato cuantitativo

Máximo 15 patrones. En español. Solo patrones accionables.`
      }, { role: 'user', content: text }],
    })

    try {
      const result = JSON.parse(res.choices[0].message.content ?? '{}')
      if (result.patterns?.length) {
        const rows = result.patterns.map((p: { category: string; topic: string; content: string }) => ({
          category: p.category, topic: p.topic, content: p.content,
          source: 'team', confidence: 0.85, active: true,
        }))
        const { error } = await supabase.from('agent_brain').insert(rows)
        if (!error) { totalPatterns += rows.length; console.log(`  ✓ Batch ${Math.floor(i/5)+1}: ${rows.length} patterns`) }
      }
    } catch { console.warn(`  ⚠ Batch ${Math.floor(i/5)+1} analysis failed`) }
  }

  console.log(`\n🧠 Total: ${totalPatterns} patterns → agent_brain`)
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('📱 WhatsApp History Fetcher — Automated via Graph API')
  console.log('═'.repeat(55))

  if (!TOKEN || !PHONE_ID) {
    console.error('✗ Missing WA_ACCESS_TOKEN or WA_PHONE_NUMBER_ID')
    process.exit(1)
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('✗ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  let allChats: ExtractedChat[] = []

  // Strategy 1: WABA / Phone conversations endpoint
  try {
    const wabaId = await getWhatsAppBusinessAccountId()
    console.log(`\n✓ WABA ID: ${wabaId}`)

    const convos = await fetchConversations(wabaId)
    if (convos.length > 0) {
      console.log(`\n📩 Fetching messages for ${convos.length} conversations...`)
      for (const convo of convos) {
        const msgs = await fetchMessagesForConversation(convo.id)
        if (msgs.length === 0) continue

        const sender = convo.senders?.data?.[0]
        allChats.push({
          contactId: sender?.id ?? convo.id,
          contactName: sender?.name ?? convo.name ?? 'Unknown',
          contactPhone: sender?.id ?? '',
          messages: msgs.filter(m => m.message).map(m => ({
            content: m.message!,
            role: isBusinessSender(m.from?.name ?? '') ? 'human' as const : 'user' as const,
            sender: m.from?.name ?? 'Unknown',
            timestamp: new Date(m.created_time),
          })),
        })
      }
    }
  } catch (err) {
    console.log(`\n⚠ WABA approach: ${err instanceof Error ? err.message : err}`)
  }

  // Strategy 2: Direct messages endpoint
  if (allChats.length === 0) {
    const msgs = await fetchRecentMessages()
    if (msgs.length > 0) {
      // Group messages by sender
      const byContact = new Map<string, GraphMessage[]>()
      for (const m of msgs) {
        const key = m.from?.id ?? 'unknown'
        if (!byContact.has(key)) byContact.set(key, [])
        byContact.get(key)!.push(m)
      }

      for (const [contactId, contactMsgs] of byContact) {
        const name = contactMsgs[0]?.from?.name ?? contactId
        allChats.push({
          contactId, contactName: name, contactPhone: contactId,
          messages: contactMsgs.filter(m => m.message).map(m => ({
            content: m.message!,
            role: isBusinessSender(m.from?.name ?? '') ? 'human' as const : 'user' as const,
            sender: m.from?.name ?? 'Unknown',
            timestamp: new Date(m.created_time),
          })),
        })
      }
    }
  }

  // Strategy 3: Page Conversations API
  if (allChats.length === 0) {
    allChats = await fetchPageConversations()
  }

  // Report results
  if (allChats.length === 0) {
    console.log('\n⚠ No conversations found via API. Falling back to browser scrape approach...')
    console.log('  The Graph API may not expose WhatsApp message history.')
    console.log('  Alternative: use scripts/import-whatsapp.ts with .txt exports')
    console.log('  Or re-run with the browser connected to scrape Meta Business Suite')
    process.exit(0)
  }

  const totalMsgs = allChats.reduce((s, c) => s + c.messages.length, 0)
  console.log(`\n✅ Extracted ${totalMsgs} messages across ${allChats.length} conversations`)

  // Save raw data to file for backup
  const backupPath = join(__dirname, '..', 'data', 'whatsapp-exports', 'api-export.json')
  writeFileSync(backupPath, JSON.stringify(allChats, null, 2))
  console.log(`\n💾 Backup saved to ${backupPath}`)

  if (DRY_RUN) {
    for (const c of allChats) console.log(`  ${c.contactName}: ${c.messages.length} msgs`)
    console.log('\n🏁 Dry run. Remove --dry-run to import.')
    return
  }

  // Import to Supabase
  console.log('\n📥 Importing to Supabase...')
  await importChats(allChats)

  // Analyze with GPT-4o
  if (!SKIP_ANALYSIS) {
    await analyzeChats(allChats)
  }

  console.log('\n✅ Done!')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
