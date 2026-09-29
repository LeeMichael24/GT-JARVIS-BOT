/**
 * Detectores y referencias de la batería visual. Viven aparte del arnés (que
 * corre con el modelo real) para probarse en la suite normal: la vara de medir
 * también tiene que estar probada.
 */

const MATERIAL = '(?:brochure|video|videos|plano|planos|ficha|foto|fotos|imagen|imágenes|imagenes|link|enlace|ubicaci[oó]n|pdf|lista|render|renders|documento)'

/**
 * Promesa de un ARCHIVO en el texto ("te lo envío", "se lo comparto", "le paso
 * el video"). "Le paso su caso al equipo" es una gestión, no un archivo: con
 * "paso/pasaré" solo cuenta si lo pasado es material (falso positivo de C4,
 * 29-sep-2026).
 */
export const PROMESA_MATERIAL = new RegExp(
  [
    // verbos de envío, con o sin objeto
    String.raw`\b(?:te|le|se lo|se la|ya te|ya le|ahorita te|ahorita le)\s+(?:lo\s+|la\s+|los\s+|las\s+)?(?:env[íi]o|enviar[ée]|mando|mandar[ée]|comparto|compartir[ée]|adjunto)\b`,
    // "paso/pasaré" + material explícito: "le paso el video"
    String.raw`\b(?:te|le|ya te|ya le|ahorita te|ahorita le)\s+(?:paso|pasar[ée])\s+(?:ahora\s+|ya\s+)?(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?${MATERIAL}\b`,
    // "te lo paso"
    String.raw`\b(?:te|le)\s+(?:lo|la|los|las)\s+(?:paso|pasar[ée])\b`,
    String.raw`\baqu[íi]\s+(?:te|le)\s+(?:va|dejo|comparto)\b`,
  ].join('|'),
  'i',
)

/**
 * Cuentas verificadas a mano (29-sep-2026). Se le dan al juez para que no marque
 * como "error de cálculo" una cuenta correcta: en V6 y E1 lo hizo dos veces.
 */
export const CIFRAS_DE_REFERENCIA = `CIFRAS VERIFICADAS (no las marques como error si la respuesta coincide con ellas):
- Apartamento 101 m², precio de lista $252,500. Prima total 15% = $37,875. 3% = $7,575; menos la reserva de $3,000 quedan $4,575 a la firma de la promesa. 12% restante = $30,300 en hasta 24 cuotas de $1,262.50. Con 3% de descuento por prima de contado: $244,925.
- Casa lote 5B, $599,999, reserva $5,000. 3% = $18,000; menos la reserva quedan $13,000 a la firma. 12% restante = $72,000 en hasta 24 cuotas de $3,000.
Si una cifra de la respuesta NO coincide con estas y no puedes derivarla de ellas, entonces sí repórtala.`

// Empuje a cita: modalidad o momento concreto, no "¿le interesa conocerlo?"
const CITA = /\b(visita|visitar|cita|reuni[óo]n|videollamada|video llamada|virtual|zoom|meet|recorrido|tour|sala de ventas|showroom)\b/i
const CITA_CONCRETA = /\b(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo|ma[ñn]ana|pasado ma[ñn]ana|esta semana|pr[óo]xima semana|\d{1,2}\s?(am|pm|:\d{2}))\b/i
// "¿Le queda sábado o domingo?" — ofrece opciones aunque no diga "visita"
const OFRECE_OPCIONES = /\b(le|te)\s+(queda|acomoda|sirve|va mejor)\b[^?]*\bo\b[^?]*\?|\btengo\b[^.?]*\bo\b[^.?]*\d{1,2}\s?(am|pm|:\d{2}|p\. ?m\.|a\. ?m\.)/i

export const pideCita = (texto: string): boolean => CITA.test(texto)

/** Propone un día o franja concretos: con la palabra de cita, o como opciones cerradas. */
export function esCitaConcreta(texto: string): boolean {
  if (!CITA_CONCRETA.test(texto)) return false
  // "Los precios cambian el jueves 30" no es una propuesta: hace falta cita u opciones
  return CITA.test(texto) || OFRECE_OPCIONES.test(texto)
}
