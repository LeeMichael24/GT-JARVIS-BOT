import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { countPendingCampaigns } from '@/lib/proactive/data'
import { LogoutButton } from '@/components/panel/LogoutButton'
import { MobileNav } from '@/components/panel/MobileNav'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')

  const pendingCount = member.role === 'admin'
    ? await countPendingCampaigns().catch(() => 0)
    : 0

  return (
    <div className="flex h-screen h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/panel" className="text-lg font-semibold tracking-tight text-white">
            GT Panel
          </Link>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
            {member.role === 'admin' ? 'Admin' : 'Asesor'}
          </span>
        </div>

        <nav className="hidden items-center gap-5 text-sm sm:flex">
          {member.role === 'admin' && (
            <Link href="/panel/campanas" className="relative text-zinc-400 transition-colors hover:text-white">
              Campañas
              {pendingCount > 0 && (
                <span className="absolute -right-4 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          )}
          {member.role === 'admin' && (
            <Link href="/panel/config" className="text-zinc-400 transition-colors hover:text-white">Config</Link>
          )}
          <span className="text-zinc-500">{member.name}</span>
          <LogoutButton />
        </nav>

        <MobileNav
          isAdmin={member.role === 'admin'}
          memberName={member.name}
          pendingCount={pendingCount}
        />
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
