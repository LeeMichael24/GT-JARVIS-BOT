import { getServiceClient } from '@/lib/supabase'
import type { Sequence, SequenceType } from '@/types'

export interface SequenceStepDef {
  delay_hours: number
  purpose: string
}

export interface SequenceDef {
  description: string
  steps: SequenceStepDef[]
}

export const SEQUENCE_DEFINITIONS: Record<SequenceType, SequenceDef> = {
  // Cadencia "hasta el no": se insiste más toques y más lejos; el ciclo lo
  // corta un opt-out explícito (cancelSequencesForLead) o agotar los pasos.
  post_conversation: {
    description: 'Follow up after conversation with no response',
    steps: [
      { delay_hours: 24, purpose: 'gentle_reminder' },
      { delay_hours: 72, purpose: 'add_value' },
      { delay_hours: 168, purpose: 'last_chance' },
      { delay_hours: 336, purpose: 'new_angle' },
      { delay_hours: 720, purpose: 'final_goodbye' },
    ],
  },
  nurture: {
    description: 'Nurture warm lead with relevant info',
    steps: [
      { delay_hours: 48, purpose: 'share_details' },
      { delay_hours: 120, purpose: 'social_proof' },
      { delay_hours: 240, purpose: 'check_in' },
      { delay_hours: 480, purpose: 'market_update' },
    ],
  },
  hot_close: {
    description: 'Push hot lead to close',
    steps: [
      { delay_hours: 4, purpose: 'send_details' },
      { delay_hours: 24, purpose: 'create_urgency' },
      { delay_hours: 48, purpose: 'offer_meeting' },
      { delay_hours: 96, purpose: 'last_push' },
    ],
  },
  cold_reactivation: {
    description: 'Re-engage cold leads monthly',
    steps: [
      { delay_hours: 720, purpose: 'new_offer' },
      { delay_hours: 1440, purpose: 'market_update' },
      { delay_hours: 2160, purpose: 'final_check' },
    ],
  },
}

/**
 * Red de seguridad: el modelo a veces no pide follow_up_needed y el lead
 * silencioso queda sin seguimiento para siempre. El cron diario crea la
 * secuencia base para todo lead activo callado >24h sin secuencia activa.
 */
export async function ensureFollowUpsForSilentLeads(now: Date): Promise<number> {
  const supabase = getServiceClient()
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('leads')
    .select('id, stage, sequences(status)')
    .eq('bot_active', true)
    .eq('opted_out', false)
    .in('stage', ['new', 'warm', 'hot'])
    .not('phone', 'like', 'n_%')
    .lt('last_message_at', cutoff)
  if (error) {
    console.warn('[sequences] ensureFollowUps no pudo leer leads:', error.message)
    return 0
  }
  type Row = { id: string; stage: string; sequences: { status: string }[] | null }
  const sinSecuencia = ((data ?? []) as Row[]).filter(
    l => !(l.sequences ?? []).some(s => s.status === 'active'),
  )
  let creadas = 0
  for (const l of sinSecuencia) {
    try {
      const tipo = l.stage === 'hot' ? ('hot_close' as const) : ('post_conversation' as const)
      await createSequence(l.id, tipo, { origin: 'safety_net_daily' })
      creadas++
    } catch (err) {
      console.warn('[sequences] ensureFollowUps falló para', l.id, err instanceof Error ? err.message : err)
    }
  }
  return creadas
}

/** El "no" explícito apaga TODO el seguimiento pendiente del lead. */
export async function cancelSequencesForLead(leadId: string): Promise<void> {
  const { error } = await getServiceClient()
    .from('sequences')
    .update({ status: 'cancelled' })
    .eq('lead_id', leadId)
    .eq('status', 'active')
  if (error) console.warn('[sequences] No se pudieron cancelar:', error.message)
}

const SV_OFFSET_HOURS = -6

// Horario laboral configurable desde el panel (agent_settings:
// business_hours_start / business_hours_end). Defaults 8-18 El Salvador.
export function isWithinBusinessHours(date: Date, startHour = 8, endHour = 18): boolean {
  const utcHour = date.getUTCHours()
  const svHour = (utcHour + 24 + SV_OFFSET_HOURS) % 24
  return svHour >= startHour && svHour < endHour
}

export function getNextFireAt(from: Date, delayHours: number): string {
  return new Date(from.getTime() + delayHours * 60 * 60 * 1000).toISOString()
}

export async function createSequence(
  leadId: string,
  type: SequenceType,
  context: Record<string, unknown>,
): Promise<void> {
  const def = SEQUENCE_DEFINITIONS[type]
  if (!def) return
  const supabase = getServiceClient()
  const nextFire = getNextFireAt(new Date(), def.steps[0].delay_hours)
  const { error } = await supabase
    .from('sequences')
    .upsert({
      lead_id: leadId,
      sequence_type: type,
      current_step: 0,
      status: 'active',
      context,
      next_fire_at: nextFire,
    }, { onConflict: 'lead_id,sequence_type' })
  if (error && !error.message.includes('unique') && !error.code?.includes('23505')) {
    throw new Error(`createSequence: ${error.message}`)
  }
}

export async function getDueSequences(now: Date): Promise<Sequence[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('sequences')
    .select('*')
    .eq('status', 'active')
    .lte('next_fire_at', now.toISOString())
    .order('next_fire_at', { ascending: true })
    .limit(20)
  if (error) throw new Error(`getDueSequences: ${error.message}`)
  return (data as Sequence[]) ?? []
}

export async function advanceSequence(
  id: string,
  sequenceType: SequenceType,
  currentStep: number,
): Promise<'advanced' | 'completed'> {
  const def = SEQUENCE_DEFINITIONS[sequenceType]
  const nextStep = currentStep + 1
  const supabase = getServiceClient()

  if (nextStep >= def.steps.length) {
    await supabase
      .from('sequences')
      .update({ status: 'completed', last_fired_at: new Date().toISOString() })
      .eq('id', id)
    return 'completed'
  }

  const nextFire = getNextFireAt(new Date(), def.steps[nextStep].delay_hours)
  await supabase
    .from('sequences')
    .update({
      current_step: nextStep,
      next_fire_at: nextFire,
      last_fired_at: new Date().toISOString(),
    })
    .eq('id', id)
  return 'advanced'
}

export async function pauseLeadSequences(leadId: string): Promise<number> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('sequences')
    .update({ status: 'paused' })
    .eq('lead_id', leadId)
    .eq('status', 'active')
    .select('id')
  if (error) throw new Error(`pauseLeadSequences: ${error.message}`)
  return data?.length ?? 0
}
