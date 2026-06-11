'use client'

import { useState, useTransition } from 'react'
import { inviteTeamMember, setMemberActive } from '@/app/panel/actions'
import type { TeamMember, TeamRole } from '@/types'

const MEMBER_ERROR: Record<string, string> = {
  LAST_ADMIN: 'No puedes desactivar al último admin activo.',
  CANT_DEACTIVATE_SELF: 'No puedes desactivarte a ti mismo.',
}

export function ConfigTeam({ team, selfId }: { team: TeamMember[]; selfId: string }) {
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<TeamRole>('asesor')
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <section>
      <h2 className="text-base font-medium text-white">Equipo</h2>
      <p className="text-sm text-zinc-500">El invitado recibe un correo para crear su contraseña.</p>
      <ul className="mt-3 divide-y divide-zinc-900 rounded-lg border border-zinc-900">
        {team.map(m => (
          <li key={m.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
            <div>
              <p className={m.active ? 'text-white' : 'text-zinc-600 line-through'}>{m.name}</p>
              <p className="text-xs text-zinc-500">{m.email} · {m.role === 'admin' ? 'Admin' : 'Asesor'}</p>
            </div>
            {m.id !== selfId && (
              <button
                disabled={isPending}
                onClick={() => startTransition(async () => {
                  const res = await setMemberActive(m.id, !m.active)
                  setMsg(res.ok ? null : (MEMBER_ERROR[res.error] ?? 'No se pudo actualizar.'))
                })}
                className="rounded-lg bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                {m.active ? 'Desactivar' : 'Reactivar'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={e => {
          e.preventDefault()
          setMsg(null)
          startTransition(async () => {
            const res = await inviteTeamMember(email, name, role)
            setMsg(res.ok ? 'Invitación enviada ✓' : 'No se pudo invitar (¿correo ya registrado?)')
            if (res.ok) { setEmail(''); setName('') }
          })
        }}
      >
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="Nombre" aria-label="Nombre del invitado" className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600" />
        <input value={email} onChange={e => setEmail(e.target.value)} required type="email" placeholder="correo@equipo.com" aria-label="Correo del invitado" className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-600" />
        <select value={role} onChange={e => setRole(e.target.value as TeamRole)} aria-label="Rol del invitado" className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300">
          <option value="asesor">Asesor</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" disabled={isPending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-40">
          Invitar
        </button>
      </form>
      {msg && <p className="mt-2 text-sm text-zinc-400">{msg}</p>}
    </section>
  )
}
