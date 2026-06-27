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
  post_conversation: {
    description: 'Follow up after conversation with no response',
    steps: [
      { delay_hours: 24, purpose: 'gentle_reminder' },
      { delay_hours: 72, purpose: 'add_value' },
      { delay_hours: 168, purpose: 'last_chance' },
    ],
  },
  nurture: {
    description: 'Nurture warm lead with relevant info',
    steps: [
      { delay_hours: 48, purpose: 'share_details' },
      { delay_hours: 120, purpose: 'social_proof' },
      { delay_hours: 240, purpose: 'check_in' },
    ],
  },
  hot_close: {
    description: 'Push hot lead to close',
    steps: [
      { delay_hours: 4, purpose: 'send_details' },
      { delay_hours: 24, purpose: 'create_urgency' },
      { delay_hours: 48, purpose: 'offer_meeting' },
    ],
  },
  cold_reactivation: {
    description: 'Re-engage cold leads monthly',
    steps: [
      { delay_hours: 720, purpose: 'new_offer' },
      { delay_hours: 1440, purpose: 'market_update' },
    ],
  },
}

const SV_OFFSET_HOURS = -6

export function isWithinBusinessHours(date: Date): boolean {
  const utcHour = date.getUTCHours()
  const svHour = (utcHour + 24 + SV_OFFSET_HOURS) % 24
  return svHour >= 8 && svHour < 18
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
