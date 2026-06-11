import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { countPendingCampaigns } from '@/lib/proactive/data'
import { LogoutButton } from '@/components/panel/LogoutButton'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')

  // Tolerante: si la migración 004 aún no corrió (o falla la query), el panel
  // sigue funcionando con badge en 0 en vez de tumbar el layout completo
  const pendingCount = member.role === 'admin'
    ? await countPendingCampaigns().catch(() => 0)
    : 0

  return (
    <div className="flex h-screen h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/panel" className="text-lg font-semibold text-white">GT Panel</Link>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {member.role === 'admin' ? 'Admin' : 'Asesor'}
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {member.role === 'admin' && (
            <Link href="/panel/campanas" className="relative text-zinc-400 hover:text-white">
              Campañas
              {pendingCount > 0 && (
                <span className="absolute -right-3 -top-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          )}
          {member.role === 'admin' && (
            <Link href="/panel/config" className="text-zinc-400 hover:text-white">Configuración</Link>
          )}
          <span className="hidden text-zinc-500 sm:inline">{member.name}</span>
          <LogoutButton />
        </nav>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
