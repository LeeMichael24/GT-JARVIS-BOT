import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/auth'
import { LogoutButton } from '@/components/panel/LogoutButton'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const member = await getSessionMember()
  if (!member) redirect('/panel/login')

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/panel" className="text-lg font-semibold text-white">GT Panel</Link>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {member.role === 'admin' ? 'Admin' : 'Asesor'}
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {member.role === 'admin' && (
            <Link href="/panel/config" className="text-zinc-400 hover:text-white">Configuración</Link>
          )}
          <span className="hidden text-zinc-500 sm:inline">{member.name}</span>
          <LogoutButton />
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
