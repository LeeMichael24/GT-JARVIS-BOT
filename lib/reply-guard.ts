/**
 * Red de seguridad para los lineamientos que el prompt solo no garantiza.
 *
 * 13-sep-2026, prueba real en producción: "Perfecto, si tienes cualquier otra
 * pregunta o necesitas más información, estoy aquí para ayudarte. Quedamos en
 * comunicación." — una frase de call center que el bloque de frases prohibidas
 * nombra explícitamente. En un prompt de ~17K tokens la regla pesa poco; esto
 * la saca antes de que llegue al cliente.
 *
 * Se quita la ORACIÓN completa: cortar a mitad deja frases rotas.
 */
const PROHIBIDAS: RegExp[] = [
  /\bestoy aqu[ií] para\b/i,
  /\bno dudes? en\b/i,
  /\ben qu[eé] (m[aá]s )?(te |le )?(puedo|podemos) (ayudar|asistir|servir)/i,
  /\bes un placer atender(te|le)\b/i,
  /\bapreciamos (tu|su) preferencia\b/i,
  /\b(tu|su) consulta es importante\b/i,
]

// Promesas de garantía: prohibidas por marca y riesgosas en inversión. El aviso
// "(no garantizado)" / "no está garantizado" es obligatorio y se conserva.
const PROMESA = /\bgarantiz/i
const AVISO_NO_GARANTIZADO = /\bno\s+(est[aá]\s+|es\s+|son\s+|queda\s+)?garantiz/i

function esProhibida(oracion: string): boolean {
  if (PROHIBIDAS.some(re => re.test(oracion))) return true
  return PROMESA.test(oracion) && !AVISO_NO_GARANTIZADO.test(oracion)
}

export function limpiarFrasesProhibidas(texto: string): string {
  let quitoAlgo = false
  const lineas = texto.split('\n').map(linea => {
    const oraciones = linea.split(/(?<=[.!?…])\s+/)
    const quedan = oraciones.filter(o => !esProhibida(o))
    if (quedan.length !== oraciones.length) quitoAlgo = true
    return quedan.join(' ')
  })
  if (!quitoAlgo) return texto
  const limpio = lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  // Si el mensaje entero era la frase prohibida, mejor eso que dejar al
  // cliente sin respuesta
  return limpio || texto
}
