/**
 * Calendario ya resuelto para que Daniela proponga citas sin calcular días de
 * la semana. Siempre en la zona horaria de El Salvador (UTC-6, sin horario de
 * verano): a las 21:54 locales el servidor (UTC) ya está en el día siguiente.
 */
const TZ = 'America/El_Salvador'

function partes(fecha: Date): { dia: string; numero: string; mes: string } {
  const p = new Intl.DateTimeFormat('es-SV', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
    .formatToParts(fecha)
  const get = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return { dia: get('weekday'), numero: get('day'), mes: get('month') }
}

const DIA_MS = 24 * 60 * 60 * 1000

/** "hoy lunes 28 de septiembre; mañana martes 29 de septiembre; miércoles 30 de septiembre; …" */
export function calendarioProximo(ahora: Date, dias = 8): string {
  return Array.from({ length: dias }, (_, i) => {
    const { dia, numero, mes } = partes(new Date(ahora.getTime() + i * DIA_MS))
    const etiqueta = i === 0 ? 'hoy ' : i === 1 ? 'mañana ' : ''
    return `${etiqueta}${dia} ${numero} de ${mes}`
  }).join('; ')
}

/** "21:54" — hora local de El Salvador en 24 h */
export function horaActualSV(ahora: Date): string {
  return new Intl.DateTimeFormat('es-SV', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(ahora)
}
