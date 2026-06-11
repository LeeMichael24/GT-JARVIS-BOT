import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { listAllTags, listTeam } from '@/lib/panel-data'
import { ConfigTags } from '@/components/panel/ConfigTags'
import { ConfigTeam } from '@/components/panel/ConfigTeam'

export default async function ConfigPage() {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')
  if (member.role !== 'admin') redirect('/panel')

  const [tags, team] = await Promise.all([listAllTags(), listTeam()])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6">
      <h1 className="text-xl font-semibold text-white">Configuración</h1>
      <ConfigTags tags={tags} />
      <ConfigTeam team={team} selfId={member.id} />
    </div>
  )
}
