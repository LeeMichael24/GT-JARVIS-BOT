export const WA_WINDOW_MS = 24 * 60 * 60 * 1000

// Meta solo permite texto libre dentro de las 24h posteriores al último
// mensaje del CLIENTE. Fuera de la ventana se requiere plantilla (Fase 5).
export function isWithin24h(lastUserMessageAt: string | null, nowMs = Date.now()): boolean {
  if (!lastUserMessageAt) return false
  const last = Date.parse(lastUserMessageAt)
  if (Number.isNaN(last)) return false
  return nowMs - last < WA_WINDOW_MS
}
