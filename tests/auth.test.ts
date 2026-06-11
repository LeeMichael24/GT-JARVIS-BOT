import { describe, it, expect, vi, beforeEach } from 'vitest'

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  member: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: authState.user } })) },
  })),
}))

vi.mock('@/lib/supabase', () => ({
  getServiceClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: authState.member }),
        }),
      }),
    }),
  })),
}))

import { getSessionMember, requireMember, requireAdmin } from '@/lib/auth'

beforeEach(() => {
  authState.user = null
  authState.member = null
})

describe('getSessionMember', () => {
  it('null sin sesión', async () => {
    expect(await getSessionMember()).toBeNull()
  })

  it('null si el usuario no está en team_members', async () => {
    authState.user = { id: 'u1' }
    expect(await getSessionMember()).toBeNull()
  })

  it('null si el miembro está inactivo', async () => {
    authState.user = { id: 'u1' }
    authState.member = { id: 'u1', name: 'Ana', email: 'a@a.com', role: 'asesor', active: false }
    expect(await getSessionMember()).toBeNull()
  })

  it('devuelve el miembro activo', async () => {
    authState.user = { id: 'u1' }
    authState.member = { id: 'u1', name: 'Ana', email: 'a@a.com', role: 'asesor', active: true }
    expect(await getSessionMember()).toEqual({ id: 'u1', name: 'Ana', email: 'a@a.com', role: 'asesor' })
  })
})

describe('requireMember / requireAdmin', () => {
  it('requireMember lanza UNAUTHORIZED sin sesión', async () => {
    await expect(requireMember()).rejects.toThrow('UNAUTHORIZED')
  })

  it('requireAdmin lanza FORBIDDEN para asesor', async () => {
    authState.user = { id: 'u1' }
    authState.member = { id: 'u1', name: 'Ana', email: 'a@a.com', role: 'asesor', active: true }
    await expect(requireAdmin()).rejects.toThrow('FORBIDDEN')
  })

  it('requireAdmin devuelve al admin', async () => {
    authState.user = { id: 'u1' }
    authState.member = { id: 'u1', name: 'Michael', email: 'm@m.com', role: 'admin', active: true }
    expect((await requireAdmin()).role).toBe('admin')
  })
})
