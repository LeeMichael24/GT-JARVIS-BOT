import { describe, it, expect } from 'vitest'
import { parseTrainingText, chunkTranscript } from '@/lib/wa-parse'

describe('parseTrainingText — export de WhatsApp', () => {
  it('parsea el formato [fecha, hora] Sender: mensaje y clasifica roles', () => {
    const raw = [
      '[12/5/26, 10:31:04 AM] Carlos Pérez: Hola, vi el anuncio de Portacelli',
      '[12/5/26, 10:32:11 AM] Daniela: ¡Hola Carlos! Qué bueno que te interesó',
      '[12/5/26, 10:33:40 AM] Carlos Pérez: cuánto cuesta?',
      '[12/5/26, 10:34:02 AM] Daniela: Arranca desde $242K con financiamiento directo',
    ].join('\n')
    const result = parseTrainingText(raw)
    expect(result.format).toBe('whatsapp_export')
    expect(result.messages).toBe(4)
    expect(result.transcripts[0]).toContain('CLIENTE: Hola, vi el anuncio de Portacelli')
    expect(result.transcripts[0]).toContain('EQUIPO: ¡Hola Carlos! Qué bueno que te interesó')
  })

  it('reconoce el formato con guion (Android) y fechas DD/MM/YYYY', () => {
    const raw = [
      '12/05/2026, 10:31 - Cliente Nuevo: Buenas tardes',
      '12/05/2026, 10:32 - Grupo Terranova: ¡Buenas! ¿En qué proyecto andas interesado?',
      '12/05/2026, 10:33 - Cliente Nuevo: en foresta',
    ].join('\n')
    const result = parseTrainingText(raw)
    expect(result.format).toBe('whatsapp_export')
    expect(result.transcripts[0]).toContain('EQUIPO: ¡Buenas!')
  })

  it('filtra mensajes de sistema (cifrado, multimedia omitida)', () => {
    const raw = [
      '[12/5/26, 10:30:00 AM] Sistema: Los mensajes y las llamadas están cifrados de extremo a extremo.',
      '[12/5/26, 10:31:04 AM] Carlos: Hola',
      '[12/5/26, 10:31:30 AM] Carlos: <Multimedia omitido>',
      '[12/5/26, 10:32:11 AM] Daniela: Hola Carlos',
      '[12/5/26, 10:33:00 AM] Carlos: me interesa',
    ].join('\n')
    const result = parseTrainingText(raw)
    expect(result.transcripts[0]).not.toContain('cifrados')
    expect(result.transcripts[0]).not.toContain('Multimedia')
    expect(result.messages).toBe(3)
  })

  it('une líneas de continuación al mensaje anterior', () => {
    const raw = [
      '[12/5/26, 10:31:04 AM] Carlos: Hola tengo una pregunta',
      'sobre los precios de Foresta',
      '[12/5/26, 10:32:11 AM] Daniela: Claro, cuéntame',
      '[12/5/26, 10:33:00 AM] Carlos: gracias',
    ].join('\n')
    const result = parseTrainingText(raw)
    expect(result.transcripts[0]).toContain('Hola tengo una pregunta\nsobre los precios de Foresta')
  })
})

describe('parseTrainingText — formato simple', () => {
  it('parsea líneas CLIENTE:/EQUIPO:', () => {
    const raw = [
      'CLIENTE: está muy caro',
      'EQUIPO: te entiendo, es una inversión importante. Con financiamiento la entrada queda accesible',
      'CLIENTE: mmm ok cuéntame más',
    ].join('\n')
    const result = parseTrainingText(raw)
    expect(result.format).toBe('simple')
    expect(result.messages).toBe(3)
    expect(result.transcripts[0]).toContain('CLIENTE: está muy caro')
    expect(result.transcripts[0]).toContain('EQUIPO: te entiendo')
  })

  it('acepta DANIELA:/ASESOR: como equipo', () => {
    const raw = 'CLIENTE: hola\nDANIELA: buenas, soy Daniela de Grupo Terranova'
    const result = parseTrainingText(raw)
    expect(result.format).toBe('simple')
    expect(result.transcripts[0]).toContain('EQUIPO: buenas, soy Daniela')
  })
})

describe('parseTrainingText — texto libre', () => {
  it('sin estructura reconocible devuelve un transcript crudo', () => {
    const raw = 'El cliente preguntó por financiamiento y le explicamos el plan de pagos con 20% de prima.'
    const result = parseTrainingText(raw)
    expect(result.format).toBe('raw')
    expect(result.transcripts).toHaveLength(1)
    expect(result.transcripts[0]).toBe(raw)
  })

  it('texto vacío → sin transcripts', () => {
    expect(parseTrainingText('   \n  ').transcripts).toHaveLength(0)
  })
})

describe('chunkTranscript', () => {
  it('no corta transcripts que caben', () => {
    expect(chunkTranscript('corto', 100)).toEqual(['corto'])
  })

  it('corta por líneas sin partir mensajes', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `CLIENTE: mensaje número ${i} con algo de contenido`)
    const chunks = chunkTranscript(lines.join('\n'), 500)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500)
      // Cada chunk empieza en el inicio de un mensaje, no a mitad
      expect(chunk.startsWith('CLIENTE:')).toBe(true)
    }
    // No se pierde contenido
    expect(chunks.join('\n')).toBe(lines.join('\n'))
  })
})
