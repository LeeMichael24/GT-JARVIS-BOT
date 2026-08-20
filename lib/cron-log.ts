import { getServiceClient } from '@/lib/supabase'
import type { CronRun } from '@/types'

/**
 * Historial de corridas de crons (tabla `cron_runs`) — la observabilidad
 * que el panel muestra en el tab Estado. 100% fail-safe: si la tabla no
 * existe o la escritura falla, el cron sigue como si nada (el registro
 * es un extra, nunca un requisito).
 */

export async function recordCronRun(
  job: string,
  startedAt: Date,
  status: 'ok' | 'error',
  result: unknown,
  error?: string,
): Promise<void> {
  try {
    const { error: dbError } = await getServiceClient().from('cron_runs').insert({
      job,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      status,
      result: result ?? {},
      error: error ?? null,
    })
    if (dbError) console.warn('[cron-log] Failed to record run:', dbError.message)
  } catch (e) {
    console.warn('[cron-log] Failed to record run:', e instanceof Error ? e.message : e)
  }
}

/** Últimas corridas para el panel (fail-safe: sin tabla → []). */
export async function getRecentCronRuns(limit = 30): Promise<CronRun[]> {
  try {
    const { data, error } = await getServiceClient()
      .from('cron_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.warn('[cron-log] Failed to fetch runs:', error.message)
      return []
    }
    return (data as CronRun[]) ?? []
  } catch {
    return []
  }
}
