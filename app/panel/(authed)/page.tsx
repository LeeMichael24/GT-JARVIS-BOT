import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { listAllTags, listInboxLeads, listTeam } from '@/lib/panel-data'
import { InboxList } from '@/components/panel/InboxList'
import { RealtimeRefresher } from '@/components/panel/RealtimeRefresher'

export default async function InboxPage() {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')

  const [leads, tags, team] = await Promise.all([
    listInboxLeads(member),
    listAllTags(),
    listTeam(),
  ])

  return (
    <>
      <RealtimeRefresher />
      <InboxList items={leads} tags={tags} team={team} isAdmin={member.role === 'admin'} />
    </>
  )
}
