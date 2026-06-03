import { createClient } from '@supabase/supabase-js'
import type { Lead, Conversation } from '@/types'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function upsertLead(phone: string): Promise<Lead> {
  const supabase = getSupabase()
  const { data: existing } = await supabase
    .from('leads')
    .select('*')
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('leads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('phone', phone)
    return { ...existing, last_message_at: new Date().toISOString() } as Lead
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({ phone })
    .select()
    .single()

  if (error) throw new Error(`upsertLead: ${error.message}`)
  return data as Lead
}

export async function updateLead(
  id: string,
  updates: Partial<Pick<Lead, 'stage' | 'name' | 'qualification_data' | 'project_interest' | 'last_message_at'>>
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(`updateLead: ${error.message}`)
}

export async function saveConversation(params: {
  leadId: string
  role: 'user' | 'assistant'
  content: string
  waMessageId?: string
}): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('conversations')
    .insert({
      lead_id: params.leadId,
      role: params.role,
      content: params.content,
      wa_message_id: params.waMessageId ?? null,
    })

  // Ignore unique constraint violation (duplicate message)
  if (error && !error.message.includes('unique') && !error.code?.includes('23505')) {
    throw new Error(`saveConversation: ${error.message}`)
  }
}

export async function getConversationHistory(leadId: string, limit = 15): Promise<Conversation[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })  // newest first to get the right LIMIT window
    .limit(limit)

  if (error) throw new Error(`getConversationHistory: ${error.message}`)
  // Reverse to chronological order (oldest→newest) for GPT-4o conversation context
  return ((data as Conversation[]) ?? []).reverse()
}

export async function isMessageProcessed(waMessageId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('wa_message_id', waMessageId)
    .maybeSingle()

  return data !== null
}

// Returns all user messages that haven't been answered yet — i.e., every user
// message created after the most recent assistant reply (or all if no reply exists).
// Used by the debounce logic to collect a burst of messages before responding.
export async function getUnprocessedUserMessages(leadId: string): Promise<Conversation[]> {
  const supabase = getSupabase()

  const { data: lastBot } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('lead_id', leadId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const base = supabase
    .from('conversations')
    .select('*')
    .eq('lead_id', leadId)
    .eq('role', 'user')
    .order('created_at', { ascending: true })

  const { data, error } = lastBot
    ? await base.gt('created_at', lastBot.created_at)
    : await base

  if (error) throw new Error(`getUnprocessedUserMessages: ${error.message}`)
  return (data as Conversation[]) ?? []
}
