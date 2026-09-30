import { getServiceClient } from '@/lib/supabase'
import type { SolicitudInmueble } from '@/types'

/**
 * SOLICITUDES DE INMUEBLES — oportunidades que no son el catálogo.
 *
 *   captacion: un propietario quiere vender o rentar su inmueble con nosotros
 *   busqueda:  un cliente busca algo que no tenemos, después de ofrecerle
 *              primero nuestros proyectos
 *
 * Daniela va llenando `solicitud` en su JSON con todo lo que sabe hasta ese
 * turno; aquí se guarda (una solicitud abierta por cliente y tipo) y el equipo
 * recibe UN aviso cuando la solicitud tiene lo mínimo para trabajarla.
 */

const TIPOS = ['captacion', 'busqueda'] as const
const OPERACIONES = ['venta', 'alquiler'] as const
const CAMPOS_TEXTO = ['tipo_inmueble', 'zona', 'presupuesto', 'caracteristicas', 'plazo', 'notas'] as const

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && !/^(null|n\/a|desconocido|pendiente)$/i.test(t) ? t.slice(0, 400) : null
}

/** Del JSON del modelo a una solicitud válida, o null. Nunca lanza. */
export function parseSolicitud(raw: unknown): SolicitudInmueble | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!TIPOS.includes(r.tipo as typeof TIPOS[number])) return null
  const s: SolicitudInmueble = {
    tipo: r.tipo as SolicitudInmueble['tipo'],
    operacion: OPERACIONES.includes(r.operacion as typeof OPERACIONES[number]) ? (r.operacion as SolicitudInmueble['operacion']) : null,
    tipo_inmueble: null, zona: null, presupuesto: null, caracteristicas: null, plazo: null, notas: null,
  }
  for (const c of CAMPOS_TEXTO) s[c] = texto(r[c])
  return s
}

/**
 * Lo mínimo para que el equipo pueda trabajarla. En una búsqueda sin
 * presupuesto no se puede proponer nada; un propietario puede no saber aún
 * cuánto pedir, y eso lo ve el equipo con él.
 */
export function solicitudCompleta(s: SolicitudInmueble): boolean {
  const base = !!(s.operacion && s.tipo_inmueble && s.zona)
  return s.tipo === 'busqueda' ? base && !!s.presupuesto : base
}

/** Lo nuevo completa lo guardado; un campo que el modelo deja en null no borra lo que ya se sabía. */
export function combinarSolicitud(previa: SolicitudInmueble | null, nueva: SolicitudInmueble): SolicitudInmueble {
  if (!previa) return nueva
  const out = { ...previa }
  if (nueva.operacion) out.operacion = nueva.operacion
  for (const c of CAMPOS_TEXTO) if (nueva[c]) out[c] = nueva[c]
  return out
}

export function describirSolicitud(s: SolicitudInmueble): string {
  const titulo = s.tipo === 'captacion'
    ? `Propietario quiere ${s.operacion === 'alquiler' ? 'RENTAR' : 'VENDER'} su inmueble con nosotros`
    : `Cliente busca ${s.operacion === 'alquiler' ? 'RENTAR' : 'COMPRAR'} algo que no está en el catálogo`
  const lineas = [
    titulo,
    s.tipo_inmueble ? `Inmueble: ${s.tipo_inmueble}` : null,
    s.zona ? `Zona: ${s.zona}` : null,
    s.presupuesto ? `${s.tipo === 'captacion' ? 'Precio que espera' : 'Presupuesto'}: ${s.presupuesto}` : null,
    s.caracteristicas ? `Características: ${s.caracteristicas}` : null,
    s.plazo ? `Plazo: ${s.plazo}` : null,
    s.notas ? `Notas: ${s.notas}` : null,
  ]
  return lineas.filter(Boolean).join('\n')
}

export interface ResultadoSolicitud {
  solicitud: SolicitudInmueble
  completa: boolean
  /** true si hay que avisar al equipo AHORA (completa y todavía no avisada) */
  avisar: boolean
  id: string | null
}

type FilaSolicitud = SolicitudInmueble & { id: string; notificada_en: string | null }

/**
 * Guarda o completa la solicitud abierta del cliente. Si la tabla no existe
 * (migración 024 sin aplicar), igual devuelve si hay que avisar: la
 * oportunidad no se pierde, solo no queda la fila.
 */
export async function registrarSolicitud(leadId: string, nueva: SolicitudInmueble): Promise<ResultadoSolicitud> {
  const db = getServiceClient()
  const { data: previa, error: errLeer } = await db
    .from('solicitudes_inmuebles')
    .select('*')
    .eq('lead_id', leadId)
    .eq('tipo', nueva.tipo)
    .in('estado', ['nueva', 'en_proceso'])
    .maybeSingle()

  if (errLeer) {
    console.warn('[solicitudes] tabla no disponible — aviso sin guardar:', errLeer.message)
    const completa = solicitudCompleta(nueva)
    return { solicitud: nueva, completa, avisar: completa, id: null }
  }

  const fila = previa as FilaSolicitud | null
  const solicitud = combinarSolicitud(fila, nueva)
  const completa = solicitudCompleta(solicitud)
  const avisar = completa && !fila?.notificada_en
  const valores = {
    operacion: solicitud.operacion,
    tipo_inmueble: solicitud.tipo_inmueble,
    zona: solicitud.zona,
    presupuesto: solicitud.presupuesto,
    caracteristicas: solicitud.caracteristicas,
    plazo: solicitud.plazo,
    notas: solicitud.notas,
    actualizado_en: new Date().toISOString(),
  }

  if (fila) {
    const { error } = await db.from('solicitudes_inmuebles').update(valores).eq('id', fila.id)
    if (error) console.warn('[solicitudes] no se pudo actualizar:', error.message)
    return { solicitud, completa, avisar, id: fila.id }
  }
  const { data, error } = await db
    .from('solicitudes_inmuebles')
    .insert({ lead_id: leadId, tipo: solicitud.tipo, ...valores })
    .select('id')
    .single()
  if (error) console.warn('[solicitudes] no se pudo guardar:', error.message)
  return { solicitud, completa, avisar, id: (data as { id: string } | null)?.id ?? null }
}

export async function marcarNotificada(id: string | null): Promise<void> {
  if (!id) return
  await getServiceClient().from('solicitudes_inmuebles').update({ notificada_en: new Date().toISOString() }).eq('id', id)
}
