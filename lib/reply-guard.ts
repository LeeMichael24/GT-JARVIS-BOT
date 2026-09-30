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

/**
 * "Fíjate que" / "Fíjese que" una vez suena humano; en cada mensaje suena a
 * robot. 30-sep-2026: 5 de 6 respuestas seguidas a un mismo cliente empezaban
 * así. Si ya lo dijo en la conversación, se quita del arranque de la oración
 * (el resto de la frase se conserva y se capitaliza).
 */
const MULETILLA = /(^|[.!?…]\s+|\n)(f[ií]j(?:ate|ese)\s+(?:que\s+)?(?:,\s*)?)(\S)/gi

export function quitarMuletillaRepetida(texto: string, anteriores: string[]): string {
  const yaLaUso = anteriores.some(t => /\bf[ií]j(ate|ese)\s+que\b/i.test(t))
  let usada = yaLaUso
  return texto.replace(MULETILLA, (todo, antes: string, _m: string, letra: string) => {
    // La primera vez en toda la charla se respeta; de ahí en adelante, fuera
    if (!usada) { usada = true; return todo }
    return antes + letra.toUpperCase()
  })
}
