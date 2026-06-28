'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoutButton } from './LogoutButton'

export function MobileNav({ isAdmin, memberName, pendingCount }: {
  isAdmin: boolean
  memberName: string
  pendingCount: number
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const linkCls = (href: string) => {
    const active = pathname === href
    return `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
    }`
  }

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Menú"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {open
            ? <><line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" /></>
            : <><line x1="3" y1="5" x2="17" y2="5" /><line x1="3" y1="10" x2="17" y2="10" /><line x1="3" y1="15" x2="17" y2="15" /></>}
        </svg>
        {pendingCount > 0 && !open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-[8px] font-bold text-white">
            {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} />
          <nav className="fixed right-0 top-[57px] z-50 w-64 rounded-bl-2xl border-b border-l border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
            <p className="mb-2 truncate px-3 py-1 text-xs text-zinc-500">{memberName}</p>
            <Link href="/panel" onClick={() => setOpen(false)} className={linkCls('/panel')}>
              Inbox
            </Link>
            {isAdmin && (
              <Link href="/panel/campanas" onClick={() => setOpen(false)} className={linkCls('/panel/campanas')}>
                <span className="flex items-center justify-between">
                  Campañas
                  {pendingCount > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {pendingCount}
                    </span>
                  )}
                </span>
              </Link>
            )}
            {isAdmin && (
              <Link href="/panel/config" onClick={() => setOpen(false)} className={linkCls('/panel/config')}>
                Configuración
              </Link>
            )}
            <div className="mt-2 border-t border-zinc-800 pt-2 px-3">
              <LogoutButton />
            </div>
          </nav>
        </>
      )}
    </div>
  )
}
