import { describe, it, expect } from 'vitest'
import { noticesForProject, formatNoticesForPrompt, type Notice } from '@/lib/notices'

function aviso(over: Partial<Notice> = {}): Notice {
  return {
    id: 'n1', scope: 'project', project_slug: 'portacelli-alta-xyz',
    body: 'Se liberó la única unidad de 106 m² en Alta.',
    priority: 100, starts_at: '2026-09-01T00:00:00Z', ends_at: null, active: true,
    ...over,
  }
}

describe('noticesForProject — un aviso de Foresta no entra en una charla de Portacelli', () => {
  const avisos = [
    aviso({ id: 'a', project_slug: 'portacelli-alta-xyz' }),
    aviso({ id: 'b', project_slug: 'foresta-abc', body: 'Foresta sube de precio el 1 de octubre.' }),
    aviso({ id: 'g', scope: 'global', project_slug: null, body: 'Esta semana no hay visitas el sábado.' }),
  ]

  it('deja el del proyecto en conversación + los globales', () => {
    expect(noticesForProject(avisos, 'portacelli-alta-xyz').map(n => n.id)).toEqual(['a', 'g'])
  })

  it('no filtra el aviso de otro proyecto hacia adentro', () => {
    expect(noticesForProject(avisos, 'portacelli-alta-xyz').some(n => n.id === 'b')).toBe(false)
  })

  it('sin proyecto detectado solo quedan los globales', () => {
    expect(noticesForProject(avisos, null).map(n => n.id)).toEqual(['g'])
  })
})

describe('formatNoticesForPrompt', () => {
  it('sin avisos no gasta ni un token', () => {
    expect(formatNoticesForPrompt([])).toBe('')
  })

  it('le dice al modelo que el aviso MANDA sobre el catálogo', () => {
    const out = formatNoticesForPrompt([aviso()])
    expect(out).toContain('AVISOS DE HOY')
    expect(out).toContain('el aviso gana')
    expect(out).toContain('106 m²')
  })

  it('pide que no los recite si no vienen al caso', () => {
    expect(formatNoticesForPrompt([aviso()])).toContain('no los recites')
  })

  it('respeta el tope de caracteres en vez de inflar el prompt', () => {
    const muchos = Array.from({ length: 40 }, (_, i) => aviso({ id: `n${i}`, body: 'x'.repeat(120) }))
    const out = formatNoticesForPrompt(muchos)
    expect(out.length).toBeLessThan(2200)
  })
})

describe('la ficha de proyecto', () => {
  it('son los diez campos y ninguno pide precios', async () => {
    const { FICHA_CAMPOS, FICHA_KEYS, completitud } = await import('@/lib/project-profile')
    expect(FICHA_CAMPOS).toHaveLength(10)
    expect(new Set(FICHA_KEYS).size).toBe(10)
    // el campo de pago existe pero advierte explícitamente contra los montos
    expect(FICHA_CAMPOS.find(c => c.key === 'ficha_pago')!.hint).toContain('sin montos')
    expect(completitud(['ficha_pago', 'ficha_perfil'])).toEqual({ llenos: 2, total: 10, pct: 20 })
    expect(completitud([]).pct).toBe(0)
  })

  it('"lo que NO puede decir" va primero en el prompt', async () => {
    const { FICHA_CAMPOS } = await import('@/lib/project-profile')
    const min = Math.min(...FICHA_CAMPOS.map(c => c.priority))
    expect(FICHA_CAMPOS.find(c => c.priority === min)!.key).toBe('ficha_limites')
  })
})
