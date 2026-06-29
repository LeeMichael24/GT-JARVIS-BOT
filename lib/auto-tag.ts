import { getServiceClient } from '@/lib/supabase'

const tagCache = new Map<string, string>()

async function getOrCreateTag(name: string, color: string): Promise<string> {
  const cached = tagCache.get(name)
  if (cached) return cached

  const supabase = getServiceClient()

  const { data: existing } = await supabase
    .from('tags')
    .select('id')
    .eq('name', name)
    .maybeSingle()

  if (existing) {
    tagCache.set(name, (existing as { id: string }).id)
    return (existing as { id: string }).id
  }

  const { data: created, error } = await supabase
    .from('tags')
    .insert({ name, color })
    .select('id')
    .single()

  if (error) throw new Error(`getOrCreateTag: ${error.message}`)
  const id = (created as { id: string }).id
  tagCache.set(name, id)
  return id
}

export async function autoTagProject(leadId: string, projectName: string): Promise<void> {
  const tagId = await getOrCreateTag(projectName, '#10B981')

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('lead_tags')
    .insert({ lead_id: leadId, tag_id: tagId, source: 'bot', created_by: null })

  if (error && !error.message.includes('duplicate') && error.code !== '23505') {
    throw new Error(`autoTagProject: ${error.message}`)
  }
}

export async function autoTagSource(leadId: string, sourceType: string): Promise<void> {
  const labels: Record<string, { name: string; color: string }> = {
    meta_ad: { name: 'Meta Ad', color: '#A855F7' },
    google_ad: { name: 'Google Ad', color: '#3B82F6' },
    referral: { name: 'Referido', color: '#14B8A6' },
  }
  const cfg = labels[sourceType]
  if (!cfg) return

  const tagId = await getOrCreateTag(cfg.name, cfg.color)

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('lead_tags')
    .insert({ lead_id: leadId, tag_id: tagId, source: 'bot', created_by: null })

  if (error && !error.message.includes('duplicate') && error.code !== '23505') {
    throw new Error(`autoTagSource: ${error.message}`)
  }
}
