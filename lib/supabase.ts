import { createClient } from '@supabase/supabase-js'
import type { Lead, Conversation, ConversationRole, DealSummary, DealSummaryRow } from '@/types'

export function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function upsertLead(phone: string): Promise<Lead> {
  const supabase = getServiceClient()
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

  // Carrera: dos mensajes simultáneos de un número nuevo — el segundo INSERT
  // choca con el unique de phone. Re-leemos la fila que ganó y seguimos.
  if (error) {
    if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('unique')) {
      const { data: winner } = await supabase
        .from('leads')
        .select('*')
        .eq('phone', phone)
        .maybeSingle()
      if (winner) return winner as Lead
    }
    throw new Error(`upsertLead: ${error.message}`)
  }
  return data as Lead
}

export async function updateLead(
  id: string,
  updates: Partial<Pick<Lead, 'stage' | 'name' | 'qualification_data' | 'project_interest' | 'last_message_at' | 'bot_active' | 'assigned_to' | 'opted_out' | 'last_proactive_at'>>
): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error(`updateLead: ${error.message}`)
}

export async function saveConversation(params: {
  leadId: string
  role: ConversationRole
  content: string
  waMessageId?: string
  sentBy?: string
}): Promise<{ duplicate: boolean }> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('conversations')
    .insert({
      lead_id: params.leadId,
      role: params.role,
      content: params.content,
      wa_message_id: params.waMessageId ?? null,
      sent_by: params.sentBy ?? null,
    })

  if (error) {
    // Violación del índice único en wa_message_id: entrega duplicada del
    // webhook (Meta reintenta). Lo reportamos para que el caller pueda
    // CORTAR el procesamiento — antes se ignoraba y el bot respondía doble.
    if (error.code?.includes('23505') || error.message.includes('unique') || error.message.includes('duplicate')) {
      return { duplicate: true }
    }
    throw new Error(`saveConversation: ${error.message}`)
  }
  return { duplicate: false }
}

export async function getConversationHistory(leadId: string, limit = 15): Promise<Conversation[]> {
  const supabase = getServiceClient()
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
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('wa_message_id', waMessageId)
    .maybeSingle()

  return data !== null
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getLeadById: ${error.message}`)
  return (data as Lead) ?? null
}

export async function getLatestUserMessageAt(leadId: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('lead_id', leadId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`getLatestUserMessageAt: ${error.message}`)
  const rows = (data as { created_at: string }[]) ?? []
  return rows[0]?.created_at ?? null
}

// Returns all user messages that haven't been answered yet — i.e., every user
// message created after the most recent assistant reply (or all if no reply exists).
// Used by the debounce logic to collect a burst of messages before responding.
export async function upsertDealSummary(leadId: string, deal: DealSummary): Promise<void> {
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('deal_summaries')
    .upsert({
      lead_id: leadId,
      summary: deal.summary,
      signals: deal.signals,
      next_action: deal.next_action,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lead_id' })
  if (error) throw new Error(`upsertDealSummary: ${error.message}`)
}

export async function getDealSummary(leadId: string): Promise<DealSummaryRow | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('deal_summaries')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()
  if (error) throw new Error(`getDealSummary: ${error.message}`)
  return (data as DealSummaryRow) ?? null
}

export async function getUnprocessedUserMessages(leadId: string): Promise<Conversation[]> {
  const supabase = getServiceClient()

  // Una respuesta humana (panel) también cuenta como "ya respondido"
  const { data: lastBot } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('lead_id', leadId)
    .in('role', ['assistant', 'human'])
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
