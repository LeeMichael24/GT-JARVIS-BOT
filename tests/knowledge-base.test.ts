import { describe, it, expect } from 'vitest'
import { filterPlaybookByProject, type KBEntry } from '@/lib/knowledge-base'

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
