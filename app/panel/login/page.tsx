'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }
    router.replace('/panel')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl sm:p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">GT Panel</h1>
          <p className="mt-1 text-sm text-zinc-500">Grupo Terranova</p>
        </div>
        <label className="mt-8 block text-sm font-medium text-zinc-400">
          Correo
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-white outline-none transition-colors focus:border-emerald-500"
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-zinc-400">
          Contraseña
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-white outline-none transition-colors focus:border-emerald-500"
          />
        </label>
        {error && <p className="mt-3 rounded-lg bg-red-950 px-3 py-2 text-center text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-emerald-600 py-2.5 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
