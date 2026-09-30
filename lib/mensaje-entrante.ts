import type { ParsedWebhook } from '@/types'
import { sanitizarEntrada } from '@/lib/armadura'

/**
 * QUÉ DIJO EL CLIENTE — cada tipo de mensaje de WhatsApp convertido en texto
 * que Daniela entiende. Antes solo se atendían texto, audio y botones: una
 * ubicación, un documento, un video o un contacto quedaban en visto, y una
 * foto llegaba como "[El cliente envió una imagen]".
 *
 * Lo que escribió el cliente pasa por la armadura (recorte, invisibles, notas
 * falsas); las notas entre corchetes las arma el sistema.
 */

export interface DepsEntrante {
  descargar: (mediaId: string) => Promise<{ buffer: Buffer; mimeType: string }>
  transcribir: (buffer: Buffer, mimeType: string) => Promise<string>
  describirImagen: (buffer: Buffer, mimeType: string) => Promise<string>
  /** Texto del mensaje que el cliente citó al responder */
  buscarCitado: (waMessageId: string) => Promise<{ role: string; content: string } | null>
}

/** Tipos que se guardan y se contestan. Una reacción del cliente no se contesta: nadie responde a un 👍. */
export function esAtendible(p: ParsedWebhook): boolean {
  switch (p.messageType) {
    case 'text':
    case 'interactive':
      return !!p.body.trim()
    case 'audio':
    case 'image':
    case 'video':
    case 'document':
    case 'sticker':
      return !!p.mediaId
    case 'location':
      return !!p.location
    case 'contacts':
      return !!p.contacts?.length
    default:
      return false
  }
}

const pie = (p: ParsedWebhook) => (p.caption ? `\nPie de foto del cliente: ${sanitizarEntrada(p.caption)}` : '')

export async function resolverCuerpo(p: ParsedWebhook, deps: DepsEntrante): Promise<string> {
  let cuerpo: string
  switch (p.messageType) {
    case 'audio': {
      try {
        const { buffer, mimeType } = await deps.descargar(p.mediaId!)
        cuerpo = sanitizarEntrada(await deps.transcribir(buffer, mimeType))
      } catch (err) {
        console.error('[entrante] No se pudo transcribir el audio:', err instanceof Error ? err.message : err)
        cuerpo = '[Nota de voz, no se pudo transcribir]'
      }
      break
    }
    case 'image': {
      try {
        const { buffer, mimeType } = await deps.descargar(p.mediaId!)
        cuerpo = `[Foto del cliente: ${await deps.describirImagen(buffer, mimeType)}]`
      } catch (err) {
        console.error('[entrante] No se pudo ver la foto:', err instanceof Error ? err.message : err)
        cuerpo = '[El cliente envió una foto que no se pudo abrir]'
      }
      cuerpo += pie(p)
      break
    }
    case 'video':
      cuerpo = '[El cliente envió un video (no puedes verlo)]' + pie(p)
      break
    case 'document':
      cuerpo = `[El cliente envió un documento${p.filename ? `: ${sanitizarEntrada(p.filename)}` : ''} (no puedes abrirlo)]` + pie(p)
      break
    case 'sticker':
      cuerpo = '[El cliente envió un sticker]'
      break
    case 'location': {
      const l = p.location!
      const lugar = [l.name, l.address].filter(Boolean).map(t => sanitizarEntrada(t!)).join(', ')
      cuerpo = `[El cliente compartió una ubicación: ${lugar ? lugar + ' ' : ''}(${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}) https://maps.google.com/?q=${l.latitude},${l.longitude}]`
      break
    }
    case 'contacts': {
      const lista = (p.contacts ?? []).map(c => [c.name, c.phone].filter(Boolean).map(t => sanitizarEntrada(t!)).join(' ')).join('; ')
      cuerpo = `[El cliente compartió un contacto: ${lista}. Puede ser un referido]`
      break
    }
    default:
      cuerpo = sanitizarEntrada(p.body)
  }

  // Respondió citando un mensaje: sin esto Daniela no sabe a qué "sí" se refiere
  if (p.contextId) {
    try {
      const citado = await deps.buscarCitado(p.contextId)
      if (citado) {
        const quien = citado.role === 'user' ? 'su propio mensaje' : 'tu mensaje'
        cuerpo = `[Respondiendo a ${quien}: "${citado.content.replace(/\s+/g, ' ').slice(0, 160)}"]\n${cuerpo}`
      }
    } catch {
      // Sin la cita el mensaje igual se entiende casi siempre
    }
  }
  return cuerpo
}
