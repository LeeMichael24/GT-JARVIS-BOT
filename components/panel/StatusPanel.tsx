'use client'

import { useState, useTransition } from 'react'
import { setAgentEnabled, runCronJobNow, type ManualJob, type SupervisionData } from '@/app/panel/actions'

const JOB_LABELS: { job: ManualJob; label: string; hint: string }[] = [
  { job: 'reflection', label: '🧠 Reflexionar ahora', hint: 'Analiza las conversaciones de las últimas 24h y extrae aprendizajes (no espera al cron nocturno)' },
  { job: 'radar', label: '📡 Radar de oportunidades', hint: 'Busca listings nuevos y propone campañas (requieren tu aprobación en Campañas)' },
  { job: 'recontact', label: '🔁 Reglas de recontacto', hint: 'Evalúa las reglas de recontacto y propone campañas' },
  { job: 'metrics', label: '📊 Agregar métricas', hint: 'Calcula las métricas de ayer para el dashboard' },
  { job: 'media_sync', label: '🖼️ Sincronizar media', hint: 'Trae media nueva del Ecosistema Terranova' },
]

const JOB_NAMES: Record<string, string> = {
  daily: 'Diario (radar + métricas + reflexión)',
  sequences: 'Secuencias de seguimiento',
  weekly: 'Reporte semanal',
  'manual:reflection': 'Reflexión (manual)',
  'manual:radar': 'Radar (manual)',
  'manual:recontact': 'Recontacto (manual)',
  'manual:metrics': 'Métricas (manual)',
  'manual:media_sync': 'Media sync (manual)',
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `hace ${hours}h`
  return `hace ${Math.round(hours / 24)}d`
}

const ACTION_LABELS: Record<string, string> = {
  agent_paused: '⏸️ Daniela PAUSADA globalmente',
  agent_resumed: '▶️ Daniela reactivada',
  stage_change: 'Cambio de etapa',
  meeting_scheduled: '📅 Cita agendada',
  escalate_ceo: '🚨 Escalación al CEO',
  consult_team: 'Consulta al equipo',
  lead_from_ad: 'Lead desde anuncio',
  training_imported: '🎓 Entrenamiento importado',
  manual_job_run: 'Trabajo manual ejecutado',
  prompt_block_updated: '✏️ Personalidad editada',
  prompt_block_reset: 'Personalidad restaurada',
}

