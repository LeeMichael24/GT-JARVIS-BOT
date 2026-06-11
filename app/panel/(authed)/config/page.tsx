import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { listAllTags, listTeam } from '@/lib/panel-data'
import { listRules, listTemplates } from '@/lib/proactive/data'
import { ConfigTags } from '@/components/panel/ConfigTags'
import { ConfigTeam } from '@/components/panel/ConfigTeam'
import { ConfigTemplates } from '@/components/panel/ConfigTemplates'
import { ConfigRules } from '@/components/panel/ConfigRules'

export default async function ConfigPage() {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')
  if (member.role !== 'admin') redirect('/panel')

  const [tags, team, templates, rules] = await Promise.all([
    listAllTags(), listTeam(), listTemplates(), listRules(),
  ])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
        <h1 className="text-xl font-semibold text-white">Configuración</h1>
        <ConfigTags tags={tags} />
        <ConfigTeam team={team} selfId={member.id} />
        <ConfigTemplates templates={templates} />
        <ConfigRules rules={rules} templates={templates} tags={tags} />
      </div>
    </div>
  )
}
