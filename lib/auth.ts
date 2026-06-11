import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getServiceClient } from '@/lib/supabase'
import type { TeamRole } from '@/types'

export interface SessionMember {
  id: string
  name: string
  email: string
  role: TeamRole
}

export async function getSessionMember(): Promise<SessionMember | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const service = getServiceClient()
  const { data } = await service
    .from('team_members')
    .select('id, name, email, role, active')
    .eq('id', user.id)
    .maybeSingle()

  if (!data || !data.active) return null
  return { id: data.id, name: data.name, email: data.email, role: data.role as TeamRole }
}

export async function requireMember(): Promise<SessionMember> {
  const member = await getSessionMember()
  if (!member) throw new Error('UNAUTHORIZED')
  return member
}

export async function requireAdmin(): Promise<SessionMember> {
  const member = await requireMember()
  if (member.role !== 'admin') throw new Error('FORBIDDEN')
  return member
}
