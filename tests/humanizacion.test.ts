import { describe, it, expect, vi } from 'vitest'
import { resolverCuerpo, esAtendible, type DepsEntrante } from '@/lib/mensaje-entrante'
import { parseWebhookMessages } from '@/services/whatsapp/webhook'
import { parseClaudeResponse } from '@/services/claude/client'
import { naturalizarPuntuacion } from '@/lib/reply-guard'
import { calculateTypingDelay } from '@/services/whatsapp/client'
import type { ParsedWebhook } from '@/types'

const base: ParsedWebhook = { messageId: 'wamid.1', from: '503', body: '', messageType: 'text', timestamp: 1, mediaId: null, referral: null }
const deps = (): DepsEntrante => ({
  descargar: vi.fn(async () => ({ buffer: Buffer.from('x'), mimeType: 'image/jpeg' })),
  transcribir: vi.fn(async () => 'hola, quiero info'),
  describirImagen: vi.fn(async () => 'Casa de dos niveles con jardín, se lee "Se vende $180,000"'),
  buscarCitado: vi.fn(async () => ({ role: 'assistant', content: 'Te propongo el jueves o el sábado' })),
})

const envolver = (msg: Record<string, unknown>) => ({ entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1', from: '503', timestamp: '1', ...msg }] } }] }] })

describe('mensajes que antes quedaban en visto', () => {
  it('parser: ubicación, contacto, sticker, reacción, cita y pie de foto', () => {
    const [loc] = parseWebhookMessages(envolver({ type: 'location', location: { latitude: 13.7, longitude: -89.2, name: 'Mi casa' } }))
    expect(loc.location).toMatchObject({ latitude: 13.7, name: 'Mi casa' })
    const [img] = parseWebhookMessages(envolver({ type: 'image', image: { id: 'm1', caption: 'así está mi casa' }, context: { id: 'wamid.0' } }))
    expect(img).toMatchObject({ mediaId: 'm1', caption: 'así está mi casa', contextId: 'wamid.0' })
    const [rx] = parseWebhookMessages(envolver({ type: 'reaction', reaction: { message_id: 'wamid.0', emoji: '👍' } }))
    expect(rx.reaction).toEqual({ messageId: 'wamid.0', emoji: '👍' })
    const [c] = parseWebhookMessages(envolver({ type: 'contacts', contacts: [{ name: { formatted_name: 'Ana' }, phones: [{ phone: '+503 7777' }] }] }))
    expect(c.contacts).toEqual([{ name: 'Ana', phone: '+503 7777' }])
    expect(parseWebhookMessages(envolver({ type: 'raro' }))[0].messageType).toBe('unknown')
  })

  it('una reacción del cliente no se contesta; lo demás sí', () => {
    expect(esAtendible({ ...base, messageType: 'reaction', reaction: { messageId: 'x', emoji: '👍' } })).toBe(false)
    expect(esAtendible({ ...base, messageType: 'location', location: { latitude: 1, longitude: 2, name: null, address: null } })).toBe(true)
    expect(esAtendible({ ...base, messageType: 'document', mediaId: 'd1' })).toBe(true)
    expect(esAtendible({ ...base, messageType: 'unknown' })).toBe(false)
  })

  it('Daniela VE la foto: la descripción y el pie quedan como texto', async () => {
    const t = await resolverCuerpo({ ...base, messageType: 'image', mediaId: 'm1', caption: 'así está mi casa' }, deps())
    expect(t).toContain('[Foto del cliente: Casa de dos niveles')
    expect(t).toContain('Pie de foto del cliente: así está mi casa')
  })

  it('si no se puede ver la foto, lo dice en vez de fallar', async () => {
    const d = deps(); d.describirImagen = vi.fn(async () => { throw new Error('x') })
    expect(await resolverCuerpo({ ...base, messageType: 'image', mediaId: 'm1' }, d)).toContain('no se pudo abrir')
  })

  it('ubicación, documento y contacto se entienden', async () => {
    expect(await resolverCuerpo({ ...base, messageType: 'location', location: { latitude: 13.7, longitude: -89.2, name: 'Mi casa', address: null } }, deps()))
      .toMatch(/compartió una ubicación: Mi casa \(13\.70000, -89\.20000\) https:\/\/maps\.google\.com/)
    expect(await resolverCuerpo({ ...base, messageType: 'document', mediaId: 'd', filename: 'escritura.pdf' }, deps())).toContain('documento: escritura.pdf')
    expect(await resolverCuerpo({ ...base, messageType: 'contacts', contacts: [{ name: 'Ana', phone: '7777' }] }, deps())).toContain('Puede ser un referido')
  })

  it('si respondió citando, Daniela sabe a qué', async () => {
    const t = await resolverCuerpo({ ...base, body: 'el sábado', contextId: 'wamid.0' }, deps())
    expect(t).toBe('[Respondiendo a tu mensaje: "Te propongo el jueves o el sábado"]\nel sábado')
  })
})

describe('reacciones', () => {
  it('solo reacción: sin texto es válido; reacción fuera de la lista se descarta', () => {
    const r = parseClaudeResponse(JSON.stringify({ reaccion: '👍', solo_reaccion: true }))
    expect(r).toMatchObject({ reply: '', reaccion: '👍', solo_reaccion: true })
    expect(parseClaudeResponse(JSON.stringify({ reply: 'hola', reaccion: '🍆' })).reaccion).toBeNull()
    expect(() => parseClaudeResponse(JSON.stringify({ solo_reaccion: true }))).toThrow()
  })
})

describe('se lee humano', () => {
  it('raya larga y punto y coma fuera; rangos de precio intactos', () => {
    expect(naturalizarPuntuacion('Foresta — en El Encanto; tiene golf')).toBe('Foresta, en El Encanto. Tiene golf')
    expect(naturalizarPuntuacion('Desde $576,200 – $704,000')).toBe('Desde $576,200 – $704,000')
  })

  it('el tiempo de escritura varía (±30 %) y sin azar queda como antes', () => {
    expect(calculateTypingDelay('Hola')).toBe(1200)
    expect(calculateTypingDelay('Hola', () => 0)).toBe(900)
    expect(calculateTypingDelay('Hola', () => 1)).toBe(1560)
  })
})