export function StatusPanel({ data }: { data: SupervisionData }) {
  const [enabled, setEnabled] = useState(data.agentEnabled)
  const [isPending, startTransition] = useTransition()
  const [jobRunning, setJobRunning] = useState<ManualJob | null>(null)
  const [jobMsg, setJobMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !enabled
    if (!next && !window.confirm('¿Pausar a Daniela GLOBALMENTE? Dejará de responder a TODOS los leads y se detendrán los seguimientos automáticos. Los mensajes entrantes se seguirán guardando en el inbox.')) return
    setError(null)
    setEnabled(next)
    startTransition(async () => {
      const res = await setAgentEnabled(next)
      if (!res.ok) {
        setEnabled(!next)
        setError(res.error === 'FORBIDDEN' ? 'Solo admins pueden pausar a Daniela' : 'Error al cambiar el estado. ¿Corriste la migración 012?')
      }
    })
  }

  function handleRunJob(job: ManualJob) {
    setJobRunning(job)
    setJobMsg(null)
    setError(null)
    startTransition(async () => {
      const res = await runCronJobNow(job)
      setJobRunning(null)
      if (res.ok) {
        setJobMsg(`✓ ${JOB_LABELS.find(j => j.job === job)?.label.replace(/^\S+\s/, '')} — completado. Recarga para ver la corrida abajo.`)
      } else {
        setError(res.error === 'AGENT_PAUSED' ? 'Daniela está pausada — reactívala primero' : `Error al ejecutar: ${res.error}`)
      }
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
      {/* ── Interruptor global ── */}
      <div className={`rounded-xl border p-4 ${enabled ? 'border-emerald-900/60 bg-emerald-950/20' : 'border-red-900/60 bg-red-950/30'}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white">
              {enabled ? '🟢 Daniela está ACTIVA' : '🔴 Daniela está PAUSADA'}
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              {enabled
                ? 'Responde mensajes, envía seguimientos y propone campañas.'
                : 'No responde a nadie. Los mensajes entrantes se guardan en el inbox para atención humana.'}
            </p>
            {!data.settingsTableReady && (
              <p className="mt-1 text-xs text-amber-400">⚠️ Corre la migración 012 en Supabase para activar este interruptor.</p>
            )}
          </div>
          <button
            onClick={handleToggle}
            disabled={isPending || !data.settingsTableReady}
            className={`shrink-0 rounded-lg px-5 py-3 text-sm font-bold text-white transition-colors disabled:opacity-40 ${
              enabled ? 'bg-red-700 hover:bg-red-600' : 'bg-emerald-700 hover:bg-emerald-600'
            }`}
          >
            {isPending ? '…' : enabled ? '⏸️ Pausar TODO' : '▶️ Reactivar'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">
          El cambio aplica en máximo 1 minuto. La pausa por lead individual sigue disponible en cada chat.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300">{error}</p>}
      {jobMsg && <p className="rounded-lg bg-emerald-950 px-3 py-2 text-xs text-emerald-300">{jobMsg}</p>}

      {/* ── Aprendizajes pendientes ── */}
      {data.pendingLearnings > 0 && (
        <div className="rounded-xl border border-purple-900/60 bg-purple-950/20 px-4 py-3">
          <p className="text-sm text-purple-200">
            🧠 <strong>{data.pendingLearnings}</strong> aprendizaje{data.pendingLearnings !== 1 ? 's' : ''} de Daniela esperando revisión
            — promuévelos o recházalos en el tab <strong>Entrenamiento</strong>.
          </p>
        </div>
      )}

      {/* ── Ejecutar ahora ── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">Ejecutar ahora (sin esperar al cron)</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          En el plan Hobby de Vercel los crons corren 1 vez al día. Estos botones ejecutan el trabajo al instante.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {JOB_LABELS.map(({ job, label, hint }) => (
            <button
              key={job}
              onClick={() => handleRunJob(job)}
              disabled={isPending}
              title={hint}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-emerald-700 hover:text-white disabled:opacity-40"
            >
              {jobRunning === job ? '⏳ Ejecutando…' : label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Corridas de crons ── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">Historial de trabajos automáticos</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Crons programados: diario 10:00 · secuencias 09:30 · semanal lunes 08:00 (hora El Salvador).
        </p>
        {data.cronRuns.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            Sin corridas registradas todavía. {data.settingsTableReady ? 'La primera aparecerá cuando corra un cron o uses "Ejecutar ahora".' : 'Corre la migración 011 en Supabase.'}
          </p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {data.cronRuns.map(run => (
              <div key={run.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={run.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
                    {run.status === 'ok' ? '✓' : '✗'}
                  </span>
                  <span className="truncate text-sm text-zinc-300">{JOB_NAMES[run.job] ?? run.job}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-500">
                  {run.error && <span className="text-red-400">{run.error}</span>}
                  <span>{timeAgo(run.started_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Actividad reciente ── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">Actividad reciente de Daniela y el equipo</h3>
        {data.activity.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Sin actividad registrada todavía.</p>
        ) : (
          <div className="mt-3 space-y-1">
            {data.activity.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-2 border-b border-zinc-800/50 py-1.5 text-sm last:border-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    a.actor_type === 'bot' ? 'bg-purple-900/60 text-purple-300'
                      : a.actor_type === 'team' ? 'bg-emerald-900/60 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {a.actor_type === 'bot' ? 'Daniela' : a.actor_type === 'team' ? 'Equipo' : 'Sistema'}
                  </span>
                  <span className="truncate text-zinc-300">{ACTION_LABELS[a.action] ?? a.action}</span>
                </div>
                <span className="shrink-0 text-[11px] text-zinc-600">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
