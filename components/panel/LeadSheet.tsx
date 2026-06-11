'use client'

import type { LeadBundle } from '@/lib/panel-data'
import type { SessionMember } from '@/lib/auth'

export function LeadSheet({ bundle }: { bundle: LeadBundle; member: SessionMember }) {
  return (
    <div className="p-4 text-sm text-zinc-400">
      <p className="font-medium text-white">{bundle.lead.name ?? bundle.lead.phone}</p>
    </div>
  )
}
