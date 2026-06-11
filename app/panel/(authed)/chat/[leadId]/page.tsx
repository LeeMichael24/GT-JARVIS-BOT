import { notFound, redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { getLeadBundle } from '@/lib/panel-data'
import { ChatView } from '@/components/panel/ChatView'

export default async function ChatPage({ params }: { params: Promise<{ leadId: string }> }) {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')

  const { leadId } = await params
  const bundle = await getLeadBundle(leadId, member)
  if (!bundle) notFound()

  return <ChatView bundle={bundle} member={member} />
}
