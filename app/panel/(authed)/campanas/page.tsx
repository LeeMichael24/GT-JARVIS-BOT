import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { listCampaignHistory, listPendingCampaigns } from '@/lib/proactive/data'
import { COST_PER_TEMPLATE_USD } from '@/lib/proactive/cost'
import { CampaignsView } from '@/components/panel/CampaignsView'

// Las server actions heredan esto: aprobar envía hasta 50 plantillas (~28s)
export const maxDuration = 60

export default async function CampanasPage() {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')
  if (member.role !== 'admin') redirect('/panel')

  const [pending, history] = await Promise.all([
    listPendingCampaigns(),
    listCampaignHistory(20),
  ])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-xl font-semibold text-white">Campañas</h1>
        <CampaignsView pending={pending} history={history} costPerSend={COST_PER_TEMPLATE_USD} />
      </div>
    </div>
  )
}
