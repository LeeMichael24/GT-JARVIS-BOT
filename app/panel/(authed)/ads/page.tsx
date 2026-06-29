import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getSessionMember } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabase'
import type { AdCampaign } from '@/types'
import { AdCampaigns } from '@/components/panel/AdCampaigns'

async function listAdCampaigns(): Promise<AdCampaign[]> {
  const { data, error } = await getServiceClient()
    .from('ad_campaigns')
    .select('*')
    .order('status')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listAdCampaigns: ${error.message}`)
  return (data ?? []) as AdCampaign[]
}

async function addCampaign(form: FormData): Promise<{ error?: string }> {
  'use server'
  const member = await getSessionMember()
  if (!member || member.role !== 'admin') return { error: 'No autorizado' }

  const name = (form.get('name') as string)?.trim()
  if (!name) return { error: 'Nombre requerido' }

  const { error } = await getServiceClient()
    .from('ad_campaigns')
    .insert({
      platform: form.get('platform') as string,
      external_id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      target_project: (form.get('target_project') as string)?.trim() || null,
      offer_details: (form.get('offer_details') as string)?.trim() || null,
    })

  if (error) return { error: error.message }
  revalidatePath('/panel/ads')
  return {}
}

async function updateNotes(id: string, notes: string): Promise<{ error?: string }> {
  'use server'
  const member = await getSessionMember()
  if (!member || member.role !== 'admin') return { error: 'No autorizado' }

  const { error } = await getServiceClient()
    .from('ad_campaigns')
    .update({ offer_details: notes.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/panel/ads')
  return {}
}

async function toggleCampaign(id: string, newStatus: string): Promise<{ error?: string }> {
  'use server'
  const member = await getSessionMember()
  if (!member || member.role !== 'admin') return { error: 'No autorizado' }

  const { error } = await getServiceClient()
    .from('ad_campaigns')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/panel/ads')
  return {}
}

export default async function AdsPage() {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')
  if (member.role !== 'admin') redirect('/panel')

  const campaigns = await listAdCampaigns()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-xl font-semibold text-white">Ads Activos</h1>
        <AdCampaigns
          campaigns={campaigns}
          addAction={addCampaign}
          updateNotesAction={updateNotes}
          toggleAction={toggleCampaign}
        />
      </div>
    </div>
  )
}
