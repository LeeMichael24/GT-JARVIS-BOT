'use client'

import type { DashboardStats, DanielaStats, FunnelStats, LeadsByDay, ObjectionStat, SourceBreakdown } from '@/lib/analytics'

const SOURCE_LABELS: Record<string, string> = {
  meta_ad: 'Meta Ads',
  google_ad: 'Google Ads',
  organic: 'Orgánico',
  referral: 'Referido',
  website: 'Sitio Web',
  direct: 'Directo',
}

function StatCard({ label, value, sub, color }: {
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-600">{sub}</p>}
    </div>
  )
}

function MiniBar({ data, maxVal }: { data: LeadsByDay[]; maxVal: number }) {
  if (data.length === 0) return <p className="text-xs text-zinc-600">Sin datos</p>
  return (
    <div className="flex items-end gap-0.5" style={{ height: 64 }}>
      {data.map(d => (
        <div
          key={d.date}
          className="flex-1 rounded-t bg-emerald-600/80"
          style={{ height: `${Math.max(4, (d.count / maxVal) * 100)}%` }}
          title={`${d.date}: ${d.count}`}
        />
      ))}
    </div>
  )
}

function FunnelStep({ label, value, prev, color }: {
  label: string
  value: number
  prev: number | null
  color: string
}) {
  const pct = prev != null && prev > 0 ? Math.round((value / prev) * 100) : null
  return (
    <div className="flex-1 rounded-lg bg-zinc-950 p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{label}</p>
      {pct != null && <p className="text-[10px] text-zinc-600">{pct}% del anterior</p>}
    </div>
  )
}

export function Dashboard({ stats, leadsByDay, sources, daniela, funnel, objections }: {
  stats: DashboardStats
  leadsByDay: LeadsByDay[]
  sources: SourceBreakdown[]
  daniela: DanielaStats
  funnel: FunnelStats
  objections: ObjectionStat[]
}) {
  const maxLeads = Math.max(1, ...leadsByDay.map(d => d.count))
  const maxObjection = Math.max(1, ...objections.map(o => o.count))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Leads" value={stats.totalLeads} />
        <StatCard label="Calientes" value={stats.hotLeads} color="text-red-400" />
        <StatCard label="Tibios" value={stats.warmLeads} color="text-amber-400" />
        <StatCard label="Nuevos" value={stats.newLeads} color="text-sky-400" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Mensajes 24h"
          value={stats.messagesLast24h}
          sub={`${stats.totalMessages} total`}
        />
        <StatCard
          label="Desde Ads"
          value={stats.leadsFromAds}
          color="text-purple-400"
        />
        <StatCard
          label="Conversión"
          value={`${stats.conversionRate}%`}
          sub="warm + hot / total"
          color="text-emerald-400"
        />
        <StatCard
          label="Daniela"
          value={stats.botActive}
          sub={`${stats.botPaused} pausadas`}
          color="text-emerald-400"
        />
      </div>

      {/* Embudo de ventas — el camino del dinero */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Embudo de ventas (30d)</h3>
        <div className="flex gap-2 overflow-x-auto">
          <FunnelStep label="Leads" value={funnel.total} prev={null} color="text-white" />
          <FunnelStep label="Interesados" value={funnel.interested} prev={funnel.total} color="text-sky-400" />
          <FunnelStep label="Calificados" value={funnel.qualified} prev={funnel.interested} color="text-amber-400" />
          <FunnelStep label="Citas" value={funnel.meetings} prev={funnel.qualified} color="text-emerald-400" />
          <FunnelStep label="Escalados CEO" value={funnel.escalated} prev={null} color="text-red-400" />
        </div>
      </div>

      {/* Objeciones — por qué NO compran */}
      {objections.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-400">Objeciones más comunes</h3>
          <div className="space-y-2">
            {objections.map(o => (
              <div key={o.objection}>
                <div className="flex justify-between text-xs">
                  <span className="capitalize text-zinc-300">{o.objection}</span>
                  <span className="text-zinc-500">{o.count}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-red-700" style={{ width: `${Math.round((o.count / maxObjection) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-400">Leads por día (30d)</h3>
          <MiniBar data={leadsByDay} maxVal={maxLeads} />
          {leadsByDay.length > 0 && (
            <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
              <span>{leadsByDay[0].date.slice(5)}</span>
              <span>{leadsByDay[leadsByDay.length - 1].date.slice(5)}</span>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-400">Origen de leads</h3>
          {sources.length === 0 ? (
            <p className="text-xs text-zinc-600">Sin datos de origen aún</p>
          ) : (
            <div className="space-y-2">
              {sources.map(s => {
                const total = sources.reduce((a, b) => a + b.count, 0)
                const pct = total > 0 ? Math.round((s.count / total) * 100) : 0
                return (
                  <div key={s.source}>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-300">{SOURCE_LABELS[s.source] ?? s.source}</span>
                      <span className="text-zinc-500">{s.count} ({pct}%)</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Daniela Performance */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Rendimiento de Daniela (30d)</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-zinc-500">Conversaciones</p>
            <p className="mt-0.5 text-xl font-bold text-white">{daniela.totalConversations}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Manejadas sola</p>
            <p className="mt-0.5 text-xl font-bold text-emerald-400">{daniela.handledAlone}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Escaladas</p>
            <p className="mt-0.5 text-xl font-bold text-amber-400">{daniela.escalated}</p>
            <p className="text-[10px] text-zinc-600">{daniela.escalationRate}% tasa</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Tiempo resp.</p>
            <p className="mt-0.5 text-xl font-bold text-sky-400">
              {daniela.avgResponseTimeSec != null ? `${daniela.avgResponseTimeSec}s` : '—'}
            </p>
          </div>
        </div>

        {daniela.projectBreakdown.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-zinc-500">Leads por proyecto</p>
            <div className="space-y-1.5">
              {daniela.projectBreakdown.slice(0, 8).map(p => {
                const maxCount = daniela.projectBreakdown[0].count
                const pct = maxCount > 0 ? Math.round((p.count / maxCount) * 100) : 0
                return (
                  <div key={p.project}>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-300">{p.project}</span>
                      <span className="text-zinc-500">{p.count}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-zinc-800">
                      <div className="h-full rounded-full bg-sky-600" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
