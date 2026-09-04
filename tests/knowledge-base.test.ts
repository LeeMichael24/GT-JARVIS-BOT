import { describe, it, expect } from 'vitest'
import { filterPlaybookByProject, formatPlaybookForPrompt, type KBEntry } from '@/lib/knowledge-base'

function entry(project_slug: string | null, title = 't'): KBEntry {
  return { category: 'faq', topic: 'x', title, content: 'c', project_slug }
}

describe('filterPlaybookByProject', () => {
  const entries = [entry(null, 'general'), entry('portacelli', 'p1'), entry('foresta', 'f1')]

  it('con proyecto: deja lo general + lo de ese proyecto, saca el resto', () => {
    const out = filterPlaybookByProject(entries, 'portacelli')
    expect(out.map(e => e.title)).toEqual(['general', 'p1'])
  })

  it('sin proyecto: devuelve todo (comportamiento actual)', () => {
    expect(filterPlaybookByProject(entries, null)).toHaveLength(3)
    expect(filterPlaybookByProject(entries, undefined)).toHaveLength(3)
  })

  it('lista vacía no truena', () => {
    expect(filterPlaybookByProject([], 'portacelli')).toEqual([])
  })
})

describe('presupuesto del playbook en el prompt', () => {
  function entradas(n: number, chars: number): KBEntry[] {
    return Array.from({ length: n }, (_, i) => ({
      category: 'faq', topic: `t${i}`, title: `T${i}`,
      content: 'x'.repeat(chars), project_slug: null,
    }))
  }

  it('un playbook de ~11K chars ya NO se trunca (el conocimiento de ventas cabe)', () => {
    const out = formatPlaybookForPrompt(entradas(26, 420))
    expect(out).not.toContain('playbook truncado')
  })

  it('más de 12K chars sí se trunca (el prompt no explota)', () => {
    const out = formatPlaybookForPrompt(entradas(40, 420))
    expect(out).toContain('playbook truncado')
    expect(out.length).toBeLessThan(12200)
  })
})
