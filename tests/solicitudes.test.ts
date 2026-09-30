import { describe, it, expect } from 'vitest'
import { parseSolicitud, solicitudCompleta, combinarSolicitud, describirSolicitud } from '@/lib/solicitudes'
import { parseClaudeResponse } from '@/services/claude/client'
import { buildSystemPrompt } from '@/services/claude/prompts'

describe('solicitudes de inmuebles', () => {
  it('parse: tipo inválido o ausente = null; "null" en texto cuenta como vacío', () => {
    expect(parseSolicitud(null)).toBeNull()
    expect(parseSolicitud({ tipo: 'otro' })).toBeNull()
    const s = parseSolicitud({ tipo: 'captacion', operacion: 'venta', tipo_inmueble: 'casa', zona: 'null', presupuesto: 'N/A' })!
    expect(s.zona).toBeNull()
    expect(s.presupuesto).toBeNull()
    expect(parseSolicitud({ tipo: 'busqueda', operacion: 'rentar' })!.operacion).toBeNull()
  })

  it('completa: captación con operación, inmueble y zona; búsqueda además con presupuesto', () => {
    const cap = parseSolicitud({ tipo: 'captacion', operacion: 'venta', tipo_inmueble: 'casa', zona: 'Santa Tecla' })!
    expect(solicitudCompleta(cap)).toBe(true)
    const bus = parseSolicitud({ tipo: 'busqueda', operacion: 'alquiler', tipo_inmueble: 'apartamento', zona: 'Escalón' })!
    expect(solicitudCompleta(bus)).toBe(false)
    expect(solicitudCompleta({ ...bus, presupuesto: 'hasta $900/mes' })).toBe(true)
  })

  it('combinar: lo nuevo completa, un null del modelo no borra lo ya sabido', () => {
    const previa = parseSolicitud({ tipo: 'busqueda', operacion: 'alquiler', zona: 'Escalón', presupuesto: '$900' })!
    const nueva = parseSolicitud({ tipo: 'busqueda', tipo_inmueble: 'apartamento' })!
    const c = combinarSolicitud(previa, nueva)
    expect(c).toMatchObject({ operacion: 'alquiler', zona: 'Escalón', presupuesto: '$900', tipo_inmueble: 'apartamento' })
  })

  it('describir: el equipo sabe de un vistazo si es captación o búsqueda', () => {
    const cap = parseSolicitud({ tipo: 'captacion', operacion: 'alquiler', tipo_inmueble: 'apartamento', zona: 'San Benito', presupuesto: '$1,200/mes' })!
    expect(describirSolicitud(cap)).toContain('Propietario quiere RENTAR')
    expect(describirSolicitud(cap)).toContain('Precio que espera: $1,200/mes')
    const bus = parseSolicitud({ tipo: 'busqueda', operacion: 'venta', tipo_inmueble: 'terreno', zona: 'Costa del Sol' })!
    expect(describirSolicitud(bus)).toContain('Cliente busca COMPRAR')
  })

  it('la respuesta del modelo trae la solicitud parseada', () => {
    const r = parseClaudeResponse(JSON.stringify({ reply: 'Con gusto', solicitud: { tipo: 'captacion', operacion: 'venta', tipo_inmueble: 'casa' } }))
    expect(r.solicitud?.tipo).toBe('captacion')
    expect(parseClaudeResponse(JSON.stringify({ reply: 'Hola' })).solicitud).toBeNull()
  })

  it('el prompt explica los dos casos y que primero van nuestros proyectos', () => {
    const lead = { id: 'l', phone: '1', name: null, stage: 'new', project_interest: null, qualification_data: null, bot_active: true } as never
    const p = buildSystemPrompt({ lead, project: null })
    expect(p).toContain('SOLICITUDES DE INMUEBLES')
    expect(p).toContain('PRIMERO nuestros proyectos')
    expect(p).toContain('"solicitud": null')
  })
})
