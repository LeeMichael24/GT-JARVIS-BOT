import { describe, it, expect } from 'vitest'
import { validateEcosystemMedia } from '@/lib/media-sync'

describe('validateEcosystemMedia — contrato del Ecosistema', () => {
  it('acepta el formato { media: [...] } y el array directo', () => {
    const item = { project_key: 'portacelli', media_type: 'brochure', url: 'https://x/b.pdf' }
    expect(validateEcosystemMedia({ media: [item] })).toHaveLength(1)
    expect(validateEcosystemMedia([item])).toHaveLength(1)
  })

  it('normaliza project_key a minúsculas y recorta', () => {
    const [r] = validateEcosystemMedia([{ project_key: '  PORTACELLI ', media_type: 'link', url: 'https://earth.google.com/x' }])
    expect(r.project_key).toBe('portacelli')
  })

  it('rechaza URLs no https (WhatsApp exige público https)', () => {
    expect(validateEcosystemMedia([{ project_key: 'x', media_type: 'brochure', url: 'http://inseguro/b.pdf' }])).toHaveLength(0)
    expect(validateEcosystemMedia([{ project_key: 'x', media_type: 'brochure', url: 'ftp://y' }])).toHaveLength(0)
  })

  it('rechaza media_type inválido y project_key vacío', () => {
    expect(validateEcosystemMedia([{ project_key: 'x', media_type: 'gif', url: 'https://x/a' }])).toHaveLength(0)
    expect(validateEcosystemMedia([{ project_key: '', media_type: 'image', url: 'https://x/a.jpg' }])).toHaveLength(0)
  })

  it('preserva slug, caption y sort_order; caption vacío → null', () => {
    const [r] = validateEcosystemMedia([{
      project_key: 'foresta', project_slug: 'foresta-townhomes', media_type: 'video',
      url: 'https://x/v.mp4', caption: '  Recorrido  ', sort_order: 3,
    }])
    expect(r).toMatchObject({ project_slug: 'foresta-townhomes', caption: 'Recorrido', sort_order: 3 })
    const [r2] = validateEcosystemMedia([{ project_key: 'x', media_type: 'image', url: 'https://x/a.jpg', caption: '   ' }])
    expect(r2.caption).toBeNull()
  })

  it('basura no explota', () => {
    expect(validateEcosystemMedia(null)).toEqual([])
    expect(validateEcosystemMedia({ media: 'nope' })).toEqual([])
    expect(validateEcosystemMedia([null, 42, 'x'])).toEqual([])
  })
})
