import { describe, it, expect } from 'vitest'
import { validateEcosystemKnowledge } from '@/lib/knowledge-sync'

describe('validateEcosystemKnowledge — contrato del Ecosistema', () => {
  const base = { category: 'project_pitch', topic: 'pitch_alba', title: 'Pitch Alba', content: 'Townhomes loft con terrazas.' }

  it('acepta el formato { knowledge: [...] } y el array directo', () => {
    expect(validateEcosystemKnowledge({ knowledge: [base] })).toHaveLength(1)
    expect(validateEcosystemKnowledge([base])).toHaveLength(1)
  })

  it('rechaza categorías fuera de las 5 del playbook', () => {
    expect(validateEcosystemKnowledge([{ ...base, category: 'chismes' }])).toHaveLength(0)
  })

  it('rechaza filas sin topic, title o content', () => {
    expect(validateEcosystemKnowledge([{ ...base, topic: '' }])).toHaveLength(0)
    expect(validateEcosystemKnowledge([{ ...base, title: '' }])).toHaveLength(0)
    expect(validateEcosystemKnowledge([{ ...base, content: '  ' }])).toHaveLength(0)
  })

  it('recorta content a 450 (el prompt trunca ahí) y aplica defaults', () => {
    const [r] = validateEcosystemKnowledge([{ ...base, content: 'x'.repeat(600) }])
    expect(r.content).toHaveLength(450)
    expect(r.priority).toBe(0)
    expect(r.project_slug).toBeNull()
  })

  it('preserva project_slug y priority', () => {
    const [r] = validateEcosystemKnowledge([{ ...base, project_slug: ' alba-fase-1 ', priority: 9 }])
    expect(r.project_slug).toBe('alba-fase-1')
    expect(r.priority).toBe(9)
  })

  it('basura no explota y hay tope de filas', () => {
    expect(validateEcosystemKnowledge(null)).toEqual([])
    expect(validateEcosystemKnowledge([null, 42])).toEqual([])
    expect(validateEcosystemKnowledge(Array.from({ length: 600 }, () => base))).toHaveLength(500)
  })
})
