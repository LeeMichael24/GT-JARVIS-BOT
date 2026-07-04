import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { getDashboardStats, getLeadsByDay, getSourceBreakdown, getDanielaStats, getFunnelStats, getTopObjections } from '@/lib/analytics'
import { Dashboard } from '@/components/panel/Dashboard'

export default async function DashboardPage() {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')
  if (member.role !== 'admin') redirect('/panel')

  const [stats, leadsByDay, sources, daniela, funnel, objections] = await Promise.all([
    getDashboardStats(),
    getLeadsByDay(30),
    getSourceBreakdown(),
    getDanielaStats(30),
    getFunnelStats(30),
    getTopObjections(6),
  ])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <Dashboard stats={stats} leadsByDay={leadsByDay} sources={sources} daniela={daniela} funnel={funnel} objections={objections} />
      </div>
    </div>
  )
}
