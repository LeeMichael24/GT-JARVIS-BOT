import { getServiceClient } from '@/lib/supabase'
import type { ActivityLogEntry, ActorType } from '@/types'

export async function logActivity(params: {
  actorId?: string | null
  actorType?: ActorType
  action: string
  entityType: string
  entityId?: string | null
  details?: Record<string, unknown>
}): Promise<void> {
  const { error } = await getServiceClient()
    .from('activity_log')
    .insert({
      actor_id: params.actorId ?? null,
      actor_type: params.actorType ?? 'system',
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      details: params.details ?? {},
    })

  if (error) console.warn(`[activity-log] Failed to log: ${error.message}`)
}

export async function getRecentActivity(limit = 50): Promise<ActivityLogEntry[]> {
  const { data, error } = await getServiceClient()
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`getRecentActivity: ${error.message}`)
  return (data ?? []) as ActivityLogEntry[]
}
