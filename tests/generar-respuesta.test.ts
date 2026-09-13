import { describe, it, expect, vi } from 'vitest'
import { generarRespuesta, PRESUPUESTO_REVISION_MS } from '@/lib/generar-respuesta'

// La misma función la usan el webhook y la batería de evaluación: lo que se
// mide es exactamente lo que corre en producción.
const json = (o: Record<string, unknown>) => JSON.stringify({ stage: 'warm', ...o })
const settings = { llm_temperature: 0.85, sales_critic_enabled: true }

function armar(respuestas: string[], veredicto = '{"aprobada":true,"fallas":[]}', ahora = 1_000) {
  const prompts: string[] = []
  const deps = {
    llamarModelo: vi.fn(async (system: string) => {
      prompts.push(system)
      const r = respuestas.shift()
      if (r === undefined) throw new Error('sin respuesta preparada')
      return r
    }),
    juez: vi.fn(async () => veredicto),
    ahora: () => ahora,
  }
  return { deps, prompts }
}
const args = (extra: Record<string, unknown> = {}) =>
  ({ systemPrompt: 'SYS', history: [], settings, mensajeCliente: '¿Adónde está ubicado?', inicioMs: 1_000, ...extra })

describe('generarRespuesta', () => {
  it('aprobada por el juez: una sola llamada al modelo y la respuesta sale igual', async () => {
    const { deps } = armar([json({ reply: 'Queda frente al Centro Forense.' })])
    const r = await generarRespuesta(args(), deps)
    expect(deps.llamarModelo).toHaveBeenCalledTimes(1)
    // tres jueces en paralelo, decide la mayoría (ver sales-critic)
    expect(deps.juez).toHaveBeenCalledTimes(3)
    expect(r.respuesta.reply).toBe('Queda frente al Centro Forense.')
    expect(r.revision.reescrita).toBe(false)
  })

  it('reprobada: reescribe con las fallas del juez y usa la versión nueva', async () => {
    const { deps, prompts } = armar(
      [json({ reply: 'Portacelli está en Nuevo Cuscatlán.' }), json({ reply: 'La entrada queda justo frente al Centro Forense, a 12 minutos de San Benito.' })],
      '{"aprobada":false,"fallas":["respuesta literal, sin gancho"],"sugerencia":"conecta con el bosque"}',
    )
    const r = await generarRespuesta(args(), deps)
    expect(deps.llamarModelo).toHaveBeenCalledTimes(2)
    expect(prompts[1]).toContain('SYS')
    expect(prompts[1]).toContain('respuesta literal, sin gancho')
    expect(prompts[1]).toContain('Portacelli está en Nuevo Cuscatlán.')
    expect(r.respuesta.reply).toContain('12 minutos de San Benito')
    expect(r.revision.reescrita).toBe(true)
  })

  it('si la reescritura viene inválida, se queda la original', async () => {
    const { deps } = armar([json({ reply: 'Original.' }), 'no es json'], '{"aprobada":false,"fallas":["genérica"]}')
    const r = await generarRespuesta(args(), deps)
    expect(r.respuesta.reply).toBe('Original.')
    expect(r.revision.reescrita).toBe(false)
  })

  it('la reescritura no puede perder el material que ya se iba a enviar', async () => {
    const media = { type: 'link', project: 'Portacelli', description: 'ubicación' }
    const { deps } = armar(
      [json({ reply: 'Original.', send_media: media }), json({ reply: 'Mejorada.' })],
      '{"aprobada":false,"fallas":["literal"]}',
    )
    const r = await generarRespuesta(args(), deps)
    expect(r.respuesta.reply).toBe('Mejorada.')
    expect(r.respuesta.send_media).toEqual(media)
  })

  it('con la revisión apagada desde el panel, el juez no se llama', async () => {
    const { deps } = armar([json({ reply: 'Hola.' })])
    await generarRespuesta(args({ settings: { ...settings, sales_critic_enabled: false } }), deps)
    expect(deps.juez).not.toHaveBeenCalled()
  })

  it('sin tiempo: si ya se pasó el presupuesto, se envía sin revisar', async () => {
    const { deps } = armar([json({ reply: 'Hola.' })], undefined, 1_000 + PRESUPUESTO_REVISION_MS + 1)
    const r = await generarRespuesta(args(), deps)
    expect(deps.juez).not.toHaveBeenCalled()
    expect(r.revision.motivoOmitida).toBe('sin_tiempo')
  })

  it('JSON inválido: reintenta una vez con aviso', async () => {
    const { deps, prompts } = armar(['{}', json({ reply: 'Ya.' })])
    const r = await generarRespuesta(args(), deps)
    expect(prompts[1]).toContain('REINTENTO')
    expect(r.respuesta.reply).toBe('Ya.')
  })

  // gpt-4.1 comparte 30K tokens/min con toda la cuenta: tres clientes a la vez
  // lo saturan. Mejor una respuesta del modelo chico que dejar al cliente en visto.
  it('OpenAI saturado (429): responde con gpt-4.1-mini y sin revisión', async () => {
    const { deps } = armar([])
    const e429 = Object.assign(new Error('429 Rate limit reached for gpt-4.1 on tokens per min'), { status: 429 })
    deps.llamarModelo
      .mockRejectedValueOnce(e429)
      .mockResolvedValueOnce(json({ reply: 'Queda frente al Centro Forense.' }))
    const r = await generarRespuesta(args({ settings: { ...settings, llm_model: 'gpt-4.1' } }), deps)
    expect(deps.llamarModelo).toHaveBeenCalledTimes(2)
    expect(deps.llamarModelo).toHaveBeenLastCalledWith('SYS', [], expect.objectContaining({ model: 'gpt-4.1-mini' }))
    expect(deps.juez).not.toHaveBeenCalled()
    expect(r.revision.motivoOmitida).toBe('saturado')
    expect(r.respuesta.reply).toBe('Queda frente al Centro Forense.')
  })

  it('dos JSON inválidos: lanza, para que el webhook mande el mensaje de respaldo', async () => {
    const { deps } = armar(['{}', '{}'])
    await expect(generarRespuesta(args(), deps)).rejects.toThrow()
  })

  it('la respuesta final sale sin frases prohibidas', async () => {
    const { deps } = armar([json({ reply: 'Te paso el link. Estoy aquí para ayudarte.' })])
    const r = await generarRespuesta(args(), deps)
    expect(r.respuesta.reply).toBe('Te paso el link.')
  })
})
