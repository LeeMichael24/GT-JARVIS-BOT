'use client'

import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await createSupabaseBrowserClient().auth.signOut()
        router.replace('/panel/login')
      }}
      className="text-zinc-400 hover:text-white"
    >
      Salir
    </button>
  )
}
